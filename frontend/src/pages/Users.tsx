import { useState } from 'react';
import { usersApi } from '../api/users';
import { PlatformUsers } from './PlatformUsers';
import { UserForm } from '../components/forms/UserForm';
import { Pagination } from '../components/ui/Pagination';
import { roleLabels } from '../utils/formatters';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../hooks/useApi';
import type { User } from '../types';

const PAGE_SIZE = 50;

export function Users() {
  const { user } = useAuth();
  if (user?.role !== 'platform_admin' && user?.role !== 'customer_admin') {
    return <p role="alert">Only administrators can manage users.</p>;
  }
  return user.role === 'platform_admin' ? <PlatformUsers currentUserId={user.id} /> : <UserManagement currentUserId={user.id} />;
}

function UserManagement({ currentUserId }: { currentUserId: number }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<User | null | undefined>();
  const users = useApi(() => usersApi.list({ page, search }), [page, search]);

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={() => setEditing(null)}>Create user</button>
      </div>
      <div className="form-group">
        <label htmlFor="user-search">Search users</label>
        <input id="user-search" value={search} onChange={e => { setPage(1); setSearch(e.target.value); }} />
      </div>
      {users.loading && <p role="status">Loading users...</p>}
      {users.error && <p role="alert">Could not load users. <button className="btn btn-ghost" onClick={users.refresh}>Retry</button></p>}
      {!users.loading && !users.error && (
        <div className="table-wrapper card">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Organization</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {!users.data?.results.length && <tr><td colSpan={6}>No users found.</td></tr>}
              {users.data?.results.map(user => (
                <tr key={user.id}>
                  <td>{user.full_name}</td><td>{user.email}</td>
                  <td>{user.managed_role_detail?.name ?? roleLabels[user.role]}</td>
                  <td>{user.tenant_detail?.name ?? 'Platform'}</td>
                  <td>{user.suspended ? 'Suspended' : user.is_active ? 'Active' : 'Inactive'}</td>
                  <td>
                    {user.id !== currentUserId && (
                      <button className="btn btn-ghost" onClick={() => setEditing(user)}>Edit user</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={users.data?.count ?? 0} onPageChange={setPage} />
        </div>
      )}
      {editing !== undefined && <UserForm user={editing} onClose={() => setEditing(undefined)} onSaved={users.refresh} />}
    </section>
  );
}
