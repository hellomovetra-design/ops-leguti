import { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "OPS LEGUTI Mobile", short_name: "OPS LEGUTI", description: "Ruang kerja operasional OPS LEGUTI", id: "/pwa", start_url: "/pwa", scope: "/", display: "standalone", background_color: "#f5f7fb", theme_color: "#102d57", icons: [{ src: "/branding/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "/branding/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }], categories: ["business"] };
}
