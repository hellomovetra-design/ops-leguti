import type { Viewport } from "next";
import "./launch.css";

export const viewport: Viewport = { themeColor: "#102d57" };

export default function PwaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
