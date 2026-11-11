import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ApiError, api, timeAgo, type Doc } from '../api';
import { ShareDialog } from '../components/ShareDialog';
import { Toolbar } from '../components/Toolbar';
import { useDocumentSync, type SaveStatus } from '../useDocumentSync';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDoc(null);
    setError(null);
    api
      .getDoc(id!)
      .then((r) => setDoc(r.document))
      .catch((e: ApiError) =>
        setError(e.status === 404 ? "This document doesn't exist or you don't have access to it." : e.message),
      );
  }, [id]);

  if (error) {
    return (
      <main className="page">
        <div className="empty">
          <p>{error}</p>
          <Link to="/" className="btn">Back to documents</Link>
        </div>
      </main>
    );
  }
  if (!doc) return <div className="center muted">Loading document…</div>;
  return <DocumentEditor key={doc.id} initial={doc} />;
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Not saved',
  conflict: 'Edit conflict',
};

function DocumentEditor({ initial }: { initial: Doc }) {
  const canEdit = initial.role !== 'viewer';
  const location = useLocation();
  const [shareOpen, setShareOpen] = useState(false);
  const [title, setTitle] = useState(initial.title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const titleFocused = useRef(false);

  const markDirtyRef = useRef<(html: string) => void>(() => {});
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: !canEdit, autolink: true },
        // trailingNode silently appends a paragraph on open, which would register as an edit
        // (and an autosave attributed to someone who only viewed the document).
        trailingNode: false,
      }),
      Placeholder.configure({ placeholder: canEdit ? 'Start writing…' : '' }),
    ],
    content: initial.content,
    editable: canEdit,
    autofocus: canEdit && !(location.state as { focusTitle?: boolean } | null)?.focusTitle ? 'end' : false,
    onUpdate: ({ editor: e }) => {
      if (canEdit) markDirtyRef.current(e.getHTML());
    },
  });

  const sync = useDocumentSync(editor, initial);
  markDirtyRef.current = sync.markDirty;

  // Keep the title in sync with remote renames unless the user is editing it.
  useEffect(() => {
    if (!titleFocused.current) setTitle(sync.meta.title);
  }, [sync.meta.title]);

  // New documents land with the title selected so it can be named immediately.
  useEffect(() => {
    if ((location.state as { focusTitle?: boolean } | null)?.focusTitle) titleInput.current?.select();
  }, [location.state]);

  useEffect(() => {
    if (sync.lostAccess) editor?.setEditable(false);
  }, [sync.lostAccess, editor]);

  async function commitTitle() {
    titleFocused.current = false;
    const next = title.trim();
    if (next === sync.meta.title) return setTitle(next);
    if (!next) {
      setTitle(sync.meta.title);
      return setTitleError('Title cannot be empty');
    }
    try {
      const { document } = await api.updateDoc(initial.id, { title: next });
      sync.setMeta((m) => ({ ...m, title: document.title, updatedAt: document.updatedAt, updatedBy: document.updatedBy }));
      setTitleError(null);
    } catch (e) {
      setTitle(sync.meta.title);
      setTitleError((e as Error).message);
    }
  }

  function onTitleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
      editor?.commands.focus('start');
    } else if (e.key === 'Escape') {
      setTitle(sync.meta.title);
      e.currentTarget.blur();
    }
  }

  const docForShare: Doc = { ...initial, title: sync.meta.title };

  return (
    <main className="editor-page">
      <div className="doc-bar">
        <Link to="/" className="btn ghost small" aria-label="Back to documents">← Docs</Link>
        <div className="doc-bar-title">
          {canEdit ? (
            <input
              ref={titleInput}
              className="title-input"
              value={title}
              maxLength={200}
              aria-label="Document title"
              onFocus={() => (titleFocused.current = true)}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={onTitleKey}
            />
          ) : (
            <h1 className="title-static">{sync.meta.title}</h1>
          )}
          <span className="muted small doc-meta">
            {canEdit && <span className={`status status-${sync.status}`}>{STATUS_TEXT[sync.status]}</span>}
            {canEdit && ' · '}Last edited {timeAgo(sync.meta.updatedAt)}
            {sync.meta.updatedBy && ` by ${sync.meta.updatedBy}`}
            {titleError && <span className="error-inline"> · {titleError}</span>}
          </span>
        </div>
        <span className={`badge badge-${initial.role}`}>
          {initial.role === 'owner' ? 'Owner' : initial.role === 'editor' ? 'Can edit' : 'View only'}
        </span>
        <button className="btn primary" onClick={() => setShareOpen(true)}>Share</button>
      </div>

      {canEdit && editor && !sync.lostAccess && <Toolbar editor={editor} />}

      {!canEdit && (
        <div className="banner info">You have view-only access. Ask {initial.owner.name} if you need to edit.</div>
      )}
      {sync.lostAccess && <div className="banner warn">Your access to this document has changed. Reload to see your current access.</div>}
      {sync.status === 'error' && !sync.lostAccess && (
        <div className="banner warn">
          Couldn't save: {sync.error}. Retrying automatically…{' '}
          <button className="btn small" onClick={() => void sync.retry()}>Retry now</button>
        </div>
      )}
      {sync.conflict && (
        <div className="banner warn">
          <span>
            <strong>{sync.conflict.updatedBy ?? 'Someone'}</strong> saved changes while you were editing. Your latest edits are
            not saved yet.
          </span>
          <span className="banner-actions">
            <button className="btn small" onClick={() => sync.resolveConflict('theirs')}>Load their version</button>
            <button className="btn small primary" onClick={() => sync.resolveConflict('mine')}>Keep mine (overwrite)</button>
          </span>
        </div>
      )}
      {sync.notice && <div className="toast" role="status">{sync.notice}</div>}

      <div className="paper-scroll" onMouseDown={(e) => {
        // clicking the grey margin focuses the document, like a word processor
        if (e.target === e.currentTarget && canEdit) { e.preventDefault(); editor?.commands.focus('end'); }
      }}>
        <article className="paper">
          <EditorContent editor={editor} />
        </article>
      </div>

      {shareOpen && <ShareDialog doc={docForShare} onClose={() => setShareOpen(false)} />}
    </main>
  );
}
