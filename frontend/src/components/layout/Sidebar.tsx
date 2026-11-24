import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Bell, FileText, Zap, Shield,
  Building2, Users, Monitor, Radio, Gamepad2,
  BookOpen, BarChart3, ClipboardList, ChevronLeft, ChevronRight, LogOut,
} from 'lucide-react';
import logo from '../../assets/omniteckno-logo.png';
import { useAuth } from '../../hooks/useAuth';
import { can, hasRole } from '../../utils/permissions';
import { roleLabels } from '../../utils/formatters';
import type { UserRole } from '../../types';

interface NavItemDef {
  to: string;
  icon: React.ReactNode;
  label: string;
  permission?: string;
  roles?: UserRole[];
}

const NAV_PRIMARY: NavItemDef[] = [
  { to: '/dashboard',   icon: <LayoutDashboard size={18} />, label: 'SOC Overview' },
  { to: '/alerts',      icon: <Bell size={18} />,            label: 'Alert Queue',      roles: ['customer_admin','lead','analyst','soc_lead','soc_analyst'] },
  { to: '/incidents',   icon: <FileText size={18} />,        label: 'Incidents',        roles: ['customer_admin','lead','analyst','soc_lead','soc_analyst'] },
  { to: '/events',      icon: <Zap size={18} />,             label: 'Events',           roles: ['customer_admin','lead','analyst','soc_lead','soc_analyst'] },
  { to: '/rules',       icon: <Shield size={18} />,          label: 'Detection Rules',  roles: ['lead','soc_lead'] },
];

const NAV_MANAGE: NavItemDef[] = [
  { to: '/tenants',     icon: <Building2 size={18} />,  label: 'Tenants',       roles: ['platform_admin'] },
  { to: '/roles',       icon: <Shield size={18} />,     label: 'Roles',         roles: ['platform_admin'] },
  { to: '/users',       icon: <Users size={18} />,      label: 'Users',         roles: ['customer_admin','platform_admin'] },
  { to: '/assets',      icon: <Monitor size={18} />,    label: 'Assets',        roles: ['customer_admin','lead','analyst','soc_lead','soc_analyst'] },
  { to: '/log-sources', icon: <Radio size={18} />,      label: 'Log Sources',   roles: ['customer_admin','lead','soc_lead'] },
  { to: '/simulator',   icon: <Gamepad2 size={18} />,   label: 'Simulator',     roles: ['customer_admin'] },
  { to: '/playbooks',   icon: <BookOpen size={18} />,   label: 'Playbooks',     roles: ['lead','soc_lead'] },
  { to: '/reports',     icon: <BarChart3 size={18} />,  label: 'Reports',       roles: ['customer_admin','lead','analyst','soc_lead','soc_analyst'] },
  { to: '/audit',       icon: <ClipboardList size={18} />, label: 'Audit Log',  roles: ['lead','soc_lead','customer_admin'] },
];

function navVisible(item: NavItemDef, role: UserRole | undefined): boolean {
  if (!item.roles) return true;
  return item.roles.includes(role as UserRole);
}

export function Sidebar() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  const role = user?.role as UserRole | undefined;
  const initials = user?.full_name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() ?? '?';

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <img src={logo} alt="OmniTeckno" className="sidebar-brand-logo" />
        <span className="sidebar-logo-text">OmniEdge</span>
        <button
          className="btn btn-ghost btn-icon"
          style={{ marginLeft: 'auto' }}
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {NAV_PRIMARY.filter(item => navVisible(item, role)).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            title={collapsed ? item.label : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}

        <div className="sidebar-section-label">Manage</div>

        {NAV_MANAGE.filter(item => navVisible(item, role)).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            title={collapsed ? item.label : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user-avatar">{initials}</div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{user?.full_name ?? user?.username}</div>
          <div className="sidebar-user-role">{user?.managed_role_detail?.name ?? (role ? roleLabels[role] : '')}</div>
        </div>
        <button
          className="btn btn-ghost btn-icon"
          style={{ marginLeft: 'auto', flexShrink: 0 }}
          onClick={() => logout()}
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
