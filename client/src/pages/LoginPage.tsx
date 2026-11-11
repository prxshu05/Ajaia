import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { initials } from '../api';
import { useAuth } from '../auth';

const DEMO_PASSWORD = 'password123';
const DEMO_USERS = [
  { name: 'Alice Chen', email: 'alice@ajaia.test', hint: 'Owns the shared demo doc' },
  { name: 'Bob Okafor', email: 'bob@ajaia.test', hint: 'Has editor access to it' },
  { name: 'Carol Diaz', email: 'carol@ajaia.test', hint: 'No access — try sharing with her' },
];

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function doLogin(e: string, p: string) {
    setBusy(true);
    setError(null);
    try {
      await login(e, p);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return setError('Enter your email and password');
    void doLogin(email, password);
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand brand-lg"><span className="brand-mark" /> Ajaia Docs</div>
        <p className="muted">Sign in to create, edit and share documents.</p>

        <form onSubmit={onSubmit} className="stack">
          <label>
            Email
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <div className="error" role="alert">{error}</div>}
          <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>

        <div className="demo">
          <div className="demo-title">Demo accounts <span className="muted">(password: <code>{DEMO_PASSWORD}</code>)</span></div>
          {DEMO_USERS.map((u) => (
            <button key={u.email} className="demo-user" disabled={busy} onClick={() => doLogin(u.email, DEMO_PASSWORD)}>
              <span className="avatar">{initials(u.name)}</span>
              <span className="demo-user-text">
                <strong>{u.name}</strong>
                <span className="muted small">{u.email} · {u.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
