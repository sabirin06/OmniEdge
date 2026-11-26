import { useState } from 'react';
import { Ban, CircleCheck, CircleMinus, Info, Pencil, ShieldCheck } from 'lucide-react';
import { platformApi } from '../api/platform';
import { requestError } from '../api/errors';
import { rolesApi } from '../api/roles';
import { tenantsApi } from '../api/tenants';
import { usersApi } from '../api/users';
import { UserForm } from '../components/forms/UserForm';
import { ErrorState } from '../components/ui/ErrorState';
import { FormDialog } from '../components/ui/FormDialog';
import { Pagination } from '../components/ui/Pagination';
import { SupportAccess } from '../components/ui/SupportAccess';
import { useToast } from '../components/ui/Toast';
import { useApi } from '../hooks/useApi';
import { formatDateTime, roleLabels } from '../utils/formatters';
import type { User } from '../types';

const filters = {
  all: 'Total Users', active: 'Active Users', inactive: 'Inactive Users', disabled: 'Disabled Users',
} as const;
type AccountFilter = keyof typeof filters;
type AccessChange = { user: User; state: 'active' | 'inactive' | 'suspended'; label: string };

function status(user: User) {
  return user.suspended ? 'Disabled' : user.email_verified === false ? 'Pending verification' : user.is_active ? 'Active' : 'Inactive';
}
const lastLogin = (user: User) => user.last_login ? formatDateTime(user.last_login) : 'Never';

async function tenantOptions() {
  const first = await tenantsApi.list({ page: 1 });
  const tenants = [...first.data.results];
  let next = first.data.next;
  for (let page = 2; next; page++) {
    const response = await tenantsApi.list({ page });
    tenants.push(...response.data.results);
    next = response.data.next;
  }
  return { ...first, data: tenants };
}

function AccountDetails({ account, onClose }: { account: User; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const detail = useApi(() => usersApi.get(account.id), [account.id]);
  const activity = useApi(() => platformApi.userActivity(account.id, page), [account.id, page]);
  const user = detail.data ?? account;
  return <FormDialog open size="lg" title={`Account details | ${user.full_name}`} onClose={onClose}>
    {detail.error && <ErrorState message={detail.error} onRetry={detail.refresh} />}
    <dl className="platform-health">
      <div><dt>Email</dt><dd>{user.email}</dd></div>
      <div><dt>Assigned role</dt><dd>{user.managed_role_detail?.name ?? roleLabels[user.role]}</dd></div>
      <div><dt>Tenant</dt><dd>{user.tenant_detail?.name ?? 'Platform'}</dd></div>
      <div><dt>Account status</dt><dd>{status(user)}</dd></div>
      <div><dt>Last login</dt><dd>{lastLogin(user)}</dd></div>
    </dl>
    <section className="page-stack platform-user-history">
      <h3>Activity history</h3>
      {activity.loading ? <p role="status">Loading activity...</p> :
        activity.error ? <ErrorState message={activity.error} onRetry={activity.refresh} /> :
        activity.data?.results.length ? <div className="table-wrapper"><table className="data-table">
          <thead><tr><th>Action</th><th>Actor</th><th>Time</th></tr></thead>
          <tbody>{activity.data.results.map(entry => <tr key={entry.id}>
            <td>{entry.action}</td><td>{entry.actor__email ?? 'System'}</td><td>{formatDateTime(entry.timestamp)}</td>
          </tr>)}</tbody>
        </table></div> : <p className="muted">No activity recorded.</p>}
      <Pagination page={page} pageSize={50} total={activity.data?.count ?? 0} onPageChange={setPage} />
    </section>
  </FormDialog>;
}

export function PlatformUsers({ currentUserId }: { currentUserId: number }) {
  const [filter, setFilter] = useState<AccountFilter>('all');
  const [role, setRole] = useState('');
  const [tenant, setTenant] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<User>();
  const [editing, setEditing] = useState<User | null | undefined>();
  const [change, setChange] = useState<AccessChange>();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const counts = useApi(platformApi.userCounts);
  const tenants = useApi(tenantOptions);
  const roles = useApi(rolesApi.list);
  const listing = useApi(() => usersApi.list({
    page, search, account_status: filter, tenant,
    ...(role.startsWith('managed:') ? { managed_role: role.slice(8) } : { role }),
  }), [page, search, filter, role, tenant]);

  function refresh() {
    listing.refresh();
    counts.refresh();
  }

  async function applyAccess() {
    if (!change || busy) return;
    setBusy(true);
    try {
      await platformApi.access('users', change.user.id, change.state);
      setChange(undefined);
      if (page !== 1 && listing.data?.results.length === 1) setPage(page - 1);
      refresh();
      toast('success', 'Account access updated.');
    } catch (error) {
      toast('error', requestError(error, 'Could not update account access.'));
    } finally {
      setBusy(false);
    }
  }

  return <section className="workspace-page">
    <header className="workspace-heading">
      <button type="button" className="btn btn-primary" onClick={() => setEditing(null)}>Create user</button>
    </header>
    <div className="report-kpis" role="group" aria-label="Account status filters">
      {Object.entries(filters).map(([key, label]) => <button type="button" key={key}
        className="panel platform-metric user-filter-card" aria-pressed={filter === key}
        onClick={() => { setFilter(key as AccountFilter); setPage(1); }}>
        <span>{label}</span><strong>{counts.data?.[key as AccountFilter]?.toLocaleString() ?? '-'}</strong>
      </button>)}
    </div>
    {counts.error && <ErrorState message={counts.error} onRetry={counts.refresh} />}
    <section className="panel page-stack">
      <form className="report-filter-grid" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setPage(1); }}>
        <label>Search users<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name or email" /></label>
        <label>Role<select value={role} onChange={e => { setRole(e.target.value); setPage(1); }}>
          <option value="">All roles</option>
          {Object.entries(roleLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
          {roles.data?.map(item => <option value={`managed:${item.id}`} key={item.id}>{item.name}</option>)}
        </select></label>
        <label>Tenant<select value={tenant} onChange={e => { setTenant(e.target.value); setPage(1); }}>
          <option value="">All tenants</option><option value="platform">Platform accounts</option>
          {tenants.data?.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select></label>
        <div className="incident-buttons user-filter-actions"><button className="btn btn-secondary">Search</button>
          <button type="button" className="btn btn-ghost" onClick={() => {
            setQuery(''); setSearch(''); setRole(''); setTenant(''); setFilter('all'); setPage(1);
          }}>Reset filters</button></div>
      </form>
      {roles.error && <ErrorState message="Could not load managed roles." onRetry={roles.refresh} />}
      {tenants.error && <ErrorState message="Could not load tenant filters." onRetry={tenants.refresh} />}
      {listing.loading ? <p role="status">Loading users...</p> : listing.error ? <ErrorState message={listing.error} onRetry={listing.refresh} /> :
        <div className="table-wrapper"><table className="data-table">
          <thead><tr>{['Name', 'Email', 'Assigned Role', 'Tenant', 'Account Status', 'Last Login', 'Actions'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>
            {!listing.data?.results.length && <tr><td colSpan={7}>No users match these filters.</td></tr>}
            {listing.data?.results.map(user => <tr key={user.id}>
              <td>{user.full_name}</td><td>{user.email}</td>
              <td>{user.managed_role_detail?.name ?? roleLabels[user.role]}</td><td>{user.tenant_detail?.name ?? 'Platform'}</td>
              <td><span className={`chip user-account-status user-account-${status(user).toLowerCase()}`}>{status(user)}</span></td>
              <td>{lastLogin(user)}</td>
              <td><div className="incident-buttons user-row-actions">
                <button type="button" className="btn btn-ghost btn-icon" title="Account details" aria-label="Account details" onClick={() => setDetails(user)}><Info size={17} /></button>
                {user.id !== currentUserId && <button type="button" className="btn btn-ghost btn-icon" title="Edit user" aria-label="Edit user" onClick={() => setEditing(user)}><Pencil size={17} /></button>}
                {user.role !== 'platform_admin' && <>
                  {user.suspended ? <button type="button" className="btn btn-ghost btn-icon" title="Enable" aria-label="Enable" onClick={() => setChange({ user, state: 'active', label: 'Enable' })}><ShieldCheck size={17} /></button> :
                    <>
                      {user.is_active ? <button type="button" className="btn btn-ghost btn-icon" title="Deactivate" aria-label="Deactivate" onClick={() => setChange({ user, state: 'inactive', label: 'Deactivate' })}><CircleMinus size={17} /></button> :
                        user.email_verified !== false && <button type="button" className="btn btn-ghost btn-icon" title="Activate" aria-label="Activate" onClick={() => setChange({ user, state: 'active', label: 'Activate' })}><CircleCheck size={17} /></button>}
                      <button type="button" className="btn btn-ghost btn-icon" title="Disable" aria-label="Disable" onClick={() => setChange({ user, state: 'suspended', label: 'Disable' })}><Ban size={17} /></button>
                    </>}
                  {user.is_active && !user.suspended && user.tenant_detail?.status === 'active' &&
                    <SupportAccess tenant={user.tenant_detail.id} target={user.id} label={user.full_name} iconOnly />}
                </>}
              </div></td>
            </tr>)}
          </tbody>
        </table></div>}
      <Pagination page={page} pageSize={50} total={listing.data?.count ?? 0} onPageChange={setPage} />
    </section>
    {editing !== undefined && <UserForm user={editing} onClose={() => setEditing(undefined)} onSaved={refresh} />}
    {details && <AccountDetails key={details.id} account={details} onClose={() => setDetails(undefined)} />}
    {change && <FormDialog open title={`${change.label} account`} onClose={() => { if (!busy) setChange(undefined); }}
      onSubmit={applyAccess} submitLoading={busy} submitLabel={change.label}>
      <p>{change.label} access for <strong>{change.user.full_name}</strong> ({change.user.email})?</p>
    </FormDialog>}
  </section>;
}
