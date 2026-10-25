import { AppShell } from "@/components/layout/shell";
import { adminNav } from "@/components/layout/nav";
import { requireRole } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["admin"]);
  return (
    <AppShell nav={adminNav} role={profile.role} displayName={profile.displayName}>
      {children}
    </AppShell>
  );
}
