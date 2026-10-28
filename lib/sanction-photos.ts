import { deleteFromImageKit, uploadToImageKit, isImageKitConfigured } from "./imagekit";
export type SanctionPhoto = {name:string;path:string;content_type:string;fileId:string};
export async function validateSanctionPhotos(files: File[], existing = 0) {
  if (existing+files.length<1 || existing+files.length>3) throw Error("Bukti wajib minimal 1 foto dan maksimal 3 foto.");
  if (files.reduce((sum,file)=>sum+file.size,0)>3*1024*1024) throw Error("Total unggahan foto maksimal 3 MB.");
  for (const file of files) {
    const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
    const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const png=[137,80,78,71,13,10,26,10].every((byte,index)=>bytes[index]===byte);
    const webp=String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
    if (!file.size || !((file.type==="image/jpeg"&&jpeg)||(file.type==="image/png"&&png)||(file.type==="image/webp"&&webp))) throw Error("Bukti harus berupa foto JPG, PNG, atau WebP yang valid.");
  }
}
export async function discardSanctionPhotos(photos:SanctionPhoto[]) {
  await Promise.all(photos.map(photo=>deleteFromImageKit(photo.fileId).catch(()=>{})));
}
export async function uploadSanctionPhotos(files:File[], id:string) {
  const photos:SanctionPhoto[]=[];
  if (files.length&&!isImageKitConfigured()) throw Error("Penyimpanan foto belum siap. Hubungi administrator.");
  try {
    for(const file of files){
      const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
      const image=await uploadToImageKit(file,`sanctions/${id}/${crypto.randomUUID()}.${ext}`);
      photos.push({name:file.name.slice(0,200),path:image.path,fileId:image.fileId,content_type:file.type});
    }
    return photos;
  } catch(error){await discardSanctionPhotos(photos);throw error;}
}
export function sanctionPhotoView(record:{id:string;updated_at:string;photos?:SanctionPhoto[]},scope:string){
  return (record.photos||[]).map((photo,index)=>({name:photo.name,url:`/api/employee-sanctions?type=photo&scope=${scope}&id=${record.id}&index=${index}&v=${encodeURIComponent(record.updated_at)}`}));
}
