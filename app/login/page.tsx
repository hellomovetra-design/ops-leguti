import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return <main className="login-page">
    <section className="login-art">
      <div className="brand" style={{ border: 0, padding: 0 }}><img src="/jne-logo.jpg" alt="JNE Express" className="brand-mark" style={{ width: 62, height: 48 }} /><div><div className="brand-title">OPS LEGUTI</div><div className="brand-sub">OPERATIONAL ANALYTICS</div></div></div>
      <div className="login-quote"><div className="eyebrow" style={{ color: "#ff6267" }}>Logistics intelligence</div><h1>Decisions move faster when operations are visible.</h1><p>Dari data mentah harian menjadi insight yang siap ditindaklanjuti—akurasi kurir, performa SLA, dan pola shipment dalam satu pusat kendali.</p></div>
      <div style={{ fontSize: 10, color: "#7f8bb5" }}>© 2026 JNE Ops Leguti · Internal Operations System</div>
    </section>
    <section className="login-box-wrap"><div className="login-box"><img src="/jne-logo.jpg" alt="JNE Express" className="login-logo" /><div className="eyebrow">Secure access</div><h2>Selamat datang kembali</h2><p className="subtitle" style={{ marginTop: 7 }}>Masuk untuk mengakses dashboard operasional.</p><LoginForm /></div></section>
  </main>;
}
