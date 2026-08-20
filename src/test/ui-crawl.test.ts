import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir)) {
    const full = path.join(dir, ent);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".tsx") || full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("UI copy invariants", () => {
  it("never labels a figure Revenue / Total Sales", () => {
    const files = walk(path.join(process.cwd(), "src/app"));
    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      if (/"Revenue"|'Revenue'|Total Revenue|Total Sales/.test(text)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });

  it("has no YoY control (I10)", () => {
    const files = walk(path.join(process.cwd(), "src"));
    const hits: string[] = [];
    for (const f of files) {
      if (f.includes(".test.")) continue;
      const text = readFileSync(f, "utf8");
      if (/year-over-year|vs last year|yoy/i.test(text)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });

  it("gates are linked from nav", () => {
    const nav = readFileSync(path.join(process.cwd(), "src/components/Nav.tsx"), "utf8");
    expect(nav).toContain("/gates");
    expect(nav).toContain("/pricing");
  });

  it("figures require provenance chips", () => {
    const fig = readFileSync(path.join(process.cwd(), "src/components/Figure.tsx"), "utf8");
    expect(fig).toContain("ProvenanceChip");
  });
});
