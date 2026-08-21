"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/auth/roles";
import type { NavFlags } from "@/lib/nav-flags";
import { MEASURE_DEFS } from "@/lib/measures/registry";

/**
 * Dark left sidebar (design spec §2.1). Four grouped sections plus an
 * admin-only group. Flags are derived server-side (src/lib/nav-flags.ts)
 * and passed in; when flags are unavailable no flag is rendered (I5:
 * absent is not zero — we never show a fabricated count).
 */

type NavItem = { href: string; label: string; flag?: string | null; admin?: boolean };
type NavGroup = { label: string; items: NavItem[] };

// D5's basis is a property of the source registry, not copy — derive it (I6).
const BOOKING_BASIS_FLAG = MEASURE_DEFS.booking_value_by_source.dateBasis.replace("_", " ");

function groups(flags: NavFlags | null | undefined): NavGroup[] {
  return [
    {
      label: "Daily",
      items: [
        { href: "/today", label: "Today" },
        { href: "/demand", label: "Demand by hour" },
        { href: "/status", label: "Status mix" },
        { href: "/booking-source", label: "Booking sources", flag: BOOKING_BASIS_FLAG },
      ],
    },
    {
      label: "Reconciliation",
      items: [
        { href: "/variance", label: "Variance ledger", flag: flags ? String(flags.varianceMeasures) : null },
        { href: "/hypotheses", label: "Hypothesis board", flag: flags ? `${flags.openHypotheses} open` : null },
      ],
    },
    {
      label: "Operations",
      items: [{ href: "/labor", label: "Labor & coverage" }],
    },
    {
      label: "Foundations",
      items: [
        { href: "/health", label: "Data health", flag: flags ? `${flags.blockedSources} blocked` : null },
        { href: "/gates", label: "Sufficiency gates", flag: flags ? `${flags.gatesOpen}/${flags.gatesTotal}` : null },
        { href: "/pricing", label: "Pricing workbench", flag: flags ? (flags.pricingLocked ? "locked" : "open") : null },
      ],
    },
    {
      label: "Admin",
      items: [
        { href: "/ingest", label: "Ingest", admin: true },
        { href: "/audit", label: "Audit", admin: true },
      ],
    },
  ];
}

export function Nav({ user, flags }: { user: SessionUser; flags?: NavFlags | null }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand-block">
        <div className="sidebar-brand">SPORACLE</div>
        <div className="sidebar-tagline">the spa oracle</div>
        <div className="sidebar-hairline" />
        <div className="sidebar-location">
          Well &amp; Being Spa
          <br />
          Fairmont Scottsdale Princess
        </div>
      </div>
      <nav className="sidebar-nav">
        {groups(flags)
          .filter((g) => g.items.some((l) => !l.admin || user.role === "admin"))
          .map((g) => (
            <div key={g.label}>
              <div className="nav-group-label">{g.label}</div>
              {g.items
                .filter((l) => !l.admin || user.role === "admin")
                .map((l) => (
                  <Link key={l.href} href={l.href} className={`nav-item${isActive(l.href) ? " active" : ""}`}>
                    <span>{l.label}</span>
                    {l.flag ? <span className="nav-flag">{l.flag}</span> : null}
                  </Link>
                ))}
            </div>
          ))}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-hairline" />
        <div className="sidebar-user">{user.actor}</div>
        <div className="sidebar-role">{user.role}</div>
        <form className="sidebar-logout" action="/api/logout" method="post">
          <button type="submit">Log out</button>
        </form>
      </div>
    </aside>
  );
}
