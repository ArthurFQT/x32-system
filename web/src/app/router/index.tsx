
import { AdminPage } from "@/pages/admin";
import { HomePage } from "@/pages/home";
import { MixPage } from "@/pages/mix";
import { NotFoundPage } from "@/pages/not-found";

export function AppRouter() {
  const pathname = window.location.pathname;

  if (pathname === "/") {
    return <HomePage />;
  }

  if (pathname === "/mix") {
    return <MixPage />;
  }

  if (pathname === "/admin") {
    return <AdminPage />;
  }

  return <NotFoundPage />;
}
