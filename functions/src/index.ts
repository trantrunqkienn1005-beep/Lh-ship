import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();
const isAdmin = async (uid: string) => (await getAuth().getUser(uid)).customClaims?.admin === true;

export const bootstrapAdmin = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Bạn cần đăng nhập.");
  const allowed = (process.env.ADMIN_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  const email = (request.auth.token.email || "").toLowerCase();
  if (!email || !allowed.includes(email)) throw new HttpsError("permission-denied", "Email không nằm trong ADMIN_EMAILS.");
  await getAuth().setCustomUserClaims(request.auth.uid, { admin: true });
  await db.doc(`users/${request.auth.uid}`).set({
    uid: request.auth.uid, email, name: request.auth.token.name || "LH Ship Admin",
    role: "admin", status: "approved", updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { ok: true };
});

export const approveUser = onCall(async (request) => {
  if (!request.auth || !(await isAdmin(request.auth.uid))) throw new HttpsError("permission-denied", "Chỉ Admin được duyệt.");
  const { uid, role } = request.data || {};
  if (typeof uid !== "string" || !["customer", "shipper_internal", "shipper_freelance"].includes(role))
    throw new HttpsError("invalid-argument", "Thông tin duyệt không hợp lệ.");
  await db.doc(`users/${uid}`).update({ role, status: "approved", updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

export const acceptOrder = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Bạn cần đăng nhập.");
  const uid = request.auth.uid;
  const userSnap = await db.doc(`users/${uid}`).get();
  const user = userSnap.data();
  if (!userSnap.exists || user?.status !== "approved" || !["shipper_internal", "shipper_freelance"].includes(user.role))
    throw new HttpsError("permission-denied", "Tài khoản chưa được duyệt làm tài xế.");
  const orderId = request.data?.orderId;
  if (typeof orderId !== "string") throw new HttpsError("invalid-argument", "Thiếu mã đơn.");
  await db.runTransaction(async tx => {
    const ref = db.doc(`orders/${orderId}`);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.status !== "open") throw new HttpsError("failed-precondition", "Đơn đã được người khác nhận hoặc không còn mở.");
    tx.update(ref, {
      status: "accepted", driverId: uid, driverName: user.name || "",
      driverPhone: user.phone || "", driverAvatarUrl: user.avatarUrl || "",
      driverVehiclePlate: user.vehiclePlate || "", driverVehicleType: user.vehicleType || "",
      acceptedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
  });
  return { ok: true };
});

export const changeOrderStatus = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Bạn cần đăng nhập.");
  const { orderId, status } = request.data || {};
  if (typeof orderId !== "string" || !["delivering", "completed"].includes(status))
    throw new HttpsError("invalid-argument", "Trạng thái không hợp lệ.");
  const uid = request.auth.uid;
  const user = (await db.doc(`users/${uid}`).get()).data();
  const ref = db.doc(`orders/${orderId}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const order = snap.data();
    if (!snap.exists || order?.driverId !== uid || user?.status !== "approved")
      throw new HttpsError("permission-denied", "Bạn không có quyền cập nhật đơn này.");
    if (status === "delivering" && order.status !== "accepted") throw new HttpsError("failed-precondition", "Đơn chưa ở trạng thái đã nhận.");
    if (status === "completed" && order.status !== "delivering") throw new HttpsError("failed-precondition", "Đơn chưa bắt đầu giao.");
    tx.update(ref, { status, updatedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});
