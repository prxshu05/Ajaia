import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type Doc } from './api';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict';

const SAVE_DEBOUNCE_MS = 800;
const RETRY_MS = 4000;
const POLL_MS = 8000;

/**
 * Keeps one open document in sync with the server:
 *  - debounced autosave with at most one request in flight
 *  - optimistic concurrency (baseVersion) -> surfaces conflicts instead of overwriting
 *  - polling so collaborators' saved changes appear while you are idle
 *  - flushes on navigation and warns before closing the tab with unsaved work
 */
export function useDocumentSync(editor: Editor | null, initial: Doc) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Doc | null>(null);
  const [meta, setMeta] = useState({ updatedAt: initial.updatedAt, updatedBy: initial.updatedBy, title: initial.title });
  const [notice, setNotice] = useState<string | null>(null);
  const [lostAccess, setLostAccess] = useState(false);

  const version = useRef(initial.version);
  const pending = useRef<string | null>(null);
  const lastSynced = useRef<string | null>(null); // editor HTML known to match the server
  const inFlight = useRef(false);
  const blocked = useRef(false); // true while a conflict awaits a decision
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const schedule = useCallback((ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), ms);
  }, []);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current || blocked.current || pending.current === null) return;
    const content = pending.current;
    pending.current = null;
    inFlight.current = true;
    setStatus('saving');
    try {
      const { document } = await api.updateDoc(initial.id, { content, baseVersion: version.current });
      version.current = document.version;
      lastSynced.current = content;
      setMeta({ updatedAt: document.updatedAt, updatedBy: document.updatedBy, title: document.title });
      setError(null);
      setStatus(pending.current === null ? 'saved' : 'unsaved');
    } catch (e) {
      if (pending.current === null) pending.current = content; // keep the unsaved edit
      const err = e as ApiError;
      if (err.status === 409) {
        blocked.current = true;
        setConflict(err.body.document as Doc);
        setStatus('conflict');
      } else if (err.status === 403 || err.status === 404) {
        blocked.current = true;
        setLostAccess(true);
        setStatus('error');
        setError('You no longer have edit access to this document.');
      } else {
        setStatus('error');
        setError(err.message);
        schedule(RETRY_MS);
      }
    } finally {
      inFlight.current = false;
      if (pending.current !== null && !blocked.current) schedule(SAVE_DEBOUNCE_MS);
    }
  }, [initial.id, schedule]);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Baseline: the editor's normalised rendering of the loaded content.
  useEffect(() => {
    if (editor) lastSynced.current = editor.getHTML();
  }, [editor]);

  /** Call on every local edit. */
  const markDirty = useCallback(
    (html: string) => {
      // Ignore no-op updates (e.g. normalisation, or undoing back to the saved state).
      if (html === lastSynced.current && !inFlight.current) {
        pending.current = null;
        clearTimeout(timer.current);
        if (!blocked.current) setStatus('saved');
        return;
      }
      pending.current = html;
      if (!blocked.current) {
        setStatus('unsaved');
        schedule(SAVE_DEBOUNCE_MS);
      }
    },
    [schedule],
  );

  const resolveConflict = useCallback(
    (choice: 'theirs' | 'mine') => {
      if (!conflict || !editor) return;
      version.current = conflict.version;
      blocked.current = false;
      setConflict(null);
      setMeta({ updatedAt: conflict.updatedAt, updatedBy: conflict.updatedBy, title: conflict.title });
      if (choice === 'theirs') {
        pending.current = null;
        editor.commands.setContent(conflict.content, { emitUpdate: false });
        lastSynced.current = editor.getHTML();
        setStatus('saved');
      } else {
        pending.current = editor.getHTML();
        void flush();
      }
    },
    [conflict, editor, flush],
  );

  // Poll for changes saved by collaborators; apply them only when we have nothing unsaved.
  useEffect(() => {
    if (!editor) return;
    const id = setInterval(async () => {
      if (document.visibilityState !== 'visible' || inFlight.current || blocked.current || pending.current !== null) return;
      try {
        const { document: latest } = await api.getDoc(initial.id);
        setMeta((m) => ({ ...m, title: latest.title }));
        if (latest.version <= version.current || pending.current !== null || inFlight.current) return;
        const { from, to } = editor.state.selection;
        editor.commands.setContent(latest.content, { emitUpdate: false });
        const max = editor.state.doc.content.size;
        editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
        version.current = latest.version;
        lastSynced.current = editor.getHTML();
        setMeta({ updatedAt: latest.updatedAt, updatedBy: latest.updatedBy, title: latest.title });
        setNotice(`Updated with changes from ${latest.updatedBy ?? 'a collaborator'}`);
        setTimeout(() => setNotice(null), 4000);
      } catch (e) {
        if ((e as ApiError).status === 404) setLostAccess(true);
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [editor, initial.id]);

  // Warn before closing the tab with unsaved work; flush when navigating away in-app.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current !== null || inFlight.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      clearTimeout(timer.current);
      void flushRef.current();
    };
  }, []);

  return { status, error, conflict, meta, setMeta, notice, lostAccess, markDirty, retry: flush, resolveConflict };
}
