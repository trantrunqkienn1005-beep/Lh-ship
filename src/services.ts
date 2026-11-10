import { httpsCallable, getFunctions } from "firebase/functions";
import { addDoc, collection, onSnapshot, orderBy, query, where, doc, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { DeliveryOrder, UserProfile } from "./types";

const functions = getFunctions();

export async function uploadPhoto(uri: string, path: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, blob, { contentType: blob.type || "image/jpeg" });
  return getDownloadURL(fileRef);
}

export async function createOrder(data: Omit<DeliveryOrder, "id" | "status" | "createdAt" | "updatedAt" | "photoUrls" | "customerPhone" | "recipientPhone"> & { customerPhone: string; recipientPhone: string }, photoUris: string[]) {
  if (photoUris.length > 3) throw new Error("Chỉ được tải tối đa 3 ảnh.");
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const photoUrls = await Promise.all(photoUris.map((uri, i) => uploadPhoto(uri, `orders/${data.customerId}/${id}/${i}.jpg`)));
  const { customerPhone, recipientPhone, ...publicData } = data;
  const orderRef = await addDoc(collection(db, "orders"), {
    ...publicData, photoUrls, status: "open", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  await setDoc(doc(db, "orderPrivate", orderRef.id), {
    customerId: data.customerId, customerPhone, recipientPhone, createdAt: serverTimestamp()
  });
}

export function watchOpenOrders(callback: (orders: DeliveryOrder[]) => void) {
  return onSnapshot(query(collection(db, "orders"), where("status", "==", "open"), orderBy("createdAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryOrder))));
}
export function watchMyOrders(uid: string, callback: (orders: DeliveryOrder[]) => void) {
  return onSnapshot(query(collection(db, "orders"), where("customerId", "==", uid), orderBy("createdAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryOrder))));
}
export function watchDriverOrders(uid: string, callback: (orders: DeliveryOrder[]) => void) {
  return onSnapshot(query(collection(db, "orders"), where("driverId", "==", uid), orderBy("createdAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryOrder))));
}
export function watchAllOrders(callback: (orders: DeliveryOrder[]) => void) {
  return onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryOrder))));
}
export function watchPendingUsers(callback: (users: UserProfile[]) => void) {
  return onSnapshot(query(collection(db, "users"), where("status", "==", "pending")),
    snap => callback(snap.docs.map(d => d.data() as UserProfile)));
}
export async function acceptOrder(orderId: string) {
  await httpsCallable(functions, "acceptOrder")({ orderId });
}
export async function changeOrderStatus(orderId: string, status: "delivering" | "completed") {
  await httpsCallable(functions, "changeOrderStatus")({ orderId, status });
}
export async function approveUser(uid: string, role: string) {
  await httpsCallable(functions, "approveUser")({ uid, role });
}
export async function updateDriverProfile(uid: string, data: { avatarUrl: string; vehiclePlate: string; vehicleType: string }) {
  await updateDoc(doc(db, "users", uid), data);
}

export function watchPrivateOrder(orderId: string, callback: (data: any) => void) {
  return onSnapshot(doc(db, "orderPrivate", orderId), snap => callback(snap.exists() ? snap.data() : null));
}
export async function bootstrapAdmin() {
  await httpsCallable(functions, "bootstrapAdmin")({});
}
