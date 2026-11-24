import React from 'react';
import { useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':   'SOC Overview',
  '/alerts':      'Alert Queue',
  '/incidents':   'Incidents',
  '/events':      'Events',
  '/rules':       'Detection Rules',
  '/tenants':     'Tenants',
  '/users':       'Users',
  '/assets':      'Assets',
  '/log-sources': 'Log Sources',
  '/simulator':   'Event Simulator',
  '/playbooks':   'Playbooks',
  '/reports':     'Reports',
  '/audit':       'Audit Log',
};

export function TopBar() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  // Find best matching title
  const title = Object.entries(PAGE_TITLES)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([path]) => pathname.startsWith(path))?.[1] ?? 'OmniEdge';

  return (
    <header className="topbar">
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-actions">
        {user?.tenant_name && (
          <span className="chip">{user.tenant_name}</span>
        )}
        <button className="btn btn-ghost btn-icon" title="Notifications">
          <Bell size={18} />
        </button>
      </div>
    </header>
  );
}
