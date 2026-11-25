import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '80vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '24px'
    }}>
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-danger)',
        marginBottom: '16px'
      }}>
        <ShieldAlert size={32} />
      </div>
      <h1 style={{ fontSize: '28px', fontWeight: '700', margin: '0 0 8px 0', color: 'var(--color-text-primary)' }}>
        404 - Resource Not Found
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', maxWidth: '420px', margin: '0 0 24px 0' }}>
        The security console endpoint or record you requested does not exist or has been archived.
      </p>
      <button
        onClick={() => navigate('/dashboard')}
        className="btn btn-primary"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
      >
        <ArrowLeft size={16} />
        <span>Return to SOC Dashboard</span>
      </button>
    </div>
  );
}
