import { linkedEmployee } from "./employee-access";
import type { SessionPayload } from "./auth-token";
import type { getSupabaseServerClient } from "./supabase";
type DB=NonNullable<ReturnType<typeof getSupabaseServerClient>>;
export async function sanctionRecorderIdentity(db:DB,email:string,session?:SessionPayload){
 const employee=await linkedEmployee(db,email);
 if(employee?.name)return {nik:employee.nik,name:employee.name};
 const account=await db.from("ops_users").select("role,leader_name").eq("email",email.toLowerCase()).maybeSingle();
 if(account.error)throw Error("Profil pemberi belum dapat diperiksa.");
 const current=session?.email.toLowerCase()===email.toLowerCase();
 if((current?session.role:account.data?.role)!=="super_admin")return null;
 const name=String(account.data?.leader_name||"").trim();
 return {nik:null,name:name&&!name.includes("@")?name:"Superadmin"};
}
