import { serverEnv } from "@/lib/env";
import { requireUser } from "@/lib/auth/request";
import { can } from "@/lib/auth/roles";

export default async function VelumaPage() {
  const user = await requireUser();
  const env = serverEnv();
  const configured = Boolean(env.VELUMA_BASE_URL && env.VELUMA_API_KEY);
  return (
    <>
      <h1>Veluma transport</h1>
      <p className="lede">
        Day-one transport is file-drop of the same envelope Book4Time will automate into Veluma. Live pull/webhook is
        config, not code. Secrets are server-env only and are never rendered back.
      </p>
      <div className="card">
        <p>Base URL set: {env.VELUMA_BASE_URL ? "yes" : "no"}</p>
        <p>API key set: {env.VELUMA_API_KEY ? "yes (write-only)" : "no"}</p>
        <p>Webhook secret set: {env.VELUMA_WEBHOOK_SECRET ? "yes (write-only)" : "no"}</p>
        <p>Poll interval: {env.VELUMA_POLL_INTERVAL ?? "not set"}</p>
        <p>Mode: {configured ? "live-capable" : "file-drop"}</p>
      </div>
      {can(user, "change_config") ? (
        <p className="meta">Set VELUMA_* in server env. There is no client field for secrets (I13).</p>
      ) : (
        <p className="meta">Only admin can change transport config, via server environment.</p>
      )}
    </>
  );
}
