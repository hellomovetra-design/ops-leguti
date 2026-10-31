"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { loginDestination } from "@/lib/access-policy";

export function LoginForm() {
  const [mfa,setMfa]=useState<{setup:boolean;qr?:string;secret?:string}|null>(null);
  const [code,setCode]=useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (loading) return; setLoading(true); setError("");
    try {
      if(mfa){
        const response=await fetch("/api/auth/mfa",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"verify",code})});
        const result=await response.json();if(!response.ok){setError(result.error||"Verifikasi gagal.");setCode("");return;}
        window.location.replace(loginDestination(result.role,result.redirect));return;
      }
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: email, password, next: new URLSearchParams(window.location.search).get("next") }),
      });
      const result = await response.json() as { error?: string; role?: "super_admin" | "admin" | "spv" | "jr_spv" | "coordinator" | "viewer"; redirect?: string; mfa_required?:boolean };
      if (!response.ok) { setError(result.error || "Login gagal."); return; }
      if(result.mfa_required){
        setPassword("");
        const begin=await fetch("/api/auth/mfa",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"start"})});
        const setup=await begin.json();if(!begin.ok){setError(setup.error||"Verifikasi belum dapat dimulai.");return;}
        setMfa(setup);setCode("");return;
      }
      // Start a fresh document so a previous account's client router cache is discarded.
      window.location.replace(loginDestination(result.role || "viewer", result.redirect));
    } catch { setError("Server tidak dapat dihubungi."); }
    finally { setLoading(false); }
  };
  return <form className="login-form" onSubmit={submit}>
    {!mfa&&<><div><label className="form-label" htmlFor="login-identifier">NIK / Email</label><input id="login-identifier" className="login-input" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Masukkan NIK atau email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
    <div><div style={{ display: "flex", justifyContent: "space-between" }}><label className="form-label" htmlFor="login-password">Kata sandi</label></div><div style={{ position: "relative" }}><input id="login-password" className="login-input" type={show ? "text" : "password"} placeholder="Masukkan kata sandi" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /><button type="button" aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={show} onClick={() => setShow(!show)} style={{ position: "absolute", right: 11, top: 12, border: 0, background: "none", color: "#98a2b3", cursor: "pointer" }}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
    </>}
    {mfa&&<section className="login-mfa" aria-label="Verifikasi dua langkah"><h2>{mfa.setup?"Pasang Google Authenticator":"Verifikasi dua langkah"}</h2>{mfa.setup?<><p>Di Google Authenticator, pilih tambah akun lalu pindai QR ini. Setelah tersimpan, masukkan kode 6 angka.</p><img src={mfa.qr} alt="QR pemasangan Google Authenticator" width={220} height={220}/><details><summary>Tidak bisa memindai QR?</summary><p>Tambahkan akun manual dengan kunci ini dan pilih jenis berbasis waktu.</p><code style={{overflowWrap:"anywhere"}}>{mfa.secret}</code></details></>:<p>Masukkan kode terbaru dari Google Authenticator untuk akun Anda.</p>}<label className="form-label" htmlFor="mfa-code">Kode Authenticator</label><input id="mfa-code" className="login-input" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus/><button type="button" disabled={loading} onClick={async()=>{try{await fetch("/api/auth/mfa",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"cancel"})})}finally{setMfa(null);setCode("");setError("")}}}>Kembali ke login</button></section>}
    {error && <div className="login-error" role="alert">{error}</div>}
    <button className="login-submit" disabled={loading}>{loading ? "Memverifikasi…" : mfa?"Verifikasi dan masuk":"Masuk ke OPS LEGUTI"}</button>
  </form>;
}
