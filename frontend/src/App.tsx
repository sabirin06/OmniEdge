import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout, ProtectedRoute } from './components/layout/AppLayout';

// Pages
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Alerts } from './pages/Alerts';
import { AlertDetail } from './pages/AlertDetail';
import { Incidents } from './pages/Incidents';
import { IncidentDetail } from './pages/IncidentDetail';
import { Events } from './pages/Events';
import { Rules } from './pages/Rules';
import { Tenants } from './pages/Tenants';
import { Users } from './pages/Users';
import { Roles } from './pages/Roles';
import { Assets } from './pages/Assets';
import { LogSources } from './pages/LogSources';
import { Simulator } from './pages/Simulator';
import { Playbooks } from './pages/Playbooks';
import { Reports } from './pages/Reports';
import { Audit } from './pages/Audit';
import { Settings } from './pages/Settings';
import { NotFound } from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Authenticated Application Shell */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/alerts/:id" element={<AlertDetail />} />
          <Route path="/incidents" element={<Incidents />} />
          <Route path="/incidents/:id" element={<IncidentDetail />} />
          <Route path="/events" element={<Events />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/log-sources" element={<LogSources />} />
          <Route path="/simulator" element={<Simulator />} />
          <Route path="/playbooks" element={<Playbooks />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/tenants" element={<Tenants />} />
          <Route path="/roles" element={<Roles />} />
          <Route path="/users" element={<Users />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
