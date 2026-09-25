export type AddressCategory = "OFFICE" | "RESIDENCE" | "UNKNOWN";
export type PodStatus = "DELIVERED" | "FAILED" | "PENDING" | "RETURN";

export interface ReportRow {
  id: string;
  awb: string;
  reportDate: string;
  uploadDate: string;
  inboundDate: string;
  shipperName: string;
  receiverName: string;
  address: string;
  addressCategory: AddressCategory;
  inboundCategory: string;
  firstCourierId: string;
  firstCourierName: string;
  lastCourierId: string;
  lastCourierName: string;
  leader: string;
  area: string;
  zone: string;
  firstResult: string;
  lastResult: string;
  status: PodStatus;
  courierChanged: "YA" | "TIDAK";
  sla: "ON TIME" | "OVER SLA";
  aging: number;
  deliveryDate?: string;
  service?: string;
}

export interface Courier {
  id: string;
  courierId: string;
  name: string;
  leader: string;
  shift: string;
  vehicle: string;
  area: string;
  district: string;
  zone: string;
  kanit: string;
  effectiveMonth: string;
  status: "Aktif" | "Nonaktif";
}
