export const PROBLEM_CATEGORIES=["INVALID","UN SMU","BREACH 37","HOLD WH1","CRISCROSS","LAINNYA"] as const;
export const PROBLEM_STATUSES:Record<string,string>={open:"Diajukan",verified:"Terverifikasi",in_progress:"Diproses",resolved:"Selesai",closed:"Ditutup"};
export const PROBLEM_NEXT:Record<string,{status:string;label:string}>={open:{status:"verified",label:"Verifikasi"},verified:{status:"in_progress",label:"Mulai tindak lanjut"},in_progress:{status:"resolved",label:"Tandai selesai"},resolved:{status:"closed",label:"Tutup laporan"}};
export function problemFilters(params:URLSearchParams){
 const id=params.get("id")||"";
 if(id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new Error("Laporan tidak valid.");
 const from=params.get("from")||"",to=params.get("to")||"",status=params.get("status")||"";
 for(const day of [from,to])if(day&&(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day+"T00:00:00Z"))||new Date(day+"T00:00:00Z").toISOString().slice(0,10)!==day))throw new Error("Tanggal filter tidak valid.");
 if(from&&to&&from>to)throw new Error("Tanggal awal tidak boleh melewati tanggal akhir.");
 if(status&&!PROBLEM_STATUSES[status])throw new Error("Status filter tidak valid.");
 return {id,from,to,status,division:params.get("division")||"",category:params.get("category")||"",q:(params.get("q")||"").replace(/[,()%"_*\\]/g," ").trim().slice(0,160)};
}
export function applyProblemFilters(query:any,filters:ReturnType<typeof problemFilters>){
 if(filters.id)query=query.eq("id",filters.id);
 for(const field of ["division","category","status"] as const)if(filters[field])query=query.eq(field,filters[field]);
 if(filters.from)query=query.gte("created_at",filters.from+"T00:00:00+07:00");
 if(filters.to)query=query.lte("created_at",filters.to+"T23:59:59.999+07:00");
 if(filters.q)query=query.or(["awb","category","description","location","created_by_email"].map(field=>`${field}.ilike.%${filters.q}%`).join(","));
 return query;
}
