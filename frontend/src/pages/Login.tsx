import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import logo from '../assets/omniteckno-logo.png';
import { useAuth } from '../contexts/AuthContext';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at top, #161B22 0%, #0D1117 100%)',
      padding: '24px',
      color: 'var(--color-text-primary)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '460px',
        background: 'var(--color-surface, #161B22)',
        border: '1px solid var(--color-border, #30363D)',
        borderRadius: '12px',
        padding: '36px',
        boxShadow: '0 12px 36px rgba(0,0,0,0.5)'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img src={logo} alt="OmniTeckno" style={{ width: 160, maxWidth: '100%', marginBottom: 14 }} />
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>
            OmniEdge
          </h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary, #8B949E)', fontSize: '13px' }}>
            Security Operations & Incident Response Management
          </p>
        </div>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px',
            background: 'rgba(255, 123, 114, 0.1)',
            border: '1px solid var(--color-critical, #FF7B72)',
            borderRadius: '6px',
            color: '#FF7B72',
            fontSize: '13px',
            marginBottom: '20px'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary, #8B949E)' }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="analyst@horizonbank.com"
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 36px',
                  background: 'var(--color-canvas)',
                  border: '1px solid var(--color-border, #30363D)',
                  borderRadius: '6px',
                  color: 'var(--color-text-primary)',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary, #8B949E)' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 36px',
                  background: 'var(--color-canvas)',
                  border: '1px solid var(--color-border, #30363D)',
                  borderRadius: '6px',
                  color: 'var(--color-text-primary)',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '11px',
              background: 'var(--color-brand-button)',
              border: 'none',
              borderRadius: '6px',
              color: '#FFFFFF',
              fontWeight: '600',
              fontSize: '14px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Authenticating...' : 'Sign In to Security Center'}
          </button>
        </form>
      </div>
    </div>
  );
}
