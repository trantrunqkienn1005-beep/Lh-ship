-- LH Ship: run this entire file once in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '', phone text not null default '', email text not null default '',
  role text not null default 'pending' check (role in ('customer','shipper_internal','shipper_freelance','admin','pending')),
  requested_role text not null default 'customer' check (requested_role in ('customer','shipper_internal','shipper_freelance')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','disabled')),
  avatar_url text, vehicle_plate text, vehicle_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key,
  order_name text not null, photo_urls text[] not null default '{}', note text not null default '',
  customer_id uuid not null references public.profiles(id), customer_name text not null,
  recipient_name text not null, pickup_address text not null, delivery_address text not null,
  distance_km numeric not null check (distance_km > 0), delivery_fee integer not null check (delivery_fee >= 0),
  payment_method text not null check (payment_method in ('COD','BANK_TRANSFER')),
  cod_amount integer not null default 0, status text not null default 'open' check (status in ('open','accepted','delivering','completed','cancelled')),
  driver_id uuid references public.profiles(id), driver_name text, driver_phone text, driver_avatar_url text, driver_vehicle_plate text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint max_three_photos check (cardinality(photo_urls) <= 3)
);

create table if not exists public.order_private (
  order_id text primary key references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id), customer_phone text not null, recipient_phone text not null,
  created_at timestamptz not null default now()
);

create index if not exists orders_customer_created_idx on public.orders(customer_id, created_at desc);
create index if not exists orders_driver_created_idx on public.orders(driver_id, created_at desc);
create index if not exists orders_status_created_idx on public.orders(status, created_at desc);

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, name, phone, email, requested_role, role, status)
  values (new.id, coalesce(new.raw_user_meta_data->>'name',''), coalesce(new.raw_user_meta_data->>'phone',''), coalesce(new.email,''),
    case when new.raw_user_meta_data->>'requested_role' in ('shipper_internal','shipper_freelance') then new.raw_user_meta_data->>'requested_role' else 'customer' end,
    'pending','pending') on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created_lhship on auth.users;
create trigger on_auth_user_created_lhship after insert on auth.users for each row execute procedure public.create_profile_for_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'approved');
$$;

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_private enable row level security;

drop policy if exists "profiles read self or admin" on public.profiles;
create policy "profiles read self or admin" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles update self driver fields" on public.profiles;
create policy "profiles update self driver fields" on public.profiles for update to authenticated using (id = auth.uid() and status = 'approved' and role in ('shipper_internal','shipper_freelance')) with check (id = auth.uid() and status = 'approved' and role in ('shipper_internal','shipper_freelance'));
drop policy if exists "admin update profiles" on public.profiles;
create policy "admin update profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read relevant orders" on public.orders;
create policy "read relevant orders" on public.orders for select to authenticated using (
  public.is_admin() or customer_id = auth.uid() or driver_id = auth.uid() or
  (status = 'open' and exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role in ('shipper_internal','shipper_freelance')))
);
drop policy if exists "customer create own order" on public.orders;
create policy "customer create own order" on public.orders for insert to authenticated with check (
  customer_id = auth.uid() and exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.role = 'customer')
);

drop policy if exists "read private order details" on public.order_private;
create policy "read private order details" on public.order_private for select to authenticated using (
  customer_id = auth.uid() or public.is_admin() or exists(select 1 from public.orders o where o.id = order_id and o.driver_id = auth.uid())
);
drop policy if exists "customer insert private order details" on public.order_private;
create policy "customer insert private order details" on public.order_private for insert to authenticated with check (customer_id = auth.uid() and exists(select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));

create or replace function public.accept_order(p_order_id text)
returns void language plpgsql security definer set search_path = public as $$
declare p public.profiles%rowtype;
begin
  select * into p from public.profiles where id = auth.uid() and status = 'approved' and role in ('shipper_internal','shipper_freelance');
  if not found then raise exception 'Tài khoản không có quyền nhận đơn'; end if;
  update public.orders set status='accepted', driver_id=p.id, driver_name=p.name, driver_phone=p.phone, driver_avatar_url=p.avatar_url, driver_vehicle_plate=p.vehicle_plate, updated_at=now()
  where id=p_order_id and status='open' and driver_id is null;
  if not found then raise exception 'Đơn hàng đã được người khác nhận hoặc không còn mở'; end if;
end; $$;

create or replace function public.change_order_status(p_order_id text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('delivering','completed') then raise exception 'Trạng thái không hợp lệ'; end if;
  update public.orders set status=p_status, updated_at=now()
  where id=p_order_id and driver_id=auth.uid() and ((p_status='delivering' and status='accepted') or (p_status='completed' and status='delivering'));
  if not found then raise exception 'Không thể cập nhật trạng thái đơn hàng'; end if;
end; $$;

create or replace function public.approve_user(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Chỉ Admin mới được duyệt tài khoản'; end if;
  if p_role not in ('customer','shipper_internal','shipper_freelance') then raise exception 'Vai trò không hợp lệ'; end if;
  update public.profiles set role=p_role, status='approved' where id=p_user_id and status='pending';
  if not found then raise exception 'Không tìm thấy tài khoản chờ duyệt'; end if;
end; $$;

grant execute on function public.accept_order(text) to authenticated;
grant execute on function public.change_order_status(text,text) to authenticated;
grant execute on function public.approve_user(uuid,text) to authenticated;

-- Storage: create a PRIVATE bucket named lh-ship-files in Storage > Buckets.
-- Policies below allow an owner to upload, and only order participants/Admin to read order images.
drop policy if exists "lhship upload own files" on storage.objects;
create policy "lhship upload own files" on storage.objects for insert to authenticated with check (
  bucket_id='lh-ship-files' and ( (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text
    or (storage.foldername(name))[1] = 'orders' and (storage.foldername(name))[2] = auth.uid()::text )
);
drop policy if exists "lhship read permitted files" on storage.objects;
create policy "lhship read permitted files" on storage.objects for select to authenticated using (
  bucket_id='lh-ship-files' and (
    owner_id = auth.uid()::text or public.is_admin() or ((storage.foldername(name))[1]='users' and (storage.foldername(name))[2]=auth.uid()::text) or
    ((storage.foldername(name))[1]='orders' and exists(select 1 from public.orders o where o.id=(storage.foldername(name))[3] and (o.customer_id=auth.uid() or o.driver_id=auth.uid() or (o.status='open' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='approved' and p.role in ('shipper_internal','shipper_freelance')))))
  )
);

drop policy if exists "lhship update own files" on storage.objects;
create policy "lhship update own files" on storage.objects for update to authenticated using (
  bucket_id='lh-ship-files' and owner_id=auth.uid()::text
) with check (bucket_id='lh-ship-files' and owner_id=auth.uid()::text);
