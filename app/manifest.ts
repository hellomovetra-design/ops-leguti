import { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "OPS LEGUTI Mobile", short_name: "OPS LEGUTI", description: "Request operasional JNE OPS LEGUTI", start_url: "/pwa", display: "standalone", background_color: "#f5f7fb", theme_color: "#0b1b4d", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }] };
}
