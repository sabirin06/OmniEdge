import { useState } from 'react';
import type { FormEvent } from 'react';
import { playbooksApi } from '../api/playbooks';
import { requestError } from '../api/errors';
import { useApi } from '../hooks/useApi';
import { Pagination } from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';

export function Playbooks() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const list = useApi(() => playbooksApi.list({ page, search }), [page, search]);
  const records = list.data?.results ?? [];
  const book = records.find(item => item.id === selected) as any;
  async function save(event: FormEvent<HTMLFormElement>, action: (data: FormData) => Promise<unknown>, message: string, reset = false) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    setSaving(true); setError('');
    try { await action(new FormData(form)); if (reset) form.reset(); list.refresh(); toast('success', message); }
    catch (err) { setError(requestError(err, 'Could not save the playbook.')); }
    finally { setSaving(false); }
  }

  return <section>
    <div className="form-group"><label>Search playbooks <input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label></div>
    {list.loading && <p role="status">Loading playbooks…</p>}
    {list.error && <p role="alert">Could not load playbooks. <button onClick={list.refresh}>Retry</button></p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {!records.length && !list.loading && !list.error && <p>No playbooks found.</p>}
    <div className="filter-bar">
      <button className="btn btn-primary" onClick={() => { setSelected(null); setError(''); }}>New playbook</button>
      {records.map(record => <button className="btn btn-secondary" key={record.id}
        onClick={() => { setSelected(record.id); setError(''); }}>{record.name}</button>)}
    </div>
    <Pagination page={page} pageSize={50} total={list.data?.count ?? 0} onPageChange={setPage} />
    <div className="card" key={book?.id ?? 'new'}>
      <h2>{book ? 'Edit playbook' : 'Create playbook'}</h2>
      <form onSubmit={event => save(event, async data => {
        const payload = { name: String(data.get('name')), category: String(data.get('category')),
          description: String(data.get('description')), enabled: data.has('enabled') };
        if (book) await playbooksApi.update(book.id, payload);
        else setSelected((await playbooksApi.create(payload)).data.id);
      }, 'Playbook saved')}>
        <div className="form-group"><label>Name <input name="name" required maxLength={255} defaultValue={book?.name} /></label></div>
        <div className="form-group"><label>Category <input name="category" maxLength={100} defaultValue={book?.category} /></label></div>
        <div className="form-group"><label>Description <textarea name="description" defaultValue={book?.description} /></label></div>
        <div className="form-group"><label><input type="checkbox" name="enabled" defaultChecked={book?.enabled ?? true} /> Enabled</label></div>
        <button disabled={saving} className="btn btn-primary">Save playbook</button>
      </form>
    </div>
    {book && <div className="card">
      <h2>Ordered steps</h2>
      {[...(book.steps ?? []), null].map((step, index, steps) => (
        <form key={step?.id ?? 'new'} className="card" onSubmit={event => save(event, data => {
          const payload = { position: Number(data.get('position')), title: String(data.get('title')),
            instructions: String(data.get('instructions')), required: data.has('required') };
          return step ? playbooksApi.updateStep(book.id, step.id, payload) : playbooksApi.createStep(book.id, payload);
        }, step ? 'Step updated' : 'Step added', !step)}>
          <h3>{step ? `Step ${step.position}` : 'Add a step'}</h3>
          <div className="form-group"><label>Position <input type="number" name="position" min={1} required defaultValue={step?.position ?? ((steps[index - 1]?.position ?? 0) + 1)} /></label></div>
          <div className="form-group"><label>Title <input name="title" required maxLength={255} defaultValue={step?.title} /></label></div>
          <div className="form-group"><label>Instructions <textarea name="instructions" required defaultValue={step?.instructions} /></label></div>
          <div className="form-group"><label><input type="checkbox" name="required" defaultChecked={step?.required ?? true} /> Required for resolution</label></div>
          <button disabled={saving} className="btn btn-secondary">{step ? 'Update step' : 'Add step'}</button>
        </form>))}
    </div>}
  </section>;
}
