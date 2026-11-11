export type User = { id: string; email: string; name: string };
export type Role = 'owner' | 'editor' | 'viewer';

export type DocSummary = {
  id: string;
  title: string;
  role: Role;
  owner: User;
  updatedAt: string;
  updatedBy: string | null;
  createdAt: string;
};
export type Doc = DocSummary & { content: string; version: number };
export type Share = { userId: string; name: string; email: string; role: Exclude<Role, 'owner'> };

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, message: string, body: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: isForm ? init.headers : { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'Network error — check your connection and try again', {});
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body);
  }
  return body as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  me: () => request<{ user: User | null }>('/auth/me'),
  login: (email: string, password: string) => request<{ user: User }>('/auth/login', json('POST', { email, password })),
  logout: () => request<void>('/auth/logout', json('POST')),
  users: () => request<{ users: User[] }>('/users'),

  listDocs: () => request<{ owned: DocSummary[]; shared: DocSummary[] }>('/documents'),
  getDoc: (id: string) => request<{ document: Doc }>(`/documents/${id}`),
  createDoc: (title?: string) => request<{ document: Doc }>('/documents', json('POST', title ? { title } : {})),
  updateDoc: (id: string, patch: { title?: string; content?: string; baseVersion?: number }) =>
    request<{ document: Doc }>(`/documents/${id}`, json('PATCH', patch)),
  deleteDoc: (id: string) => request<void>(`/documents/${id}`, json('DELETE')),
  importDoc: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ document: Doc }>('/documents/import', { method: 'POST', body: form });
  },

  listShares: (id: string) => request<{ shares: Share[] }>(`/documents/${id}/shares`),
  share: (id: string, email: string, role: Share['role']) =>
    request<{ shares: Share[] }>(`/documents/${id}/shares`, json('POST', { email, role })),
  updateShare: (id: string, userId: string, role: Share['role']) =>
    request<{ shares: Share[] }>(`/documents/${id}/shares/${userId}`, json('PATCH', { role })),
  removeShare: (id: string, userId: string) =>
    request<{ shares: Share[] }>(`/documents/${id}/shares/${userId}`, json('DELETE')),
};

export function timeAgo(iso: string): string {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const initials = (name: string) =>
  name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
