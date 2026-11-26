import { useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { sidebarPageName } from './Sidebar';

export function TopBar() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  return <header className="topbar">
    <h1 className="topbar-title">{sidebarPageName(pathname, user?.role)}</h1>
  </header>;
}
