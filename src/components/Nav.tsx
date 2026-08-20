import Link from "next/link";
import type { SessionUser } from "@/lib/auth/roles";

const LINKS: { href: string; label: string; admin?: boolean }[] = [
  { href: "/variance", label: "Variance" },
  { href: "/hypotheses", label: "Hypotheses" },
  { href: "/health", label: "Data health" },
  { href: "/demand", label: "Demand" },
  { href: "/status", label: "Status mix" },
  { href: "/booking-source", label: "Booking source" },
  { href: "/occupancy", label: "Occupancy" },
  { href: "/turnaway", label: "Turnaway" },
  { href: "/labor", label: "Labor" },
  { href: "/coverage", label: "Coverage" },
  { href: "/forward-book", label: "Forward book" },
  { href: "/feeds", label: "Feeds" },
  { href: "/veluma", label: "Veluma" },
  { href: "/gates", label: "Sufficiency gates" },
  { href: "/pricing", label: "Pricing" },
  { href: "/ingest", label: "Ingest", admin: true },
  { href: "/audit", label: "Audit", admin: true },
];

export function Nav({ user }: { user: SessionUser }) {
  return (
    <header className="top">
      <div className="brand">Sporacle</div>
      <nav>
        {LINKS.filter((l) => !l.admin || user.role === "admin").map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="who">
        {user.actor} · {user.role}
        <form action="/api/logout" method="post">
          <button type="submit">Log out</button>
        </form>
      </div>
    </header>
  );
}
