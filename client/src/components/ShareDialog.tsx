import { useEffect, useState, type FormEvent } from 'react';
import { api, initials, type Doc, type Share, type User } from '../api';

type Props = { doc: Doc; onClose: () => void };

export function ShareDialog({ doc, onClose }: Props) {
  const isOwner = doc.role === 'owner';
  const [shares, setShares] = useState<Share[] | null>(null);
  const [directory, setDirectory] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Share['role']>('editor');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listShares(doc.id).then((r) => setShares(r.shares)).catch((e) => setError(e.message));
    if (isOwner) api.users().then((r) => setDirectory(r.users)).catch(() => {});
  }, [doc.id, isOwner]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run(action: () => Promise<{ shares: Share[] }>) {
    setBusy(true);
    setError(null);
    try {
      setShares((await action()).shares);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return setError('Enter an email address');
    if (await run(() => api.share(doc.id, email, role))) setEmail('');
  }

  const sharedIds = new Set(shares?.map((s) => s.userId));
  const suggestions = directory.filter((u) => !sharedIds.has(u.id));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className="modal-head">
          <h2 id="share-title">Share “{doc.title}”</h2>
          <button className="btn ghost small" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {isOwner ? (
          <form className="share-form" onSubmit={onSubmit}>
            <input
              type="email"
              placeholder="Add people by email"
              list="share-directory"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            <datalist id="share-directory">
              {suggestions.map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
            </datalist>
            <select value={role} onChange={(e) => setRole(e.target.value as Share['role'])} aria-label="Access level">
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button className="btn primary" disabled={busy}>Share</button>
          </form>
        ) : (
          <p className="muted small">Only the owner can change who has access.</p>
        )}

        {error && <div className="error" role="alert">{error}</div>}

        <h3 className="small-heading">People with access</h3>
        <ul className="share-list">
          <li>
            <span className="avatar">{initials(doc.owner.name)}</span>
            <span className="share-who"><strong>{doc.owner.name}</strong><span className="muted small">{doc.owner.email}</span></span>
            <span className="muted small">Owner</span>
          </li>
          {shares === null && <li className="muted small">Loading…</li>}
          {shares?.map((s) => (
            <li key={s.userId}>
              <span className="avatar">{initials(s.name)}</span>
              <span className="share-who"><strong>{s.name}</strong><span className="muted small">{s.email}</span></span>
              {isOwner ? (
                <>
                  <select
                    value={s.role}
                    disabled={busy}
                    aria-label={`Access for ${s.name}`}
                    onChange={(e) => void run(() => api.updateShare(doc.id, s.userId, e.target.value as Share['role']))}
                  >
                    <option value="editor">Can edit</option>
                    <option value="viewer">Can view</option>
                  </select>
                  <button className="btn ghost small danger" disabled={busy} onClick={() => void run(() => api.removeShare(doc.id, s.userId))}>
                    Remove
                  </button>
                </>
              ) : (
                <span className="muted small">{s.role === 'editor' ? 'Can edit' : 'Can view'}</span>
              )}
            </li>
          ))}
        </ul>
        {isOwner && <p className="muted small">Demo users: alice@ajaia.test, bob@ajaia.test, carol@ajaia.test</p>}
      </div>
    </div>
  );
}
