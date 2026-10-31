import { decodeBase64Url,encodeBase64Url } from "./auth-token";
import type { SessionPayload } from "./auth-token";
export const MFA_COOKIE="ops_mfa_pending";
export const MFA_TTL=600;
export type MfaPending={id:string;user_id:string;email:string;role:SessionPayload["role"];employee_nik?:string;next:string;access_token:string;refresh_token:string;exp:number};
const aad=new TextEncoder().encode("ops-dashboard-mfa-v1");
async function key(secret:string){
 if(secret.length<32)throw Error("Autentikasi belum siap.");
 return crypto.subtle.importKey("raw",await crypto.subtle.digest("SHA-256",new TextEncoder().encode("mfa-pending:"+secret)),"AES-GCM",false,["encrypt","decrypt"]);
}
export async function sealMfaPending(value:MfaPending,secret:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const data=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad},await key(secret),new TextEncoder().encode(JSON.stringify(value)));
 const cookie=encodeBase64Url(iv)+"."+encodeBase64Url(new Uint8Array(data));
 if(cookie.length>3800)throw Error("Sesi verifikasi terlalu besar. Hubungi administrator.");
 return cookie;
}
export async function openMfaPending(cookie:string|undefined,secret:string|undefined):Promise<MfaPending|null>{
 if(!cookie||!secret)return null;
 try{
  const [iv,data,extra]=cookie.split(".");if(extra)return null;
  const raw=await crypto.subtle.decrypt({name:"AES-GCM",iv:decodeBase64Url(iv),additionalData:aad},await key(secret),decodeBase64Url(data));
  const p=JSON.parse(new TextDecoder().decode(raw)) as MfaPending;
  if(!p.id||!p.email||!p.user_id||!p.access_token||!p.refresh_token||!Number.isFinite(p.exp)||p.exp<=Date.now()/1000||p.exp>Date.now()/1000+MFA_TTL+5)return null;
  return p;
 }catch{return null;}
}
export const mfaCookieOptions={httpOnly:true,sameSite:"strict" as const,secure:process.env.NODE_ENV==="production",path:"/api/auth",maxAge:MFA_TTL};
