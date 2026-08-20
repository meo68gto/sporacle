export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <LoginInner searchParams={searchParams} />
  );
}

async function LoginInner({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <main>
      <h1>Sporacle</h1>
      <p className="lede">Staff sign-in. Allowlisted emails only. This is not a public product.</p>
      <form className="card" action="/api/login" method="post">
        <label>
          Email
          <br />
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <div style={{ height: 12 }} />
        <button type="submit">Continue</button>
        {sp.error === "forbidden" ? <p className="warn">That email is not on the allowlist.</p> : null}
      </form>
    </main>
  );
}
