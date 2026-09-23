import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, ROLE_LABEL } from "../AuthContext";

const DEMO_ACCOUNTS = [
  { username: "admin", password: "admin123", role: "admin", can: "Everything: thresholds, storm simulator, broadcasts" },
  { username: "officer", password: "officer123", role: "officer", can: "Dispatch teams, add notes, update reports" },
  { username: "viewer", password: "viewer123", role: "viewer", can: "Read-only monitoring" },
];

// only same-site paths, so ?next= can't bounce people to another website
export function safeNext(next) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export default function Login() {
  const { user, login } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get("next"));

  if (user) return <Navigate to={next} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return setError("Enter your username and password.");
    setBusy(true);
    setError("");
    try {
      await login(username.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit} aria-labelledby="login-title">
        <div className="brand" style={{ marginBottom: 20 }}>
          <div className="brand-mark">UP</div>
          <div>
            <div className="brand-name">UrbanPulse</div>
            <div className="brand-sub">Chennai ICCC · staff sign-in</div>
          </div>
        </div>
        <h1 id="login-title" className="login-title">Sign in to the command center</h1>

        <label className="field">
          <span className="field-label">Username</span>
          <input className="input" autoComplete="username" autoFocus value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }} />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} />
        </label>

        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn full" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>

        <div className="demo-accounts">
          <div className="legend-title" style={{ marginBottom: 8 }}>Demo accounts (click to fill)</div>
          {DEMO_ACCOUNTS.map((a) => (
            <button type="button" key={a.username} className="demo-account" onClick={() => { setUsername(a.username); setPassword(a.password); setError(""); }}>
              <span><strong>{a.username}</strong> / {a.password}</span>
              <span className="muted small">{ROLE_LABEL[a.role]}: {a.can}</span>
            </button>
          ))}
        </div>

        <a className="link" href="/citizen" style={{ marginTop: 14, display: "inline-block" }}>Citizen? Open the public flood app →</a>
      </form>
    </div>
  );
}
