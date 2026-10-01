"use client";

import { useRef, useState } from "react";
import { Loader2, LogOut } from "lucide-react";

export function PwaAccountActions({ disabled, hasDraft }: { disabled: boolean; hasDraft: boolean }) {
  const lock = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    if (disabled || lock.current) return;
    if (!window.confirm(hasDraft ? "Foto profil belum disimpan. Keluar akun dan buang perubahan?" : "Keluar dari akun OPS LEGUTI?")) return;
    lock.current = true;
    setLeaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error("Belum berhasil keluar akun. Silakan coba lagi.");
      // Full navigation clears this page's account data and requires a fresh session.
      window.location.replace("/login?next=%2Fpwa");
    } catch {
      setError("Belum berhasil keluar akun. Periksa koneksi dan coba lagi.");
      lock.current = false;
      setLeaving(false);
    }
  }
  return <div className="pwa-account-actions">
    <button type="button" className="pwa-logout" disabled={disabled || leaving} onClick={logout}>
      {leaving ? <Loader2 size={18} className="pwa-submit-spinner" /> : <LogOut size={18} />}
      {leaving ? "Keluar akun…" : "Keluar akun"}
    </button>
    {error && <p className="pwa-profile-notice error" role="alert">{error}</p>}
    <footer className="pwa-account-credit">© 2026 OPS LEGUTI<span>Developed by movetra.id</span></footer>
  </div>;
}
