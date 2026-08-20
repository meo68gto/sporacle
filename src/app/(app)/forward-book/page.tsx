import { getDb } from "@/lib/runtime";
import { source } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/request";
import { can } from "@/lib/auth/roles";
import { unblockAction } from "../feeds/actions";

export default async function ForwardBookPage() {
  const user = await requireUser();
  const db = await getDb();
  const d7 = (await db.select().from(source).where(eq(source.key, "D7")))[0];
  return (
    <>
      <h1>Forward book</h1>
      {d7?.status === "blocked" ? (
        <div className="card fail">
          <p>
            <strong>Blocked</strong> · report 1656 · {d7.blockedReason} · since {d7.blockedSince}
          </p>
          <p className="lede">
            This is the highest-value report in the set and the broken one. Chase Book4Time. When it is fixed upstream,
            ingest lights this page — no new UI work.
          </p>
          {can(user, "unblock_source") ? (
            <form action={unblockAction}>
              <input type="hidden" name="key" value="D7" />
              <input name="reason" placeholder="Why this is safe to unblock" required />
              <button type="submit">Unblock (admin, audited)</button>
            </form>
          ) : null}
        </div>
      ) : (
        <p>Source is {d7?.status}. Facts will appear here when deliveries are active.</p>
      )}
    </>
  );
}
