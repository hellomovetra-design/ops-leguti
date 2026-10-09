import type { SessionPayload } from "@/lib/auth-token";

export const dashboardRoles = ["super_admin", "admin", "spv", "jr_spv", "coordinator"];
const desktopRoots = ["/dashboard", "/reports", "/master", "/settings", "/public"];
const fullAccessRoles = ["super_admin", "admin", "spv"];
const fullAccessRoots = ["/settings/ops-access", "/master/personnel-changes"];
export const withinRoute = (path: string, root: string) => path === root || path.startsWith(`${root}/`);
export const isDesktopRoute = (path: string) => desktopRoots.some(root => withinRoute(path, root));
export const isProtectedRoute = (path: string) => isDesktopRoute(path) || withinRoute(path, "/pwa");
export function canOpenRoute(role: SessionPayload["role"], path: string) {
  if (withinRoute(path, "/pwa")) return true;
  if (!isDesktopRoute(path) || !dashboardRoles.includes(role)) return false;
  return !fullAccessRoots.some(root => withinRoute(path, root)) || fullAccessRoles.includes(role);
}
export function loginDestination(role: SessionPayload["role"], next?: unknown) {
  const fallback = dashboardRoles.includes(role) ? "/dashboard" : "/pwa";
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u0020]/.test(next)) return fallback;
  try {
    const url = new URL(next, "https://ops.invalid");
    if (url.origin !== "https://ops.invalid" || !canOpenRoute(role, url.pathname)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}
