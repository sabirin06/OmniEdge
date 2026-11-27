import { useState } from 'react';
import { authApi } from '../../api/auth';
import { requestError } from '../../api/errors';
import { useApi } from '../../hooks/useApi';
import { ErrorState } from './ErrorState';
import { FormDialog } from './FormDialog';
import { PasswordInput } from './PasswordInput';

export function AccountSecurity() {
  const security = useApi(authApi.security);
  const [mode, setMode] = useState<'start' | 'enable' | 'disable' | 'logout'>();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [key, setKey] = useState('');
  const [recovery, setRecovery] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function close() {
    if (busy) return;
    setMode(undefined); setPassword(''); setCode(''); setKey(''); setError('');
  }

  async function submit() {
    if (!mode || busy) return;
    if (mode !== 'logout' && (!password || (mode !== 'start' && !code.trim()))) {
      setError('Enter your password and the requested code.');
      return;
    }
    setBusy(true); setError('');
    try {
      if (mode === 'logout') {
        await authApi.revokeSessions();
        window.location.replace('/login');
        return;
      }
      const { data } = await authApi.updateSecurity({ action: mode, password, ...(code.trim() ? { code: code.trim() } : {}) });
      if (mode === 'start' && data.setup_key) {
        setKey(data.setup_key);
        setMode('enable');
      } else {
        setRecovery(data.recovery_codes ?? []);
        setMode(undefined); setPassword(''); setCode(''); setKey('');
        security.refresh();
      }
    } catch (failure) {
      setError(requestError(failure, 'Could not update security settings. Check your password and use a fresh code.'));
    } finally { setBusy(false); }
  }

  return <section className="panel page-stack">
    <h3>Account security</h3>
    {security.error ? <ErrorState message={security.error} onRetry={security.refresh} /> :
      !security.data ? <p role="status">Loading security settings...</p> :
      <div className="workspace-heading"><p>Authenticator app: {security.data.mfa_enabled ? 'Enabled' : 'Off'}</p>
        <div className="incident-buttons">
          <button type="button" className="btn btn-secondary" onClick={() => setMode(security.data.mfa_enabled ? 'disable' : 'start')}>
            {security.data.mfa_enabled ? 'Disable authenticator' : 'Set up authenticator'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setMode('logout')}>Sign out everywhere</button>
        </div>
      </div>}
    {mode && <FormDialog open title={mode === 'logout' ? 'Sign out everywhere' : 'Authenticator app'} onClose={close}
      onSubmit={submit} submitLoading={busy} submitLabel={mode === 'logout' ? 'Sign out' : mode === 'start' ? 'Get setup key' : mode === 'enable' ? 'Enable' : 'Disable'}>
      {mode === 'logout' ? <p>This ends all sessions for your account, including this one.</p> : <>
        {key && <p>In your authenticator app, add a time-based account named OmniEdge using this setup key: <code>{key}</code>.</p>}
        <div className="form-group"><label htmlFor="security-password">Current password</label>
          <PasswordInput id="security-password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        {mode !== 'start' && <div className="form-group"><label htmlFor="security-code">{mode === 'enable' ? 'Authenticator code' : 'Authenticator or recovery code'}</label>
          <input id="security-code" maxLength={19} autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} /></div>}
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </FormDialog>}
    {!!recovery.length && <FormDialog open title="Save your recovery codes" onClose={() => setRecovery([])}>
      <p>Store these in a secure place. Each code works once, and this is the only time OmniEdge shows them.</p>
      <ul className="page-stack">{recovery.map(value => <li key={value}><code>{value}</code></li>)}</ul>
      <button type="button" className="btn btn-primary" onClick={() => setRecovery([])}>Done</button>
    </FormDialog>}
  </section>;
}
