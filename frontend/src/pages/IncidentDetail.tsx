import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Shield, Clock, FileText, CheckCircle2,
  Paperclip, Plus, Send, Upload, CheckSquare, AlertTriangle, UserCheck
} from 'lucide-react';
import { incidentsApi } from '../api/incidents';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import { formatDateTime, formatBytes } from '../utils/formatters';
import { useAuth } from '../contexts/AuthContext';
import { FormDialog } from '../components/ui/FormDialog';

export function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [incident, setIncident] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'timeline' | 'evidence' | 'tasks'>('overview');

  // Form states
  const [noteContent, setNoteContent] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceDesc, setEvidenceDesc] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [transitionMsg, setTransitionMsg] = useState<string | null>(null);

  const incidentId = Number(id);

  const loadData = async () => {
    try {
      const [incRes, timeRes, evRes, actRes] = await Promise.all([
        incidentsApi.get(incidentId),
        incidentsApi.getTimeline(incidentId),
        incidentsApi.getEvidence(incidentId),
        incidentsApi.getTasks(incidentId),
      ]);
      setIncident(incRes.data);
      setTimeline(Array.isArray(timeRes.data) ? timeRes.data : []);
      setEvidence(Array.isArray(evRes.data) ? evRes.data : []);
      setActions(Array.isArray(actRes.data) ? actRes.data : []);
    } catch (err) {
      console.error('Failed to load incident detail', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (incidentId) loadData();
  }, [incidentId]);

  const handleTransition = async (newStatus: string) => {
    try {
      await incidentsApi.update(incidentId, { status: newStatus });
      setTransitionMsg(`Incident transitioned to ${newStatus}`);
      await loadData();
      setTimeout(() => setTransitionMsg(null), 3000);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Transition not allowed. Check playbook tasks.');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    try {
      await incidentsApi.addNote(incidentId, noteContent);
      setNoteContent('');
      const res = await incidentsApi.getTimeline(incidentId);
      setTimeline(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to add note', err);
    }
  };

  const handleUploadEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evidenceFile) return;
    try {
      const fd = new FormData();
      fd.append('file', evidenceFile);
      fd.append('description', evidenceDesc);
      await incidentsApi.uploadEvidence(incidentId, fd);
      setUploadOpen(false);
      setEvidenceFile(null);
      setEvidenceDesc('');
      const res = await incidentsApi.getEvidence(incidentId);
      setEvidence(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Upload failed', err);
    }
  };

  const handleTaskComplete = async (actionId: number) => {
    try {
      await incidentsApi.updateTask(incidentId, actionId, { status: 'completed' as any });
      const res = await incidentsApi.getTasks(incidentId);
      setActions(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to update task', err);
    }
  };

  if (loading) return <div style={{ padding: '32px', textAlign: 'center', color: '#8B949E' }}>Loading incident case...</div>;
  if (!incident) return <div style={{ padding: '32px', textAlign: 'center', color: '#FF7B72' }}>Incident record not found.</div>;

  // Allowed transitions
  const transitions: Record<string, string[]> = {
    open: ['investigating'],
    investigating: ['containment', 'resolved'],
    containment: ['resolved'],
    resolved: ['closed'],
    closed: [],
  };
  const nextStatuses = transitions[incident.status] || [];

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <button
        onClick={() => navigate('/incidents')}
        className="btn btn-ghost"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}
      >
        <ArrowLeft size={16} />
        <span>Back to Incidents</span>
      </button>

      {/* Title & Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#58A6FF' }}>{incident.reference}</span>
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0 }}>{incident.title}</h1>
        </div>

        {/* Transition Lifecycle Actions */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {nextStatuses.map(st => (
            <button
              key={st}
              onClick={() => handleTransition(st)}
              className="btn btn-primary"
              style={{ textTransform: 'capitalize' }}
            >
              Move to {st}
            </button>
          ))}
        </div>
      </div>

      {transitionMsg && (
        <div style={{ padding: '10px 16px', background: 'rgba(63, 185, 80, 0.15)', border: '1px solid #3FB950', borderRadius: '6px', color: '#3FB950', fontSize: '13px', marginBottom: '16px' }}>
          {transitionMsg}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #30363D', marginBottom: '20px' }}>
        {[
          { key: 'overview', label: 'Case Overview' },
          { key: 'timeline', label: `Timeline (${timeline.length})` },
          { key: 'evidence', label: `Evidence (${evidence.length})` },
          { key: 'tasks', label: `Containment Tasks (${actions.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            style={{
              padding: '10px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t.key ? '2px solid #58A6FF' : '2px solid transparent',
              color: tab === t.key ? '#58A6FF' : '#8B949E',
              fontWeight: tab === t.key ? '600' : '500',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          <div className="card" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px' }}>Investigation Summary</h2>
            <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#C9D1D9', margin: '0 0 16px 0' }}>
              {incident.description || 'No description entered.'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px', borderTop: '1px solid #30363D', paddingTop: '16px' }}>
              <div>
                <span style={{ color: '#8B949E', display: 'block' }}>Lead Owner:</span>
                <span style={{ fontWeight: '600', color: '#E6EDF3' }}>{incident.owner?.full_name || 'Unassigned'}</span>
              </div>
              <div>
                <span style={{ color: '#8B949E', display: 'block' }}>Created:</span>
                <span>{formatDateTime(incident.created_at)}</span>
              </div>
              {incident.resolution_summary && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ color: '#3FB950', display: 'block', fontWeight: '600' }}>Resolution Summary:</span>
                  <p style={{ margin: '4px 0 0 0', color: '#E6EDF3' }}>{incident.resolution_summary}</p>
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px' }}>Associated Detections</h2>
            {incident.alerts && incident.alerts.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {incident.alerts.map((alt: any) => (
                  <div key={alt.id || alt} style={{ padding: '10px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#E6EDF3' }}>{alt.title || `Linked Alert #${alt}`}</span>
                    <button
                      onClick={() => navigate(`/alerts/${alt.id || alt}`)}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '11px', color: '#58A6FF' }}
                    >
                      View Alert
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#8B949E', fontSize: '13px' }}>Standalone incident case with no primary alert linked.</p>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Timeline */}
      {tab === 'timeline' && (
        <div>
          <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px' }}>Audit Timeline Activity</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {timeline.length > 0 ? (
                timeline.map((entry, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: '#21262D', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#58A6FF', flexShrink: 0
                    }}>
                      <Clock size={16} />
                    </div>
                    <div style={{ flex: 1, background: '#0D1117', border: '1px solid #30363D', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                        <span style={{ fontWeight: '600', color: '#58A6FF' }}>{entry.actor?.full_name || entry.author_name || 'System'}</span>
                        <span style={{ color: '#8B949E' }}>{formatDateTime(entry.created_at || entry.timestamp)}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: '#E6EDF3', lineHeight: '1.5' }}>
                        {entry.message || entry.content}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p style={{ color: '#8B949E', fontSize: '13px' }}>No timeline entries recorded yet.</p>
              )}
            </div>
          </div>

          {/* Add note */}
          <form onSubmit={handleAddNote} className="card" style={{ padding: '16px', display: 'flex', gap: '12px' }}>
            <input
              type="text"
              placeholder="Add investigator note to chronological case timeline..."
              value={noteContent}
              onChange={e => setNoteContent(e.target.value)}
              style={{ flex: 1, padding: '10px 14px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', color: '#E6EDF3', fontSize: '13px' }}
            />
            <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Send size={15} />
              <span>Post Note</span>
            </button>
          </form>
        </div>
      )}

      {/* Tab 3: Evidence */}
      {tab === 'evidence' && (
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', margin: 0 }}>Evidence Artifacts</h2>
            <button
              onClick={() => setUploadOpen(true)}
              className="btn btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Upload size={14} />
              <span>Attach Evidence</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {evidence.length > 0 ? (
              evidence.map(ev => (
                <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Paperclip size={18} color="#58A6FF" />
                    <div>
                      <span style={{ fontWeight: '600', color: '#E6EDF3', display: 'block' }}>{ev.original_filename || ev.filename}</span>
                      <span style={{ fontSize: '11px', color: '#8B949E' }}>
                        {formatBytes(ev.file_size)} • {ev.description || 'Forensic artifact'}
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: '#8B949E' }}>{formatDateTime(ev.uploaded_at)}</span>
                </div>
              ))
            ) : (
              <p style={{ color: '#8B949E', fontSize: '13px', padding: '16px 0', textAlign: 'center' }}>No forensic evidence attached to this case.</p>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Tasks */}
      {tab === 'tasks' && (
        <div className="card" style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px' }}>Containment & Playbook Action Tasks</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {actions.length > 0 ? (
              actions.map(act => (
                <div key={act.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '600', color: act.status === 'completed' ? '#3FB950' : '#E6EDF3', fontSize: '14px' }}>
                        {act.title}
                      </span>
                      <StatusBadge status={act.status} />
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#8B949E' }}>
                      {act.instructions || act.description}
                    </p>
                  </div>
                  {act.status !== 'completed' && (
                    <button
                      onClick={() => handleTaskComplete(act.id)}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '12px', color: '#3FB950' }}
                    >
                      <CheckSquare size={14} style={{ marginRight: '4px' }} />
                      Complete Task
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p style={{ color: '#8B949E', fontSize: '13px', padding: '16px 0', textAlign: 'center' }}>No containment tasks registered.</p>
            )}
          </div>
        </div>
      )}

      {/* Evidence Upload Modal */}
      <FormDialog
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Attach Forensic Evidence"
      >
        <form onSubmit={handleUploadEvidence}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#8B949E' }}>
              Select File
            </label>
            <input
              type="file"
              required
              onChange={e => setEvidenceFile(e.target.files ? e.target.files[0] : null)}
              style={{ width: '100%', padding: '8px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', color: '#E6EDF3' }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: '#8B949E' }}>
              Evidence Description
            </label>
            <input
              type="text"
              value={evidenceDesc}
              onChange={e => setEvidenceDesc(e.target.value)}
              placeholder="e.g. Memory dump, firewall log, auth packet capture"
              style={{ width: '100%', padding: '8px', background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px', color: '#E6EDF3', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={() => setUploadOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Upload Artifact
            </button>
          </div>
        </form>
      </FormDialog>
    </div>
  );
}
