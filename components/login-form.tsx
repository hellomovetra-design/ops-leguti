"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { loginDestination } from "@/lib/access-policy";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (loading) return; setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: email, password, next: new URLSearchParams(window.location.search).get("next") }),
      });
      const result = await response.json() as { error?: string; role?: "super_admin" | "admin" | "spv" | "jr_spv" | "coordinator" | "viewer"; redirect?: string };
      if (!response.ok) { setError(result.error || "Login gagal."); return; }
      // Start a fresh document so a previous account's client router cache is discarded.
      window.location.replace(loginDestination(result.role || "viewer", result.redirect));
    } catch { setError("Server tidak dapat dihubungi."); }
    finally { setLoading(false); }
  };
  return <form className="login-form" onSubmit={submit}>
    <div><label className="form-label" htmlFor="login-identifier">NIK / Email</label><input id="login-identifier" className="login-input" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Masukkan NIK atau email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
    <div><div style={{ display: "flex", justifyContent: "space-between" }}><label className="form-label" htmlFor="login-password">Kata sandi</label></div><div style={{ position: "relative" }}><input id="login-password" className="login-input" type={show ? "text" : "password"} placeholder="Masukkan kata sandi" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /><button type="button" aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={show} onClick={() => setShow(!show)} style={{ position: "absolute", right: 11, top: 12, border: 0, background: "none", color: "#98a2b3", cursor: "pointer" }}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
    {error && <div className="login-error" role="alert">{error}</div>}
    <button className="login-submit" disabled={loading}>{loading ? "Memverifikasi…" : "Masuk ke OPS LEGUTI"}</button>
  </form>;
}
