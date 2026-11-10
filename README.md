# LH Ship

Ứng dụng giao hàng nội bộ bằng React Native + Expo + Firebase.

## Trạng thái source
Đây là bộ khung MVP có luồng đăng ký/đăng nhập, chờ Admin duyệt, tạo đơn, tải tối đa 3 ảnh, danh sách đơn, nhận đơn bằng Cloud Function transaction, cập nhật trạng thái và trang quản trị duyệt tài khoản. Cần cấu hình Firebase và kiểm thử bảo mật trước khi dùng thật.

## 1. Tạo Firebase
1. Tạo project tại https://console.firebase.google.com/
2. Bật Authentication > Email/Password.
3. Tạo Firestore Database.
4. Bật Storage.
5. Tạo ứng dụng Web trong Firebase Project settings để lấy Firebase config.
6. Tạo file `.env` từ `.env.example`, điền cấu hình Firebase. Không commit `.env` lên GitHub.
7. Deploy Rules và Functions bằng Firebase CLI (cần máy tính hoặc môi trường cloud như GitHub Codespaces).

## 2. Cấu hình Admin đầu tiên
1. Trong Firebase Functions, đặt biến môi trường `ADMIN_EMAILS` bằng email Admin của bạn.
2. Deploy Functions.
3. Tạo tài khoản ứng dụng bằng đúng email đó.
4. Sau khi đăng nhập, gọi callable `bootstrapAdmin` một lần. Cách thuận tiện nhất là dùng Firebase Console/Cloud Shell hoặc bổ sung nút bootstrap chỉ trong giai đoạn khởi tạo. Không mở chức năng này cho email khác.
5. Đăng nhập app bằng email đó. Ở màn hình chờ duyệt, nhấn **KHỞI TẠO ADMIN**. Server chỉ cấp quyền nếu email nằm trong ADMIN_EMAILS. Đăng xuất và đăng nhập lại để nhận custom claim Admin.

## 3. Chạy dự án
```bash
npm install
npx expo start
```

## 4. Deploy Firebase
Cài Firebase CLI trong môi trường Node:
```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,storage,functions
```

## 5. Build ứng dụng
```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview
eas build --platform ios --profile production
```
iOS phát hành lâu dài cần Apple Developer Program và App Store review. Với phân phối không công khai, có thể xem App Store Unlisted.

## 6. Lưu ý quan trọng cần hoàn thiện trước khi vận hành
- Mẫu này dùng địa chỉ nhập dạng văn bản và mở Google Maps để điều hướng. Chưa tích hợp Google Places autocomplete, chọn ghim trực tiếp hay tính khoảng cách tuyến đường tự động. Người đặt nhập km dự kiến; phí đang làm tròn lên mỗi km: 4.000đ/km. Số điện thoại người đặt/người nhận được lưu riêng trong `orderPrivate`, tài xế chỉ đọc được sau khi nhận đơn.
- Chuyển khoản hiện chỉ lưu lựa chọn, chưa tích hợp cổng thanh toán/đối soát ngân hàng.
- COD là thông tin thu hộ, chưa có đối soát tiền.
- Cần bổ sung quy trình hủy đơn, khiếu nại, thông báo push, tracking GPS trực tiếp, giới hạn truy cập ảnh theo đơn và nhật ký Admin.
- Firestore query có thể yêu cầu tạo composite index; làm theo liên kết lỗi Firebase trả về.
- Rà soát kỹ Firestore/Storage Rules và kiểm thử bằng tài khoản customer, driver, admin trước khi chạy thật.
- Không đưa service account JSON, private key hay `.env` vào GitHub.
