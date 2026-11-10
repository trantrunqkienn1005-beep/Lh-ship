import React, { useEffect, useState } from "react";
import { Alert, FlatList, Image, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { User } from "@supabase/supabase-js";
import { supabase } from "./src/supabase";
import { approveUser, acceptOrder, changeOrderStatus, createOrder, updateDriverProfile, uploadPhoto, watchAllOrders, watchDriverOrders, watchMyOrders, watchOpenOrders, watchPendingUsers, watchPrivateOrder, watchProfile } from "./src/services";
import { DeliveryOrder, UserProfile } from "./src/types";

const BLUE = "#2479D2";
const money = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
const fee = (km: number) => Math.ceil(km) * 4000;
const Field = ({ label, value, onChangeText, keyboardType = "default", multiline = false }: any) => <View style={{ marginBottom: 10 }}><Text style={s.label}>{label}</Text><TextInput style={[s.input, multiline && { height: 80, textAlignVertical: "top" }]} value={value} onChangeText={onChangeText} keyboardType={keyboardType} multiline={multiline} placeholder={label} /></View>;
const Btn = ({ title, onPress, secondary = false }: any) => <TouchableOpacity onPress={onPress} style={[s.btn, secondary && { backgroundColor: "#E8F1FC" }]}><Text style={[s.btnText, secondary && { color: BLUE }]}>{title}</Text></TouchableOpacity>;
const Card = ({ children }: any) => <View style={s.card}>{children}</View>;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [screen, setScreen] = useState("home");
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [privateInfo, setPrivateInfo] = useState<Record<string, any>>({});
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [requestedRole, setRequestedRole] = useState("customer");
  const [orderName, setOrderName] = useState(""); const [customerPhone, setCustomerPhone] = useState(""); const [recipientName, setRecipientName] = useState(""); const [recipientPhone, setRecipientPhone] = useState("");
  const [pickup, setPickup] = useState(""); const [destination, setDestination] = useState(""); const [distance, setDistance] = useState("1"); const [cod, setCod] = useState("0"); const [payment, setPayment] = useState<"COD"|"BANK_TRANSFER">("COD"); const [note, setNote] = useState(""); const [photos, setPhotos] = useState<string[]>([]);
  const [plate, setPlate] = useState(""); const [vehicle, setVehicle] = useState("Xe máy"); const [avatar, setAvatar] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!user) { setProfile(null); return; }
    return watchProfile(user.id, setProfile);
  }, [user]);
  useEffect(() => {
    if (!user || !profile || profile.status !== "approved" || orders.length === 0) return;
    const visiblePrivateOrders = orders.filter(order =>
      profile.role === "admin" || order.customerId === user.id || order.driverId === user.id
    );
    const unsubs = visiblePrivateOrders.map(order => watchPrivateOrder(order.id, data => {
      setPrivateInfo(old => ({ ...old, [order.id]: data }));
    }));
    return () => unsubs.forEach(unsub => unsub());
  }, [user, profile?.status, orders.map(o => o.id).join("|")]);
  useEffect(() => {
    if (!user || !profile || profile.status !== "approved") return;
    if (profile.role === "admin") {
      const a = watchAllOrders(setOrders); const b = watchPendingUsers(setPendingUsers);
      return () => { a(); b(); };
    }
    if (profile.role.startsWith("shipper")) {
      const a = watchOpenOrders(setOrders); const b = watchDriverOrders(user.id, mine => setOrders(old => [...old.filter(x => x.driverId !== user.id), ...mine]));
      return () => { a(); b(); };
    }
    return watchMyOrders(user.id, setOrders);
  }, [user, profile?.role, profile?.status]);

  async function authAction() {
    try {
      if (mode === "login") { const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error; }
      else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { name, phone, requested_role: requestedRole } }
        });
        if (error) throw error;
        Alert.alert("Đăng ký thành công", "Nếu được yêu cầu xác nhận email, hãy mở email xác nhận rồi đăng nhập.");
      }
    } catch (e: any) { Alert.alert("Thông báo", e.message || "Không thể thực hiện."); }
  }
  async function pickPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 3 - photos.length, quality: 0.75 });
    if (!result.canceled) setPhotos(old => [...old, ...result.assets.map(a => a.uri)].slice(0, 3));
  }
  async function submitOrder() {
    if (!user || !profile) return;
    const km = Number(distance);
    if (!orderName.trim() || !customerPhone.trim() || !recipientName.trim() || !recipientPhone.trim() || !pickup.trim() || !destination.trim() || photos.length < 1 || !Number.isFinite(km) || km <= 0) {
      Alert.alert("Thiếu thông tin", "Vui lòng nhập đủ thông tin, ít nhất 1 ảnh và quãng đường hợp lệ."); return;
    }
    try {
      await createOrder({
        orderName, note, customerId: user.id, customerName: profile.name, customerPhone,
        recipientName, recipientPhone, pickupAddress: pickup, deliveryAddress: destination,
        distanceKm: km, deliveryFee: fee(km), paymentMethod: payment, codAmount: Number(cod) || 0
      } as any, photos);
      setOrderName(""); setNote(""); setPhotos([]); setScreen("home");
      Alert.alert("Thành công", "Đơn hàng đã được đăng.");
    } catch (e: any) { Alert.alert("Lỗi", e.message || "Không thể tạo đơn."); }
  }
  async function setStatus(orderId: string, status: "delivering" | "completed") {
    try { await changeOrderStatus(orderId, status); } catch (e: any) { Alert.alert("Lỗi", e.message); }
  }
  async function saveDriver() {
    if (!user || !plate.trim()) return Alert.alert("Thiếu thông tin", "Nhập biển số xe.");
    try {
      let avatarUrl = profile?.avatarUrl || "";
      if (avatar) avatarUrl = await uploadPhoto(avatar, `users/${user.id}/avatar.jpg`);
      await updateDriverProfile(user.id, { avatarUrl, vehiclePlate: plate, vehicleType: vehicle });
      Alert.alert("Đã lưu", "Hồ sơ tài xế đã được cập nhật.");
    } catch (e: any) { Alert.alert("Lỗi", e.message); }
  }
  function openMaps(address: string) { Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`); }
  function orderCard(item: DeliveryOrder, driver = false) {
    return <Card key={item.id}>
      <View style={s.row}><Text style={s.heading}>{item.id.slice(-8).toUpperCase()} · {item.orderName}</Text><Text style={s.status}>{item.status}</Text></View>
      <ScrollView horizontal>{item.photoUrls?.map((url, i) => <Image key={i} source={{ uri: url }} style={s.photo} />)}</ScrollView>
      <Text style={s.text}>Người đặt: {item.customerName} {(driver || isAdmin || item.customerId === user?.id) ? `· ${privateInfo[item.id]?.customerPhone || ""}` : ""}</Text>
      <Text style={s.text}>Người nhận: {item.recipientName} {(driver || isAdmin || item.customerId === user?.id) ? `· ${privateInfo[item.id]?.recipientPhone || ""}` : ""}</Text>
      <Text style={s.text}>Lấy: {item.pickupAddress}</Text><Text style={s.text}>Giao: {item.deliveryAddress}</Text>
      <Text style={s.text}>Khoảng cách: {item.distanceKm} km · Phí: {money(item.deliveryFee)}</Text>
      <Text style={s.text}>Thanh toán: {item.paymentMethod} · COD: {money(item.codAmount)}</Text>
      {!!item.note && <Text style={s.text}>Ghi chú: {item.note}</Text>}
      {!!item.driverId && <View style={s.driverBox}>
        {item.driverAvatarUrl ? <Image source={{ uri: item.driverAvatarUrl }} style={s.avatar}/> : <Text>👤</Text>}
        <View style={{ flex: 1 }}><Text style={s.bold}>Tài xế: {item.driverName}</Text><Text>{item.driverPhone} · {item.driverVehiclePlate}</Text></View>
        <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.driverPhone}`)}><Text style={s.link}>Gọi</Text></TouchableOpacity>
      </View>}
      <View style={s.row}>
        <Btn title="Chỉ đường lấy hàng" secondary onPress={() => openMaps(item.pickupAddress)} />
        <Btn title="Chỉ đường giao" secondary onPress={() => openMaps(item.deliveryAddress)} />
      </View>
      {driver && item.status === "open" && <Btn title="NHẬN ĐƠN" onPress={() => acceptOrder(item.id).catch((e: any) => Alert.alert("Không nhận được đơn", e.message))}/>}
      {driver && item.status === "accepted" && <Btn title="BẮT ĐẦU GIAO" onPress={() => setStatus(item.id, "delivering")}/>}
      {driver && item.status === "delivering" && <Btn title="HOÀN THÀNH ĐƠN" onPress={() => setStatus(item.id, "completed")}/>}
      {item.status === "completed" && <Text style={{ color: "green", fontWeight: "bold" }}>Đã giao thành công</Text>}
    </Card>;
  }

  if (!user) return <SafeAreaView style={s.container}><StatusBar style="dark"/><View style={s.auth}>
    <Text style={s.logo}>LH Ship</Text><Text style={s.sub}>Giao hàng nhanh chóng, tiện lợi</Text>
    {mode === "register" && <><Field label="Họ và tên" value={name} onChangeText={setName}/><Field label="Số điện thoại" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/>
      <Text style={s.label}>Bạn muốn đăng ký</Text><View style={s.row}><Btn title="Người đặt" secondary onPress={() => setRequestedRole("customer")}/><Btn title="Tài xế nội bộ" secondary onPress={() => setRequestedRole("shipper_internal")}/><Btn title="Tài xế tự do" secondary onPress={() => setRequestedRole("shipper_freelance")}/></View></>}
    <Field label="Email" value={email} onChangeText={setEmail}/><Field label="Mật khẩu (tối thiểu 6 ký tự)" value={password} onChangeText={setPassword}/>
    <Btn title={mode === "login" ? "ĐĂNG NHẬP" : "ĐĂNG KÝ"} onPress={authAction}/>
    <Btn title={mode === "login" ? "Tạo tài khoản mới" : "Quay lại đăng nhập"} secondary onPress={() => setMode(mode === "login" ? "register" : "login")}/>
  </View></SafeAreaView>;

  if (!profile) return <SafeAreaView style={s.container}><Text style={s.text}>Đang tải hồ sơ...</Text></SafeAreaView>;
  if (profile.status === "pending") return <SafeAreaView style={s.container}><View style={s.auth}><Text style={s.logo}>LH Ship</Text><Text style={s.heading}>Tài khoản đang chờ Admin duyệt</Text><Text style={s.text}>Admin sẽ xét duyệt tài khoản của bạn. Tài khoản quản trị đầu tiên được thiết lập trong Supabase SQL Editor theo hướng dẫn README.</Text><Btn title="Đăng xuất" onPress={() => supabase.auth.signOut()}/></View></SafeAreaView>;
  if (profile.status !== "approved") return <SafeAreaView style={s.container}><View style={s.auth}><Text style={s.heading}>Tài khoản chưa được cấp quyền hoạt động.</Text><Btn title="Đăng xuất" onPress={() => supabase.auth.signOut()}/></View></SafeAreaView>;

  const isAdmin = profile.role === "admin";
  const isDriver = profile.role.startsWith("shipper");
  return <SafeAreaView style={s.container}><StatusBar style="dark"/><View style={s.header}><Text style={s.logo}>LH Ship</Text><TouchableOpacity onPress={() => supabase.auth.signOut()}><Text style={s.link}>Đăng xuất</Text></TouchableOpacity></View>
    <View style={s.tabs}>
      <TouchableOpacity onPress={() => setScreen("home")}><Text style={s.tab}>Trang chủ</Text></TouchableOpacity>
      {!isDriver && !isAdmin && <TouchableOpacity onPress={() => setScreen("create")}><Text style={s.tab}>Tạo đơn</Text></TouchableOpacity>}
      {isDriver && <TouchableOpacity onPress={() => setScreen("profile")}><Text style={s.tab}>Hồ sơ tài xế</Text></TouchableOpacity>}
      {isAdmin && <TouchableOpacity onPress={() => setScreen("admin")}><Text style={s.tab}>Quản trị</Text></TouchableOpacity>}
    </View>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {screen === "create" && !isDriver && !isAdmin && <><Text style={s.heading}>Tạo đơn giao hàng</Text>
        <Field label="Tên đơn hàng *" value={orderName} onChangeText={setOrderName}/>
        <Text style={s.label}>Ảnh hàng hóa * (tối đa 3)</Text><View style={s.row}>{photos.map((p,i)=><Image key={i} source={{uri:p}} style={s.photo}/>)}</View><Btn title={`Chọn ảnh (${photos.length}/3)`} secondary onPress={pickPhotos}/>
        <Field label="Số điện thoại người đặt *" value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad"/>
        <Field label="Họ tên người nhận *" value={recipientName} onChangeText={setRecipientName}/>
        <Field label="Số điện thoại người nhận *" value={recipientPhone} onChangeText={setRecipientPhone} keyboardType="phone-pad"/>
        <Field label="Địa chỉ lấy hàng *" value={pickup} onChangeText={setPickup}/>
        <Btn title="Mở bản đồ chọn điểm lấy" secondary onPress={() => openMaps(pickup || "Việt Nam")}/>
        <Field label="Địa chỉ giao hàng *" value={destination} onChangeText={setDestination}/>
        <Btn title="Mở bản đồ chọn điểm giao" secondary onPress={() => openMaps(destination || "Việt Nam")}/>
        <Field label="Khoảng cách tuyến đường (km) *" value={distance} onChangeText={setDistance} keyboardType="decimal-pad"/>
        <Text style={s.estimate}>Phí dự kiến: {money(fee(Number(distance) || 0))} (4.000đ/km, làm tròn lên)</Text>
        <Field label="Tiền thu hộ COD (nếu có)" value={cod} onChangeText={setCod} keyboardType="numeric"/>
        <Text style={s.label}>Hình thức thanh toán</Text><View style={s.row}><Btn title="COD" secondary onPress={() => setPayment("COD")}/><Btn title="Chuyển khoản" secondary onPress={() => setPayment("BANK_TRANSFER")}/></View>
        <Field label="Ghi chú" value={note} onChangeText={setNote} multiline/><Btn title="ĐĂNG ĐƠN HÀNG" onPress={submitOrder}/>
      </>}
      {screen === "profile" && isDriver && <><Text style={s.heading}>Hồ sơ tài xế</Text><Btn title="Chọn ảnh đại diện" secondary onPress={async () => { const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes:["images"], quality:0.8 }); if (!r.canceled) setAvatar(r.assets[0].uri); }}/>{!!avatar && <Image source={{uri:avatar}} style={s.avatar}/>}<Field label="Biển số xe *" value={plate} onChangeText={setPlate}/><Field label="Loại xe" value={vehicle} onChangeText={setVehicle}/><Btn title="LƯU HỒ SƠ" onPress={saveDriver}/></>}
      {screen === "admin" && isAdmin && <><Text style={s.heading}>Quản trị LH Ship</Text><Text style={s.text}>Tổng đơn: {orders.length} · Tài khoản chờ duyệt: {pendingUsers.length}</Text><Text style={s.bold}>Duyệt tài khoản</Text>{pendingUsers.map(p=><Card key={p.uid}><Text style={s.bold}>{p.name} · {p.phone}</Text><Text>{p.email} · yêu cầu: {p.requestedRole}</Text><Btn title="Duyệt theo vai trò đã đăng ký" onPress={() => approveUser(p.uid, p.requestedRole || "customer").catch((e:any)=>Alert.alert("Lỗi",e.message))}/></Card>)}</>}
      {screen === "home" && <><Text style={s.heading}>{isAdmin ? "Tất cả đơn hàng" : isDriver ? "Đơn hàng dành cho tài xế" : "Đơn hàng của tôi"}</Text>{orders.length === 0 ? <Text style={s.text}>Chưa có đơn hàng.</Text> : orders.map(o => orderCard(o, isDriver))}</>}
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:"#F3F7FC"},auth:{flex:1,justifyContent:"center",padding:22},header:{backgroundColor:"#fff",padding:16,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},logo:{fontSize:30,fontWeight:"900",color:BLUE},sub:{color:"#60758B",marginBottom:24},tabs:{backgroundColor:"#fff",flexDirection:"row",justifyContent:"space-around",padding:12},tab:{color:BLUE,fontWeight:"700"},heading:{fontSize:20,fontWeight:"800",color:"#173B63",marginBottom:12},label:{fontSize:13,fontWeight:"700",color:"#405A75",marginBottom:5},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#D7E1EC",borderRadius:10,padding:12,fontSize:15,color:"#173B63"},btn:{backgroundColor:BLUE,padding:13,borderRadius:10,alignItems:"center",justifyContent:"center",marginVertical:5,flex:1},btnText:{color:"#fff",fontWeight:"800",fontSize:13},card:{backgroundColor:"#fff",borderRadius:14,padding:14,marginBottom:12,gap:7},row:{flexDirection:"row",alignItems:"center",gap:8,flexWrap:"wrap"},text:{color:"#344B63",fontSize:14,marginVertical:2},bold:{fontWeight:"800",color:"#173B63"},status:{color:"#B7791F",fontWeight:"700",fontSize:12},photo:{width:82,height:82,borderRadius:9,marginRight:7,backgroundColor:"#E7EEF6"},driverBox:{backgroundColor:"#EEF5FD",padding:10,borderRadius:10,flexDirection:"row",alignItems:"center",gap:8},avatar:{width:52,height:52,borderRadius:26},link:{color:BLUE,fontWeight:"800"},estimate:{color:"#16834B",fontWeight:"800",marginBottom:12}
});
