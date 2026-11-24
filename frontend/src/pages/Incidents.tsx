import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Search, Plus, Filter, ShieldAlert,
  Clock, ArrowRight, User
} from 'lucide-react';
import { incidentsApi } from '../api/incidents';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import { formatRelative, formatDateTime } from '../utils/formatters';
import { FormDialog } from '../components/ui/FormDialog';
import { useAuth } from '../contexts/AuthContext';

export function Incidents() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  // New incident form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('high');

  const loadIncidents = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      const res = await incidentsApi.list(params);
      const data = res.data.results ? res.data.results : (Array.isArray(res.data) ? res.data : []);
      setIncidents(data);
    } catch (err) {
      console.error('Failed to load incidents', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, [statusFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await incidentsApi.create({
        title,
        description,
        severity,
        tenant: user?.tenant || 1,
      });
      setCreateOpen(false);
      setTitle('');
      setDescription('');
      await loadIncidents();
    } catch (err) {
      console.error('Failed to create incident', err);
    }
  };

  const filtered = incidents.filter(inc => {
    const q = search.toLowerCase();
    return (
      (inc.title?.toLowerCase() || '').includes(q) ||
      (inc.reference?.toLowerCase() || '').includes(q) ||
      (inc.owner?.full_name?.toLowerCase() || '').includes(q)
    );
  });

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0' }}>Incident Cases</h1>
          <p style={{ margin: 0, color: '#8B949E', fontSize: '13px' }}>
            Active investigations, containment execution, and root-cause resolution
          </p>
        </div>

        <button
          onClick={() => setCreateOpen(true)}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} />
          <span>New Incident Case</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: '16px', marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#8B949E' }} />
          <input
            type="text"
            placeholder="Search by reference, title, or owner..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px 8px 32px',
              background: '#0D1117',
              border: '1px solid #30363D',
              borderRadius: '6px',
              color: '#E6EDF3',
              fontSize: '13px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', color: '#E6EDF3', fontSize: '13px' }}
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="containment">Containment</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Incidents Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#161B22', borderBottom: '1px solid #30363D', color: '#8B949E' }}>
                <th style={{ padding: '12px 16px' }}>Reference</th>
                <th style={{ padding: '12px 16px' }}>Title</th>
                <th style={{ padding: '12px 16px' }}>Severity</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Owner</th>
                <th style={{ padding: '12px 16px' }}>Created</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                filtered.map(inc => (
                  <tr key={inc.id} style={{ borderBottom: '1px solid #21262D' }}>
                    <td style={{ padding: '12px 16px', fontWeight: '700', color: '#58A6FF' }}>
                      {inc.reference}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{ fontWeight: '600', color: '#E6EDF3', cursor: 'pointer' }}
                        onClick={() => navigate(`/incidents/${inc.id}`)}
                      >
                        {inc.title}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <SeverityBadge severity={inc.severity} />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge status={inc.status} />
                    </td>
                    <td style={{ padding: '12px 16px', color: '#8B949E' }}>
                      {inc.owner?.full_name || inc.owner_name || 'Unassigned'}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#8B949E' }}>
                      {formatRelative(inc.created_at)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => navigate(`/incidents/${inc.id}`)}
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '11px', color: '#58A6FF' }}
                      >
                        Open Case
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#8B949E' }}>
                    {loading ? 'Loading incidents...' : 'No incident cases found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      <FormDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New Incident Case"
      >
        <form onSubmit={handleCreate}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#8B949E' }}>
              Incident Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Ransomware Activity on Finance Share"
              style={{ width: '100%', padding: '8px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', color: '#E6EDF3', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#8B949E' }}>
              Severity
            </label>
            <select
              value={severity}
              onChange={e => setSeverity(e.target.value)}
              style={{ width: '100%', padding: '8px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', color: '#E6EDF3' }}
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#8B949E' }}>
              Incident Description & Scope
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Summary of detected attack vectors, compromised hosts, or business impact..."
              style={{ width: '100%', padding: '8px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', color: '#E6EDF3', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={() => setCreateOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create Case
            </button>
          </div>
        </form>
      </FormDialog>
    </div>
  );
}
