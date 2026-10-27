import { redirect } from "next/navigation";
import { ADMIN_MENUS } from "@/lib/admin-navigation";

export default function Page() {
  redirect(ADMIN_MENUS[0].href);
}
