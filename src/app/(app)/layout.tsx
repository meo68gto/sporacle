import { Nav } from "@/components/Nav";
import { requireUser } from "@/lib/auth/request";
import { getDb } from "@/lib/runtime";
import { navFlags, type NavFlags } from "@/lib/nav-flags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Sidebar flags are derived from the same tables the screens read.
  // If derivation fails the nav simply renders no flags (I5: absent is
  // not zero — never a fabricated count).
  let flags: NavFlags | null = null;
  try {
    flags = await navFlags(await getDb());
  } catch {
    flags = null;
  }
  return (
    <div className="shell">
      <Nav user={user} flags={flags} />
      <main className="main">{children}</main>
    </div>
  );
}
