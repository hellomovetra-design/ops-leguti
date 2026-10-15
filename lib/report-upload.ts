export type UploadProgress={stage:"idle"|"uploading"|"saving"|"success"|"error";percent:number;message:string};
export const idleUpload:UploadProgress={stage:"idle",percent:0,message:""};
// No automatic retry: a stable request ID makes a deliberate retry safe after a lost response.
export function uploadReport(url:string,body:FormData,progress:(value:UploadProgress)=>void):Promise<any>{
 return new Promise((resolve,reject)=>{
  if(!navigator.onLine){progress({stage:"error",percent:0,message:"Perangkat offline. Isian dan foto tetap tersedia; coba kirim saat online."});reject(Error("Perangkat offline. Sambungkan jaringan lalu coba kirim lagi."));return;}
  const xhr=new XMLHttpRequest();xhr.open("POST",url);xhr.timeout=120000;
  progress({stage:"uploading",percent:0,message:"Mengunggah laporan dan foto…"});
  xhr.upload.onprogress=e=>{if(e.lengthComputable)progress({stage:"uploading",percent:Math.min(100,Math.round(e.loaded/e.total*100)),message:"Mengunggah laporan dan foto…"});};
  xhr.upload.onload=()=>progress({stage:"saving",percent:100,message:"Unggahan selesai. Menunggu konfirmasi penyimpanan…"});
  const fail=(message:string)=>{progress({stage:"error",percent:0,message});reject(Error(message));};
  xhr.onerror=()=>fail("Koneksi terputus. Isian dan foto tetap tersedia. Coba kirim lagi untuk memeriksa laporan yang sama.");
  xhr.ontimeout=()=>fail("Konfirmasi server terlalu lama. Coba kirim lagi untuk memeriksa laporan yang sama; jangan membuat laporan baru.");
  xhr.onabort=()=>fail("Pengiriman dibatalkan. Isian dan foto tetap tersedia.");
  xhr.onload=()=>{let result:any;try{result=JSON.parse(xhr.responseText);}catch{fail("Jawaban server belum dapat dibaca. Coba kirim lagi untuk memeriksa laporan yang sama.");return;}
   if(xhr.status<200||xhr.status>=300||!result.ok||result.preview){fail(result.error||"Laporan belum berhasil disimpan. Coba lagi.");return;}
   progress({stage:"success",percent:100,message:"Laporan berhasil tersimpan."});resolve(result);
  };
  xhr.send(body);
 });
}
