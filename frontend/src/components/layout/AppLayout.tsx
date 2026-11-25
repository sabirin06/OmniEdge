import React from 'react';
import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useAuth } from '../../hooks/useAuth';
import { canAccessPage } from '../../utils/permissions';
import { Spinner } from '../ui/Spinner';

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
