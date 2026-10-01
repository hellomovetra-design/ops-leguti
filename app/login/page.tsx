import { LoginForm } from "@/components/login-form";
import "./login.css";

export default function LoginPage() {
  return <main className="login-page">
    <section className="login-art">
      <div className="brand" style={{ border: 0, padding: 0 }}><img src="/jne-logo.jpg" alt="JNE Express" className="brand-mark" style={{ width: 62, height: 48 }} /><div><div className="brand-title">OPS LEGUTI</div><div className="brand-sub">PUSAT OPERASIONAL TIM</div></div></div>
      <div className="login-quote"><div className="eyebrow" style={{ color: "#ff6267" }}>TERHUBUNG · TERARAH · TERPANTAU</div><h1>Satu ruang kerja.<br />Operasional lebih tertata.</h1><p>Kelola laporan barang, kebutuhan tim, dan tindak lanjut harian dalam satu ruang kerja OPS LEGUTI.</p></div>
    </section>
    <section className="login-box-wrap"><div className="login-box"><img src="/jne-logo.jpg" alt="JNE Express" className="login-logo" /><div className="eyebrow">AKSES OPS LEGUTI</div><h2>Selamat datang kembali</h2><p className="subtitle" style={{ marginTop: 7 }}>Masuk ke ruang kerja operasional Anda.</p><LoginForm /><footer className="login-credit">© 2026 OPS LEGUTI<span>Developed by movetra.id</span></footer></div></section>
  </main>;
}
