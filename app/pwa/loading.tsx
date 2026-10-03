export default function Loading() {
  return <main className="pwa-launch-screen" role="status" aria-live="polite" aria-label="Memuat OPS LEGUTI">
    <div className="pwa-launch-brand">
      <img src="/branding/app-logo-transparent-192.png" width={112} height={112} alt="" fetchPriority="high"/>
      <strong>OPS LEGUTI</strong>
      <span>Ruang kerja operasional</span>
      <div className="pwa-launch-progress" aria-hidden="true"/>
    </div>
  </main>;
}
