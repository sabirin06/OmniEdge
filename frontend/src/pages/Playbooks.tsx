import React, { useEffect, useState } from 'react';
import { BookOpen, Plus, CheckCircle, ListOrdered, Shield } from 'lucide-react';
import { playbooksApi } from '../api/playbooks';
import { FormDialog } from '../components/ui/FormDialog';
import { useAuth } from '../contexts/AuthContext';

export function Playbooks() {
  const { user } = useAuth();
  const [playbooks, setPlaybooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Authentication');
  const [description, setDescription] = useState('');

  const loadPlaybooks = async () => {
    setLoading(true);
    try {
      const res = await playbooksApi.list();
      const data = res.data.results ? res.data.results : (Array.isArray(res.data) ? res.data : []);
      setPlaybooks(data);
    } catch (err) {
      console.error('Failed to load playbooks', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlaybooks();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await playbooksApi.create({
        name,
        category,
        description,
        tenant: user?.tenant || 1,
      } as any);
      setCreateOpen(false);
      setName('');
      setDescription('');
      await loadPlaybooks();
    } catch (err) {
      console.error('Failed to create playbook', err);
    }
  };

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0' }}>Response Playbooks</h1>
          <p style={{ margin: 0, color: '#8B949E', fontSize: '13px' }}>
            Standard operating containment workflows automatically applied to emerging incidents
          </p>
        </div>

        <button
          onClick={() => setCreateOpen(true)}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} />
          <span>New Playbook</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {playbooks.length > 0 ? (
          playbooks.map(pb => (
            <div key={pb.id} className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <span className="badge badge-subtle" style={{ marginBottom: '6px', display: 'inline-block' }}>
                    {pb.category || 'Incident Response'}
                  </span>
                  <h2 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: '#E6EDF3' }}>
                    {pb.name}
                  </h2>
                </div>
                <BookOpen size={20} color="#58A6FF" />
              </div>

              <p style={{ fontSize: '13px', color: '#8B949E', lineHeight: '1.5', margin: '0 0 16px 0' }}>
                {pb.description || 'Structured containment procedure.'}
              </p>

              <div style={{ borderTop: '1px solid #30363D', paddingTop: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#8B949E', display: 'block', marginBottom: '8px' }}>
                  Containment Action Steps:
                </span>
                {pb.steps && pb.steps.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {pb.steps.map((st: any) => (
                      <div key={st.id || st.position} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: '#C9D1D9' }}>
                        <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#21262D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#58A6FF' }}>
                          {st.position}
                        </span>
                        <span>{st.title}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '12px', color: '#6E7681', fontStyle: 'italic' }}>
                    3 containment tasks configured
                  </span>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="card" style={{ padding: '36px', textAlign: 'center', color: '#8B949E', gridColumn: 'span 2' }}>
            {loading ? 'Loading playbooks...' : 'No playbooks registered.'}
          </div>
        )}
      </div>

      {/* New Playbook Modal */}
      <FormDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Author Incident Playbook"
      >
        <form onSubmit={handleCreate}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#8B949E' }}>
              Playbook Title
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Ransomware Host Isolation Protocol"
              style={{ width: '100%', padding: '8px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', color: '#E6EDF3', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#8B949E' }}>
              Category
            </label>
            <input
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="e.g. Malware, Data Exfiltration, Account Takeover"
              style={{ width: '100%', padding: '8px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', color: '#E6EDF3', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#8B949E' }}>
              Overview & Objectives
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Defines standard containment requirements..."
              style={{ width: '100%', padding: '8px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', color: '#E6EDF3', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={() => setCreateOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save Playbook
            </button>
          </div>
        </form>
      </FormDialog>
    </div>
  );
}
