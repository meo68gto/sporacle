import { Nav } from "@/components/Nav";
import { requireUser } from "@/lib/auth/request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <Nav user={user} />
      <main>{children}</main>
    </>
  );
}
