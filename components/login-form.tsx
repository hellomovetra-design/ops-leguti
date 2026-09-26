"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setError(result.error || "Login gagal."); return; }
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/") ? next : "/dashboard");
      router.refresh();
    } catch { setError("Server tidak dapat dihubungi."); }
    finally { setLoading(false); }
  };
  return <form className="login-form" onSubmit={submit}>
    <div><label className="form-label">Email</label><input className="login-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
    <div><div style={{ display: "flex", justifyContent: "space-between" }}><label className="form-label">Password</label></div><div style={{ position: "relative" }}><input className="login-input" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /><button type="button" onClick={() => setShow(!show)} style={{ position: "absolute", right: 11, top: 12, border: 0, background: "none", color: "#98a2b3", cursor: "pointer" }}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
    {error && <div style={{ color: "#d92d20", fontSize: 10 }}>{error}</div>}
    <button className="login-submit" disabled={loading}>{loading ? "Memverifikasi..." : "Masuk ke Dashboard"}</button>
    <div className="login-note"><ShieldCheck size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />Sesi dilindungi cookie HttpOnly dan akan berakhir otomatis setelah 8 jam.</div>
  </form>;
}
