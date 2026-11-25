import { Shield as BrandShield } from 'lucide-react';
import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Bell, FileText, Zap, Shield,
  Building2, Users, Monitor, Radio, Gamepad2,
  BookOpen, BarChart3, ClipboardList, ChevronLeft, ChevronRight, LogOut, Settings,
} from 'lucide-react';
import logo from '../../assets/omniteckno-logo.png';
import { useAuth } from '../../hooks/useAuth';
import { canAccessPage } from '../../utils/permissions';
import { roleLabels } from '../../utils/formatters';
import type { UserRole } from '../../types';

interface NavItemDef {
  to: string;
  icon: React.ReactNode;
  label: string;
}

const NAV_PRIMARY: NavItemDef[] = [
  { to: '/dashboard',   icon: <LayoutDashboard size={18} />, label: 'SOC Overview' },
  { to: '/alerts',      icon: <Bell size={18} />,            label: 'Alert Queue'  },
  { to: '/incidents',   icon: <FileText size={18} />,        label: 'Incidents'  },
  { to: '/events',      icon: <Zap size={18} />,             label: 'Events'  },
  { to: '/rules',       icon: <Shield size={18} />,          label: 'Detection Rules'  },
];

const NAV_MANAGE: NavItemDef[] = [
  { to: '/tenants',     icon: <Building2 size={18} />,  label: 'Tenants'  },
  { to: '/roles',       icon: <Shield size={18} />,     label: 'Roles'  },
  { to: '/users',       icon: <Users size={18} />,      label: 'Users'  },
  { to: '/assets',      icon: <Monitor size={18} />,    label: 'Assets'  },
  { to: '/log-sources', icon: <Radio size={18} />,      label: 'Log Sources'  },
  { to: '/simulator',   icon: <Gamepad2 size={18} />,   label: 'Simulator'  },
  { to: '/playbooks',   icon: <BookOpen size={18} />,   label: 'Playbooks'  },
  { to: '/reports',     icon: <BarChart3 size={18} />,  label: 'Reports'  },
  { to: '/audit',       icon: <ClipboardList size={18} />, label: 'Audit Log'  },
  { to: '/settings', icon: <Settings size={18} />, label: 'Settings' },
];

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
      <div className="sidebar-product-name"><BrandShield size={24} aria-hidden="true" /><span>OmniEdge</span></div>
      <nav className="sidebar-nav">
        {NAV_PRIMARY.filter(item => canAccessPage(role, item.to)).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            aria-label={item.to === '/dashboard' && role === 'platform_admin' ? 'Platform Overview' : item.label}
            title={item.label}
          >
            {item.icon}
            <span>{item.to === '/dashboard' && role === 'platform_admin' ? 'Platform Overview' : item.label}</span>
          </NavLink>
        ))}

        <div className="sidebar-section-label">Manage</div>

        {NAV_MANAGE.filter(item => canAccessPage(role, item.to)).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            aria-label={item.to === '/dashboard' && role === 'platform_admin' ? 'Platform Overview' : item.label}
            title={item.label}
          >
            {item.icon}
            <span>{item.to === '/dashboard' && role === 'platform_admin' ? 'Platform Overview' : item.label}</span>
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
