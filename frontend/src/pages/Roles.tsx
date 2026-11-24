import { useState } from 'react';
import { rolesApi, builtInRoles } from '../api/roles';
import { FormDialog } from '../components/ui/FormDialog';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../hooks/useApi';
import type { ManagedRole, UserRole } from '../types';
import { roleLabels } from '../utils/formatters';

export function Roles() {
  const { user } = useAuth();
  if (user?.role !== 'platform_admin') return <p role="alert">Only Platform Admins can manage roles.</p>;
  return <RoleManagement />;
}

function RoleManagement() {
  const roles = useApi(rolesApi.list);
  const toast = useToast();
  const [editing, setEditing] = useState<ManagedRole | null | undefined>();
  const [name, setName] = useState('');
  const [baseRole, setBaseRole] = useState<UserRole>('soc_analyst');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const open = (role: ManagedRole | null) => {
    setEditing(role);
    setName(role?.name ?? '');
    setBaseRole(role?.base_role ?? 'soc_analyst');
    setError('');
  };

  const save = async () => {
    if (saving) return;
    if (!name.trim()) { setError('Enter a role name.'); return; }
    setSaving(true);
    setError('');
    try {
      if (editing) await rolesApi.rename(editing.id, name.trim());
      else await rolesApi.create({ name: name.trim(), base_role: baseRole });
      toast('success', editing ? 'Role renamed' : 'Role created');
      setEditing(undefined);
      roles.refresh();
    } catch (err: unknown) {
      const errors = (err as { response?: { data?: { errors?: { name?: string[] } } } }).response?.data?.errors;
      setError(errors?.name?.[0] ?? 'Could not save the role.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h1>Roles</h1>
        <button className="btn btn-primary" onClick={() => open(null)}>Create role</button>
      </div>
      {roles.loading && <p role="status">Loading roles...</p>}
      {roles.error && <p role="alert">Could not load roles. <button className="btn btn-ghost" onClick={roles.refresh}>Retry</button></p>}
      <div className="table-wrapper card">
        <table className="data-table">
          <thead><tr><th>Role</th><th>Permissions</th><th>Actions</th></tr></thead>
          <tbody>
            {builtInRoles.map(([key, label]) => <tr key={key}><td>{label}</td><td>Built-in</td><td /></tr>)}
            {roles.data?.map(role => (
              <tr key={role.id}>
                <td>{role.name}</td><td>{roleLabels[role.base_role]}</td>
                <td><button className="btn btn-ghost" onClick={() => open(role)}>Rename</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FormDialog open={editing !== undefined} title={editing ? 'Rename role' : 'Create role'}
        onClose={() => { if (!saving) setEditing(undefined); }} onSubmit={save} submitLoading={saving}>
        <div className="form-group">
          <label htmlFor="role-name">Role name</label>
          <input id="role-name" value={name} maxLength={100} onChange={e => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="base-role">Permission level</label>
          <select id="base-role" value={baseRole} disabled={!!editing} onChange={e => setBaseRole(e.target.value as UserRole)}>
            {builtInRoles.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </FormDialog>
    </section>
  );
}
