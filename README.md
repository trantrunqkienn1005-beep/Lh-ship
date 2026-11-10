# LH Ship — React Native + Expo + Supabase

Bộ source MVP đã chuyển backend từ Firebase sang Supabase. Ứng dụng gồm đăng ký/đăng nhập, tài khoản chờ Admin duyệt, tạo đơn với tối đa 3 ảnh, danh sách đơn, tài xế nhận đơn, cập nhật trạng thái, hồ sơ tài xế và màn hình Admin.

> Đây là bản MVP để cấu hình và kiểm thử, chưa phải bản production đã được kiểm thử toàn diện. Không dùng dữ liệu khách hàng thật trước khi hoàn tất kiểm thử bảo mật, sao lưu và vận hành.

## 1. Tạo Supabase project
1. Mở https://supabase.com/dashboard và đăng nhập.
2. Chọn **New project**, đặt tên `LH-Ship`, tạo mật khẩu database mạnh và lưu lại.
3. Chọn region gần người dùng, ví dụ Singapore nếu có sẵn trong danh sách. Region không thể đổi dễ dàng sau khi tạo.
4. Chờ project khởi tạo xong.

## 2. Tạo database và bảo mật
1. Trong project, mở **SQL Editor** > **New query**.
2. Mở file `supabase/schema.sql` trong repository GitHub, sao chép toàn bộ nội dung và dán vào SQL Editor.
3. Nhấn **Run**. Kiểm tra không có lỗi.
4. Mở **Storage** > **Buckets** > **New bucket**. Tạo bucket tên chính xác `lh-ship-files` và để **Private**.
5. Mở **Authentication** > **URL Configuration**. Cấu hình Site URL/redirect phù hợp khi bổ sung luồng xác nhận email.
6. Mở **Database** > **Publications** (hoặc phần Realtime) và bật Realtime cho các bảng `orders`, `profiles`, `order_private`.

## 3. Tạo tài khoản Admin đầu tiên
1. Tạo tài khoản bình thường trong app bằng email bạn muốn làm Admin. Nếu Supabase bật xác nhận email, hãy xác nhận email trước.
2. Vào Supabase **SQL Editor**, chạy câu lệnh sau, thay email bằng email Admin thật:

```sql
update public.profiles
set role = 'admin', status = 'approved'
where email = 'EMAIL_ADMIN_CUA_BAN';
```

3. Đăng xuất rồi đăng nhập lại app. Từ đây Admin có thể duyệt tài khoản mới trong mục Quản trị.
4. Không cấp quyền Admin cho email khác. Chỉ chủ project nên được truy cập SQL Editor.

## 4. Lấy thông tin kết nối
1. Mở **Project Settings** > **API** (hoặc **Connect** tùy giao diện).
2. Sao chép **Project URL**.
3. Sao chép **Publishable key** (hoặc `anon` public key ở project cũ). Tuyệt đối không dùng `service_role` / secret key trong ứng dụng.
4. Tạo file `.env` ở thư mục gốc từ `.env.example`, điền:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Không đưa secret/service_role key vào app hoặc GitHub. `.env` nằm trong `.gitignore`.

## 5. Cài dependencies và chạy
```bash
npm install
npx expo start
```

Để chạy trên iPhone, mở Expo Go và quét QR trong cùng mạng, hoặc dùng EAS Build để tạo bản cài đặt. EAS Build cần tài khoản Expo và cấu hình Apple Developer khi phát hành iOS.

## 6. Cấu trúc dữ liệu
- `profiles`: thông tin tài khoản, vai trò, trạng thái duyệt và hồ sơ tài xế.
- `orders`: thông tin đơn và trạng thái.
- `order_private`: số điện thoại người đặt/người nhận; chỉ khách của đơn, tài xế đã nhận và Admin được đọc.
- Storage bucket `lh-ship-files`: ảnh đơn và ảnh đại diện.
- SQL RPC `accept_order`, `change_order_status`, `approve_user`: kiểm tra quyền phía database; nhận đơn được khóa bằng update có điều kiện để tránh hai tài xế nhận cùng lúc.

## 7. Các giới hạn cần biết trước khi chạy thật
- Địa chỉ hiện nhập bằng chữ và mở Google Maps; chưa có Google Places autocomplete, chọn ghim bản đồ hoặc tự tính quãng đường. Km do người đặt nhập, phí đang làm tròn lên theo 4.000đ/km.
- Chuyển khoản mới lưu lựa chọn, chưa tích hợp ngân hàng/cổng thanh toán/đối soát. COD mới lưu số tiền thu hộ.
- Chưa có GPS tracking trực tiếp, push notification, hủy đơn/khiếu nại, nhật ký Admin và quy trình đối soát COD.
- Ảnh đơn được tạo signed URL thời hạn 7 ngày. Nếu cần lưu/chia sẻ lâu dài, cần bổ sung cơ chế làm mới URL trong app.
- Bật email confirmation trong Supabase Auth nếu muốn xác minh email. Cần thiết lập SMTP riêng nếu triển khai số lượng người dùng lớn.
- Trước khi vận hành, kiểm thử bằng tài khoản khách, tài xế và Admin riêng biệt; kiểm tra RLS và Storage policies; bật backup, giám sát và giới hạn chi phí.
