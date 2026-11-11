import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { initials } from '../api';
import { useAuth } from '../auth';

export function AppHeader({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <header className="app-header">
      <Link to="/" className="brand"><span className="brand-mark" /> Ajaia Docs</Link>
      <div className="header-slot">{children}</div>
      {user && (
        <div className="header-user">
          <span className="avatar" title={user.email}>{initials(user.name)}</span>
          <span className="header-name">{user.name}</span>
          <button className="btn ghost small" onClick={() => void logout()}>Sign out</button>
        </div>
      )}
    </header>
  );
}
