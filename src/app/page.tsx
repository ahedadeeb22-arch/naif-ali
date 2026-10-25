import { redirect } from "next/navigation";
import { landingPath, requireProfile } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = await requireProfile();
  redirect(landingPath(profile.role));
}
