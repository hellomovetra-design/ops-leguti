export const SHIPMENT_MENUS = [
 {href:"/dashboard/ops-desk/barkur",label:"Data Barkur"},
 {href:"/dashboard/ops-desk/problems",label:"Data Problem"},
 {href:"/dashboard/ops-desk/damage-cases",label:"Damage Case"},
] as const;
export function inShipment(path:string){
 return path==="/dashboard/ops-desk/ots"||SHIPMENT_MENUS.some(item=>path===item.href||path.startsWith(item.href+"/"));
}
