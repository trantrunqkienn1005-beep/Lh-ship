export type Role = "customer" | "shipper_internal" | "shipper_freelance" | "admin" | "pending";
export type UserProfile = {
  uid: string; name: string; phone: string; email: string;
  role: Role; status: "pending" | "approved" | "rejected" | "disabled";
  requestedRole?: Role; avatarUrl?: string; vehiclePlate?: string; vehicleType?: string;
};
export type DeliveryOrder = {
  id: string; orderName: string; photoUrls: string[]; note: string;
  customerId: string; customerName: string;
  recipientName: string;
  pickupAddress: string; deliveryAddress: string;
  distanceKm: number; deliveryFee: number;
  paymentMethod: "COD" | "BANK_TRANSFER"; codAmount: number;
  status: "open" | "accepted" | "delivering" | "completed" | "cancelled";
  driverId?: string; driverName?: string; driverPhone?: string;
  driverAvatarUrl?: string; driverVehiclePlate?: string;
  createdAt: any; updatedAt: any;
};
