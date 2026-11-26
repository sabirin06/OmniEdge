import React, { useEffect } from 'react';
import { currentSupportWorkspace } from '../../api/supportWorkspace';
import { platformApi } from '../../api/platform';
import { useApi } from '../../hooks/useApi';
import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useAuth } from '../../hooks/useAuth';
import { canAccessPage } from '../../utils/permissions';
import { Spinner } from '../ui/Spinner';

function PlatformNotices({ userId }: { userId: number }) {
  const { data, refresh } = useApi(platformApi.notice, [userId]);
  useEffect(() => {
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return <>
    {data?.maintenance && <p className="platform-notice" role="status">{data.maintenance}</p>}
    {data?.support_active && <p className="platform-notice" role="status">A Platform Administrator is viewing a read-only support session for your organization or account.</p>}
  </>;
}

function SupportWorkspaceNotice() {
  const { leaveSupport } = useAuth();
  const workspace = currentSupportWorkspace();
  const [expired, setExpired] = React.useState(false);
  useEffect(() => {
    if (!workspace) return;
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, Date.parse(workspace.expires_at) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [workspace?.expires_at]);
  if (!workspace) return null;
  return <div className="platform-notice workspace-heading" role="status">
    <span>{expired ? 'Support session expired.' : `Read-only support workspace for ${workspace.label} | Expires ${new Date(workspace.expires_at).toLocaleTimeString()}`}</span>
    <button type="button" className="btn btn-secondary" onClick={() => void leaveSupport().catch(() => {})}>Return to Super Admin</button>
  </div>;
}

export function AppLayout() {
  const { pathname } = useLocation();
  const { user, loading } = useAuth();

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <Spinner large />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="content-area">
        <TopBar />
        {currentSupportWorkspace() ? <SupportWorkspaceNotice /> : <PlatformNotices key={user.id} userId={user.id} />}
        <main className="page-content">
          {canAccessPage(user.role, pathname) ? <Outlet /> : (
            <section className="panel page-stack">
              <h2>Access denied</h2>
              <p>Your role cannot open this page.</p>
              <Link className="btn btn-secondary" to="/dashboard">Back to dashboard</Link>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

// Protected Route wrapper
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <Spinner large />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
