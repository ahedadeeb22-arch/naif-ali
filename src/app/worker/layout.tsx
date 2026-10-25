import { AppShell } from "@/components/layout/shell";
import { workerNav } from "@/components/layout/nav";
import { requireRole } from "@/lib/auth/session";

export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["admin", "worker"]);
  return (
    <AppShell nav={workerNav} role={profile.role} displayName={profile.displayName}>
      {children}
    </AppShell>
  );
}
