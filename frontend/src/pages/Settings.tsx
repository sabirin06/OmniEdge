import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, LockKeyhole, Monitor, Moon, Palette, RefreshCw, Save, Settings as SettingsIcon, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { requestError, requestFields } from '../api/errors';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../contexts/AuthContext';
import { roleLabels } from '../utils/formatters';
import type { DashboardRefresh, ThemePreference } from '../types';

const themes = [
  { value: 'light', label: 'Light', hint: 'Bright surfaces', icon: Sun },
  { value: 'dark', label: 'Dark', hint: 'Dim surfaces', icon: Moon },
  { value: 'system', label: 'System', hint: 'Follow your device', icon: Monitor },
] as const;

const fields = ['full_name', 'theme', 'dashboard_refresh_seconds'] as const;

export function Settings() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<ThemePreference>('system');
  const [interval, setInterval] = useState<DashboardRefresh>(30);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Partial<Record<typeof fields[number], string>>>({});

  useEffect(() => {
    setName(user?.full_name ?? '');
    setTheme(user?.theme ?? 'system');
    setInterval(user?.dashboard_refresh_seconds ?? 30);
  }, [user]);

  const initials = (user?.full_name || user?.email || '').trim().split(/\s+/).slice(0, 2)
    .map(part => part.charAt(0).toUpperCase()).join('');
  const role = user?.role ? user.managed_role_detail?.name ?? roleLabels[user.role] : '';
  const changed = name.trim() !== user?.full_name || theme !== (user?.theme ?? 'system') ||
    interval !== (user?.dashboard_refresh_seconds ?? 30);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !changed) return;
    setError('');
    if (!name.trim()) {
      setErrors({ full_name: 'Enter your full name.' });
      event.currentTarget.querySelector<HTMLInputElement>('#settings-name')?.focus();
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      await updateProfile({ full_name: name.trim(), theme, dashboard_refresh_seconds: interval });
      toast('success', 'Your settings were saved.');
    } catch (err) {
      const next = requestFields(err, fields);
      setErrors(next);
      if (!Object.keys(next).length) setError(requestError(err, 'Could not save your settings.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="workspace-page settings-page">
      <header className="settings-heading">
        <span className="settings-heading-icon"><SettingsIcon size={30} aria-hidden="true" /></span>
        <div><h2>Settings</h2><p>Manage your profile and personalize your workspace.</p></div>
      </header>
      <form className="settings-grid" onSubmit={save} noValidate aria-busy={saving}
        onChange={() => { setError(''); setErrors({}); }}>
        <section className="panel settings-card settings-profile">
          <header className="settings-card-heading"><UserRound aria-hidden="true" />
            <div><h3>Profile information</h3><p>Update how your name appears in OmniEdge.</p></div>
          </header>
          <div className="settings-identity">
            <div className="settings-avatar" aria-hidden="true">{initials || <UserRound />}</div>
            <div><strong>{user?.full_name}</strong><p>{role}</p></div>
          </div>
          <div className="form-group">
            <label htmlFor="settings-name">Full name</label>
            <input id="settings-name" value={name} onChange={e => setName(e.target.value)} required
              disabled={saving} maxLength={255} autoComplete="name"
              aria-invalid={!!errors.full_name} aria-describedby={errors.full_name ? 'settings-name-error' : undefined} />
            {errors.full_name && <p id="settings-name-error" className="form-error" role="alert">{errors.full_name}</p>}
          </div>
          <div className="form-group">
            <label htmlFor="settings-email">Email address</label>
            <input id="settings-email" value={user?.email ?? ''} readOnly />
          </div>
          <div className="settings-actions">
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn btn-primary settings-save" disabled={saving || !changed}>
              <Save size={17} aria-hidden="true" /> {saving ? 'Saving…' : 'Save settings'}
            </button>
            <p>{changed ? 'Save to apply your profile and appearance changes.' : 'Your settings are up to date.'}</p>
          </div>
        </section>
        <div className="settings-right">
          <section className="panel settings-card">
            <header className="settings-card-heading"><Palette aria-hidden="true" />
              <div><h3>Appearance preferences</h3><p>Choose a theme and dashboard refresh interval.</p></div>
            </header>
            <fieldset className="settings-fieldset" disabled={saving} aria-describedby={errors.theme ? 'settings-theme-error' : undefined}>
              <legend>Theme</legend>
              <div className="theme-options">
                {themes.map(({ value, label, hint, icon: Icon }) => (
                  <label key={value} className={theme === value ? 'theme-option selected' : 'theme-option'}>
                    <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => setTheme(value)} />
                    {theme === value && <Check className="settings-theme-check" size={16} aria-hidden="true" />}
                    <Icon size={24} aria-hidden="true" /><strong>{label}</strong><span>{hint}</span>
                  </label>
                ))}
              </div>
              {errors.theme && <p id="settings-theme-error" className="form-error" role="alert">{errors.theme}</p>}
            </fieldset>
            <div className="form-group">
              <label htmlFor="settings-refresh">Dashboard auto-refresh</label>
              <div className="settings-select"><RefreshCw size={16} aria-hidden="true" />
                <select id="settings-refresh" value={interval} disabled={saving}
                  aria-invalid={!!errors.dashboard_refresh_seconds}
                  aria-describedby={errors.dashboard_refresh_seconds ? 'settings-refresh-error' : undefined}
                  onChange={e => setInterval(Number(e.target.value) as DashboardRefresh)}>
                  <option value={0}>Off</option><option value={15}>Every 15 seconds</option>
                  <option value={30}>Every 30 seconds</option><option value={60}>Every 60 seconds</option>
                </select>
              </div>
              {errors.dashboard_refresh_seconds && <p id="settings-refresh-error" className="form-error" role="alert">{errors.dashboard_refresh_seconds}</p>}
            </div>
          </section>
          <section className="panel settings-card">
            <header className="settings-card-heading"><ShieldCheck aria-hidden="true" />
              <div><h3>Account access</h3><p>Contact your administrator to update your email or access.</p></div>
            </header>
            <dl className="settings-access">
              <div><dt><LockKeyhole size={16} aria-hidden="true" /> Assigned role</dt><dd>{role}</dd></div>
              {user?.tenant_detail && <div><dt>Organization</dt><dd>{user.tenant_detail.name}</dd></div>}
            </dl>
          </section>
        </div>
      </form>
    </section>
  );
}
