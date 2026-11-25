import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Search, Settings } from 'lucide-react';
import { canAccessPage } from '../../utils/permissions';
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
  '/settings':    'Settings',
  '/roles':       'Roles',
};

const searchAreas = [
  { path: '/alerts', label: 'Alerts' },
  { path: '/incidents', label: 'Incidents' },
  { path: '/assets', label: 'Assets' },
];

function RecordSearch({ area }: { area: typeof searchAreas[number] }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  return <form className="topbar-search" role="search" onSubmit={event => {
    event.preventDefault();
    if (query.trim()) navigate({ pathname: area.path, search: new URLSearchParams({ q: query.trim() }).toString() });
  }}>
    <button type="submit" aria-label="Search"><Search size={18} /></button>
    <input type="search" aria-label={`Search ${area.label.toLowerCase()}`} value={query}
      onChange={event => setQuery(event.target.value)} placeholder={`Search ${area.label.toLowerCase()}?`} />
  </form>;
}

export function TopBar() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  // Find best matching title
  const title = Object.entries(PAGE_TITLES)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([path]) => pathname.startsWith(path))?.[1] ?? 'OmniEdge';
  const organization = user?.tenant_detail?.name ?? user?.tenant_name;

  const areas = user ? searchAreas.filter(item => canAccessPage(user.role, item.path)) : [];

  const searchArea = areas.find(item => pathname === item.path || pathname.startsWith(item.path + '/')) ?? areas[0];

  return (
    <header className="topbar">
      <h1 className="topbar-title">{pathname === '/dashboard' && user?.role === 'platform_admin' ? 'Platform Overview' : title}</h1>
      <div className="topbar-actions">
        {searchArea && <RecordSearch key={searchArea.path} area={searchArea} />}
        {organization && (
          <span className="chip">{organization}</span>
        )}
        {user && canAccessPage(user.role, '/alerts') &&
          <Link to="/alerts" className="btn btn-ghost btn-icon" aria-label="Alert Queue" title="Alert Queue"><Bell size={20} /></Link>}
        <Link to="/settings" className="btn btn-ghost btn-icon" aria-label="Settings" title="Settings">
          <Settings size={18} />
        </Link>
      </div>
    </header>
  );
}
