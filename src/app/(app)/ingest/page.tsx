import { requireUser } from "@/lib/auth/request";
import { can } from "@/lib/auth/roles";
import { ingestFileAction } from "./actions";

export default async function IngestPage() {
  const user = await requireUser();
  if (!can(user, "ingest")) {
    return (
      <>
        <h1>Ingest</h1>
        <p>Admin only.</p>
      </>
    );
  }
  return (
    <>
      <h1>File-drop ingest</h1>
      <p className="lede">
        Normal procedure until Veluma live API is configured. Paste a Veluma envelope JSON (the same shape Book4Time
        automation will send through Veluma).
      </p>
      <form className="card" action={ingestFileAction}>
        <textarea name="envelope" rows={16} style={{ width: "100%" }} required />
        <div style={{ height: 8 }} />
        <button type="submit">Ingest envelope</button>
      </form>
    </>
  );
}
