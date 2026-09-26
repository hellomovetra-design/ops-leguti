import { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "OPS LEGUTI Mobile", short_name: "OPS LEGUTI", description: "Request operasional JNE OPS LEGUTI", id: "/pwa", start_url: "/pwa", scope: "/", display: "standalone", background_color: "#f5f7fb", theme_color: "#0b1b4d", icons: [{ src: "/jne-logo.jpg", sizes: "320x320", type: "image/jpeg", purpose: "any maskable" }] };
}
