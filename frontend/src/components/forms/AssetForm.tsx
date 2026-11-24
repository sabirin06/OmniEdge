import React, { useState, useEffect } from 'react';
import { FormDialog } from '../ui/FormDialog';
import { useToast } from '../ui/Toast';
import { assetsApi } from '../../api/assets';
import { useAuth } from '../../hooks/useAuth';
import type { Asset, Severity } from '../../types';

const ASSET_TYPES = ['server','workstation','network_device','cloud_instance','other'];
const SEVERITIES: Severity[] = ['critical','high','medium','low','info'];

interface Props { open: boolean; asset?: Asset | null; onClose: () => void; onSaved: () => void; }

export function AssetForm({ open, asset, onClose, onSaved }: Props) {
  const toast = useToast();
  const { user } = useAuth();
  const [name, setName]       = useState('');
  const [assetType, setType]  = useState('server');
  const [ip, setIp]           = useState('');
  const [hostname, setHost]   = useState('');
  const [os, setOs]           = useState('');
  const [owner, setOwner]     = useState('');
  const [criticality, setCrit]= useState<Severity>('medium');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors]   = useState<Record<string,string>>({});

  useEffect(() => {
    if (open) {
      setName(asset?.name ?? '');
      setType(asset?.asset_type ?? 'server');
      setIp(asset?.ip_address ?? '');
      setHost(asset?.hostname ?? '');
      setOs(asset?.os ?? '');
      setOwner(asset?.owner ?? '');
      setCrit((asset?.criticality as Severity) ?? 'medium');
      setErrors({});
    }
  }, [open, asset]);

  const validate = () => {
    const e: Record<string,string> = {};
    if (!name.trim()) e.name = 'Name required';
    if (ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) e.ip = 'Invalid IP address';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = { name, asset_type: assetType, ip_address: ip, hostname, os, owner, criticality, tenant: user?.tenant! };
      if (asset) await assetsApi.update(asset.id, payload);
      else await assetsApi.create(payload);
      toast('success', asset ? 'Asset updated' : 'Asset created');
      onSaved(); onClose();
    } catch { toast('error', 'Failed to save asset'); }
    finally { setLoading(false); }
  };

  return (
    <FormDialog open={open} title={asset ? 'Edit Asset' : 'New Asset'} onClose={onClose} onSubmit={handleSubmit} submitLoading={loading}>
      <div className="form-row">
        <div className="form-group">
          <label>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="web-server-01" />
          {errors.name && <div className="form-error">{errors.name}</div>}
        </div>
        <div className="form-group">
          <label>Type</label>
          <select value={assetType} onChange={e => setType(e.target.value)}>
            {ASSET_TYPES.map(t => <option key={t} value={t}>{t.replace('_',' ')}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>IP Address</label>
          <input value={ip} onChange={e => setIp(e.target.value)} placeholder="10.0.0.1" />
          {errors.ip && <div className="form-error">{errors.ip}</div>}
        </div>
        <div className="form-group">
          <label>Hostname</label>
          <input value={hostname} onChange={e => setHost(e.target.value)} placeholder="web-01.example.com" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>OS</label>
          <input value={os} onChange={e => setOs(e.target.value)} placeholder="Ubuntu 22.04" />
        </div>
        <div className="form-group">
          <label>Owner</label>
          <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="ops-team" />
        </div>
      </div>
      <div className="form-group">
        <label>Criticality</label>
        <select value={criticality} onChange={e => setCrit(e.target.value as Severity)}>
          {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
        </select>
      </div>
    </FormDialog>
  );
}
