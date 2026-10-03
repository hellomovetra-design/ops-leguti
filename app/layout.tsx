import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "OPS LEGUTI",
  description: "Ruang kerja operasional OPS LEGUTI",
  icons: {
    icon: [
      { url: "/branding/browser-favicon-white-circle-32.png", sizes: "32x32", type: "image/png" },
      { url: "/branding/browser-favicon-white-circle-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/branding/app-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
