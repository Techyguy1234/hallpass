import { useState, useEffect, useCallback } from 'react';
import { GET, POST, PATCH } from '../api';

function timeSince(iso) {
  const secs = Math.floor((Date.now() - new Date(iso + 'Z').getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function Badge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export default function TeacherDashboard() {
  const [tab, setTab] = useState('issue');
  const tabs = [
    { id: 'issue',   label: 'Issue Pass' },
    { id: 'active',  label: 'Active Passes' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div>
      <div className="tabs">
        {tabs.map(t => (
          <button key={t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'issue'   && <IssuePass />}
      {tab === 'active'  && <ActivePasses />}
      {tab === 'history' && <History />}
    </div>
  );
}

function IssuePass() {
  const [students, setStudents] = useState([]);
  const [locations, setLocations] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [duration, setDuration] = useState(10);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    GET('/users/students').then(setStudents).catch(console.error);
    GET('/locations').then(setLocations).catch(console.error);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    setLoading(true);
    try {
      const pass = await POST('/passes', {
        student_id: parseInt(studentId),
        location_id: parseInt(locationId),
        expected_duration_minutes: parseInt(duration),
        notes: notes || undefined,
      });
      setSuccess(`Pass issued for ${pass.student_name} → ${pass.location_name}`);
      setStudentId(''); setLocationId(''); setNotes('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: '1rem', maxWidth: '500px' }}>
      <h2>Issue Hall Pass</h2>
      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Student</label>
          <select value={studentId} onChange={e => setStudentId(e.target.value)} required>
            <option value="">— Select student —</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.display_name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Destination</label>
          <select value={locationId} onChange={e => setLocationId(e.target.value)} required>
            <option value="">— Select location —</option>
            {locations.map(l => (
              <option key={l.id} value={l.id} disabled={l.current_occupancy >= l.max_occupancy}>
                {l.name} ({l.current_occupancy}/{l.max_occupancy})
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Expected Duration (minutes)</label>
          <input type="number" min="1" max="60" value={duration}
            onChange={e => setDuration(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Notes (optional)</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. with a buddy" />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Issuing…' : 'Issue Pass'}
        </button>
      </form>
    </div>
  );
}

function ActivePasses() {
  const [passes, setPasses] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await GET('/passes/active');
      setPasses(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAction(passId, action) {
    try {
      await PATCH(`/passes/${passId}/${action}`, {});
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div className="spinner" style={{ marginTop: '1rem' }}>Loading…</div>;

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>Active Passes</h2>
        <button className="btn btn-primary btn-sm" onClick={load}>↻ Refresh</button>
      </div>
      {passes.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--muted)' }}>No active passes</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Student</th><th>Location</th><th>Issued</th><th>Duration</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {passes.map(p => (
                <tr key={p.id}>
                  <td>{p.student_name}</td>
                  <td>{p.location_name}</td>
                  <td>{timeSince(p.issued_at)}</td>
                  <td>{p.expected_duration_minutes}m</td>
                  <td style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-success btn-sm" onClick={() => handleAction(p.id, 'return')}>Return</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleAction(p.id, 'expire')}>Expire</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function History() {
  const [passes, setPasses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    GET('/passes').then(setPasses).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="spinner" style={{ marginTop: '1rem' }}>Loading…</div>;

  return (
    <div style={{ marginTop: '1rem' }}>
      <h2 style={{ marginBottom: '0.75rem' }}>Pass History</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Student</th><th>Location</th><th>Status</th><th>Issued</th></tr>
          </thead>
          <tbody>
            {passes.map(p => (
              <tr key={p.id}>
                <td>{p.student_name}</td>
                <td>{p.location_name}</td>
                <td><Badge status={p.status} /></td>
                <td>{new Date(p.issued_at + 'Z').toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
