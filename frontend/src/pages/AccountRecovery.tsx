import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { authApi } from '../api/auth';
import { requestError } from '../api/errors';
import { PasswordInput } from '../components/ui/PasswordInput';

export function AccountRecovery({ flow }: { flow: 'password' | 'verify' }) {
  const verify = flow === 'verify';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const resend = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'request';
    setBusy(true); setError(''); setNotice('');
    try {
      const result = resend ? await authApi.requestCode(flow, email.trim()) :
        await authApi.confirmCode(flow, { email: email.trim(), code, ...(verify ? {} : { password }) });
      setNotice(result.data.message);
      if (!resend) { setDone(true); setPassword(''); setCode(''); }
    } catch (failure) {
      const status = isAxiosError(failure) ? failure.response?.status : undefined;
      setError(status === 503 ? 'Email delivery is unavailable. Contact your administrator.' :
        status === 400 && !resend ? 'Check the email and code. If the code has expired, request a new one. New passwords must be at least 8 characters and hard to guess.' :
        requestError(failure, 'Could not complete this request.'));
    } finally { setBusy(false); }
  }

  return <main className="account-recovery">
    <section className="panel page-stack">
      <h1>{verify ? 'Verify your email' : 'Reset your password'}</h1>
      {!done && <form className="page-stack" onSubmit={submit}>
        <div className="form-group"><label htmlFor="recovery-email">Registered email</label>
          <input id="recovery-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <button className="btn btn-secondary platform-inline" value="request" formNoValidate disabled={busy || !email.trim()}>Email a code</button>
        <div className="form-group"><label htmlFor="recovery-code">Eight-digit code</label>
          <input id="recovery-code" required pattern="[0-9]{8}" maxLength={8} inputMode="numeric" autoComplete="one-time-code"
            value={code} onChange={e => setCode(e.target.value)} /></div>
        {!verify && <div className="form-group"><label htmlFor="recovery-password">New password</label>
          <PasswordInput id="recovery-password" autoComplete="new-password" required minLength={8} maxLength={128}
            value={password} onChange={e => setPassword(e.target.value)} /></div>}
        <button className="btn btn-primary platform-inline" value="confirm" disabled={busy}>{verify ? 'Verify email' : 'Reset password'}</button>
      </form>}
      {notice && <p role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <Link to="/login">Back to sign in</Link>
    </section>
  </main>;
}
