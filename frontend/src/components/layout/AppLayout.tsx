import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useAuth } from '../../hooks/useAuth';
import { Spinner } from '../ui/Spinner';

export function AppLayout() {
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
          <Outlet />
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
