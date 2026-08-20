import { getDb } from "@/lib/runtime";
import { feedAdapter, source } from "@/db/schema";
import { EXTRA_ADAPTERS, SOURCE_SEED } from "@/db/sources";

export default async function FeedsPage() {
  const db = await getDb();
  const adapters = await db.select().from(feedAdapter);
  const sources = await db.select().from(source);
  const keys = [
    ...SOURCE_SEED.map((s) => ({ feedKey: s.feedKey, label: s.label })),
    ...EXTRA_ADAPTERS.map((a) => ({ feedKey: a.feedKey, label: a.notes })),
  ];
  return (
    <>
      <h1>Feed adapters</h1>
      <p className="lede">Honest empty states. Zero synthetic rows. All feeds arrive as Veluma envelopes.</p>
      <table>
        <thead>
          <tr>
            <th>feed_key</th>
            <th>status</th>
            <th>notes</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const a = adapters.find((x) => x.feedKey === k.feedKey);
            const src = sources.find((s) => SOURCE_SEED.find((z) => z.feedKey === k.feedKey)?.key === s.key);
            const status = a?.status ?? (src?.status === "blocked" ? "blocked" : "not_configured");
            return (
              <tr key={k.feedKey}>
                <td>{k.feedKey}</td>
                <td>{status}</td>
                <td>{a?.notes ?? k.label} {src?.blockedReason ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
