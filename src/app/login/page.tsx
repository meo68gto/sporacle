export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <LoginInner searchParams={searchParams} />;
}

async function LoginInner({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="login">
      <div className="login-panel">
        <h1 className="login-brand">SPORACLE</h1>
        <p className="login-tagline">the spa oracle</p>
        <p className="login-location">
          Well &amp; Being Spa
          <br />
          Fairmont Scottsdale Princess
        </p>
        <div className="login-hairline" />
        <p className="login-lede">Staff sign-in. Allowlisted emails only. This is not a public product.</p>
        <form action="/api/login" method="post">
          <label className="login-field">
            Email
            <input name="email" type="email" required autoComplete="username" />
          </label>
          <button type="submit">Continue</button>
          {sp.error === "forbidden" ? <p className="login-error">That email is not on the allowlist.</p> : null}
        </form>
      </div>
    </main>
  );
}
