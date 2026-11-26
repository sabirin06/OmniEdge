import React, { useState } from 'react';
import { requestError } from '../api/errors';
import { isAxiosError } from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import logo from '../assets/omniteckno-logo.png';
import { useAuth } from '../contexts/AuthContext';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [mfa, setMfa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password, mfa ? otp : undefined);
      navigate('/dashboard');
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      if (status === 428) { setMfa(true); setError('Enter an authenticator code or a recovery code.'); }
      else if (status === 401) setError('Check your email address and password, then try again.');
      else if (status === 403) setError('The sign-in security check failed. Reload this page and try again.');
      else setError(requestError(err, 'Could not sign you in.'));
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
      background: 'radial-gradient(ellipse at top, var(--color-surface) 0%, var(--color-canvas) 100%)',
      padding: '24px',
      color: 'var(--color-text-primary)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '460px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '12px',
        padding: '36px',
        boxShadow: 'var(--shadow-lg)'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img src={logo} alt="OmniTeckno" className="login-brand-logo" style={{ width: 160, maxWidth: '100%', marginBottom: 14 }} />
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>
            OmniEdge
          </h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Security Operations & Incident Response Management
          </p>
        </div>

        {error && (
          <div role="alert" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px',
            background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
            border: '1px solid var(--color-critical, var(--color-danger))',
            borderRadius: '6px',
            color: 'var(--color-danger)',
            fontSize: '13px',
            marginBottom: '20px'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="login-email" style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
              <input
                id="login-email"
                autoComplete="username"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="analyst@horizonbank.com"
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 36px',
                  background: 'var(--color-canvas)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  color: 'var(--color-text-primary)',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label htmlFor="login-password" style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
              <input
                id="login-password"
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 36px',
                  background: 'var(--color-canvas)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  color: 'var(--color-text-primary)',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {mfa && <div className="form-group"><label htmlFor="login-otp">Authenticator or recovery code</label>
            <input id="login-otp" value={otp} onChange={event => setOtp(event.target.value)}
              required maxLength={19} autoComplete="one-time-code" autoFocus />
          </div>}
          <button type="submit" className="btn btn-primary" disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '11px' }}>
            {loading ? 'Authenticating...' : 'Sign In to Security Center'}
          </button>
        </form>
        <div className="incident-buttons" style={{ marginTop: 16 }}>
          <Link to="/forgot-password">Forgot password?</Link>
          <Link to="/verify-email">Verify email</Link>
        </div>
      </div>
    </div>
  );
}
