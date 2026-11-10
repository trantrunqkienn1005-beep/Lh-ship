import { supabase } from './supabase';
import { DeliveryOrder, UserProfile } from './types';

const orderSelect = '*, order_private(customer_phone,recipient_phone)';
function normalizeOrder(row: any): DeliveryOrder {
  const privateRow = Array.isArray(row.order_private) ? row.order_private[0] : row.order_private;
  return {
    id: row.id, orderName: row.order_name, photoUrls: row.photo_urls || [], note: row.note || '',
    customerId: row.customer_id, customerName: row.customer_name, customerPhone: privateRow?.customer_phone || '',
    recipientName: row.recipient_name, recipientPhone: privateRow?.recipient_phone || '',
    pickupAddress: row.pickup_address, deliveryAddress: row.delivery_address, distanceKm: Number(row.distance_km),
    deliveryFee: Number(row.delivery_fee), paymentMethod: row.payment_method, codAmount: Number(row.cod_amount || 0),
    status: row.status, driverId: row.driver_id, driverName: row.driver_name, driverPhone: row.driver_phone,
    driverAvatarUrl: row.driver_avatar_url, driverVehiclePlate: row.driver_vehicle_plate,
    createdAt: row.created_at, updatedAt: row.updated_at
  } as DeliveryOrder;
}

export async function uploadPhoto(uri: string, path: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const { error } = await supabase.storage.from('lh-ship-files').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data, error: signError } = await supabase.storage.from('lh-ship-files').createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signError) throw signError;
  return data.signedUrl;
}

export async function createOrder(data: any, photoUris: string[]) {
  if (photoUris.length > 3) throw new Error('Chỉ được tải tối đa 3 ảnh.');
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const photoUrls = await Promise.all(photoUris.map((uri, i) => uploadPhoto(uri, `orders/${data.customerId}/${id}/${i}.jpg`)));
  const { customerPhone, recipientPhone, ...publicData } = data;
  const { error } = await supabase.from('orders').insert({
    id, order_name: publicData.orderName, note: publicData.note, customer_id: publicData.customerId,
    customer_name: publicData.customerName, recipient_name: publicData.recipientName,
    pickup_address: publicData.pickupAddress, delivery_address: publicData.deliveryAddress,
    distance_km: publicData.distanceKm, delivery_fee: publicData.deliveryFee,
    payment_method: publicData.paymentMethod, cod_amount: publicData.codAmount,
    photo_urls: photoUrls, status: 'open'
  });
  if (error) throw error;
  const { error: privateError } = await supabase.from('order_private').insert({ order_id: id, customer_id: data.customerId, customer_phone: customerPhone, recipient_phone: recipientPhone });
  if (privateError) throw privateError;
}

function watchOrders(filter: (q: any) => any, callback: (orders: DeliveryOrder[]) => void) {
  let alive = true;
  const load = async () => {
    let q = supabase.from('orders').select(orderSelect).order('created_at', { ascending: false });
    q = filter(q);
    const { data, error } = await q;
    if (!error && alive) callback((data || []).map(normalizeOrder));
  };
  load();
  const channel = supabase.channel(`orders-${Math.random().toString(36).slice(2)}`).on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load).subscribe();
  return () => { alive = false; supabase.removeChannel(channel); };
}
export function watchOpenOrders(cb: (o: DeliveryOrder[]) => void) { return watchOrders(q => q.eq('status', 'open'), cb); }
export function watchMyOrders(uid: string, cb: (o: DeliveryOrder[]) => void) { return watchOrders(q => q.eq('customer_id', uid), cb); }
export function watchDriverOrders(uid: string, cb: (o: DeliveryOrder[]) => void) { return watchOrders(q => q.eq('driver_id', uid), cb); }
export function watchAllOrders(cb: (o: DeliveryOrder[]) => void) { return watchOrders(q => q, cb); }

export function watchPendingUsers(callback: (users: UserProfile[]) => void) {
  let alive = true;
  const load = async () => {
    const { data, error } = await supabase.from('profiles').select('*').eq('status', 'pending').order('created_at');
    if (!error && alive) callback((data || []).map(mapProfile));
  };
  load();
  const channel = supabase.channel('pending-profiles').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load).subscribe();
  return () => { alive = false; supabase.removeChannel(channel); };
}
export function mapProfile(row: any): UserProfile { return { uid: row.id, name: row.name, phone: row.phone, email: row.email, role: row.role, status: row.status, requestedRole: row.requested_role, avatarUrl: row.avatar_url, vehiclePlate: row.vehicle_plate, vehicleType: row.vehicle_type }; }
export function watchProfile(uid: string, callback: (profile: UserProfile | null) => void) {
  let alive = true;
  const load = async () => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (!error && alive) callback(data ? mapProfile(data) : null);
  };
  load();
  const channel = supabase.channel(`profile-${uid}`).on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, load).subscribe();
  return () => { alive = false; supabase.removeChannel(channel); };
}
export async function acceptOrder(orderId: string) { const { error } = await supabase.rpc('accept_order', { p_order_id: orderId }); if (error) throw error; }
export async function changeOrderStatus(orderId: string, status: 'delivering' | 'completed') { const { error } = await supabase.rpc('change_order_status', { p_order_id: orderId, p_status: status }); if (error) throw error; }
export async function approveUser(uid: string, role: string) { const { error } = await supabase.rpc('approve_user', { p_user_id: uid, p_role: role }); if (error) throw error; }
export async function updateDriverProfile(uid: string, data: { avatarUrl: string; vehiclePlate: string; vehicleType: string }) {
  const { error } = await supabase.from('profiles').update({ avatar_url: data.avatarUrl, vehicle_plate: data.vehiclePlate, vehicle_type: data.vehicleType }).eq('id', uid);
  if (error) throw error;
}
export function watchPrivateOrder(orderId: string, callback: (data: any) => void) {
  let alive = true;
  const load = async () => {
    const { data, error } = await supabase.from('order_private').select('customer_phone,recipient_phone').eq('order_id', orderId).maybeSingle();
    if (!error && alive) callback(data ? { customerPhone: data.customer_phone, recipientPhone: data.recipient_phone } : null);
  };
  load();
  const channel = supabase.channel(`private-order-${orderId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'order_private', filter: `order_id=eq.${orderId}` }, load).subscribe();
  return () => { alive = false; supabase.removeChannel(channel); };
}
