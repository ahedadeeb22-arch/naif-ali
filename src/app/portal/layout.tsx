import { AppShell } from "@/components/layout/shell";
import { portalNav } from "@/components/layout/nav";
import { requireRole } from "@/lib/auth/session";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["store_owner"]);
  return (
    <AppShell nav={portalNav} role={profile.role} displayName={profile.displayName}>
      {children}
    </AppShell>
  );
}
