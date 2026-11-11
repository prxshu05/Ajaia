import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, timeAgo, type DocSummary } from '../api';

const ACCEPT = '.txt,.md,.markdown,.docx';

type Tab = 'owned' | 'shared';

export function DocListPage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<{ owned: DocSummary[]; shared: DocSummary[] } | null>(null);
  const [tab, setTab] = useState<Tab>('owned');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'create' | 'import'>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api.listDocs().then(setDocs).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function createDoc() {
    setBusy('create');
    setError(null);
    try {
      const { document } = await api.createDoc();
      navigate(`/d/${document.id}`, { state: { focusTitle: true } });
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setError('That file is larger than 2 MB');
    setBusy('import');
    setError(null);
    try {
      const { document } = await api.importDoc(file);
      navigate(`/d/${document.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  async function deleteDoc(doc: DocSummary) {
    if (!confirm(`Delete “${doc.title}”? People it's shared with will lose access too.`)) return;
    try {
      await api.deleteDoc(doc.id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const list = docs?.[tab] ?? [];

  return (
    <main className="page">
      <div className="list-head">
        <h1>Documents</h1>
        <div className="list-actions">
          <button className="btn" onClick={() => fileInput.current?.click()} disabled={!!busy}>
            {busy === 'import' ? 'Importing…' : 'Import file'}
          </button>
          <button className="btn primary" onClick={createDoc} disabled={!!busy}>
            {busy === 'create' ? 'Creating…' : '+ New document'}
          </button>
          <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={onFile} />
        </div>
      </div>
      <p className="muted small import-hint">
        Import creates a new editable document from a <strong>.txt</strong>, <strong>.md</strong> or{' '}
        <strong>.docx</strong> file (max 2 MB). Headings, lists, bold/italic/underline and links are kept; images are
        dropped and tables are flattened to text.
      </p>

      {error && <div className="error" role="alert">{error}</div>}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'owned'} className={tab === 'owned' ? 'tab active' : 'tab'} onClick={() => setTab('owned')}>
          My documents {docs && <span className="count">{docs.owned.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'shared'} className={tab === 'shared' ? 'tab active' : 'tab'} onClick={() => setTab('shared')}>
          Shared with me {docs && <span className="count">{docs.shared.length}</span>}
        </button>
      </div>

      {!docs && !error && <div className="muted pad">Loading…</div>}
      {docs && list.length === 0 && (
        <div className="empty">
          {tab === 'owned'
            ? 'You have no documents yet. Create one or import a file to get started.'
            : 'Nothing has been shared with you yet.'}
        </div>
      )}

      <ul className="doc-list">
        {list.map((d) => (
          <li key={d.id} className="doc-row">
            <Link to={`/d/${d.id}`} className="doc-link">
              <span className="doc-icon" aria-hidden />
              <span className="doc-text">
                <span className="doc-title">{d.title}</span>
                <span className="muted small">
                  {d.role === 'owner' ? 'Owned by you' : `Owned by ${d.owner.name}`} · Edited {timeAgo(d.updatedAt)}
                  {d.updatedBy && ` by ${d.updatedBy}`}
                </span>
              </span>
              <span className={`badge badge-${d.role}`}>{d.role === 'owner' ? 'Owner' : d.role === 'editor' ? 'Can edit' : 'Can view'}</span>
            </Link>
            {d.role === 'owner' && (
              <button className="btn ghost small danger" onClick={() => deleteDoc(d)} aria-label={`Delete ${d.title}`}>
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
