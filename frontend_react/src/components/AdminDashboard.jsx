import { useState, useEffect, useCallback } from 'react';
import { GET, POST, PATCH, DELETE } from '../api';

function Badge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export default function AdminDashboard() {
  const [tab, setTab] = useState('dashboard');
  const tabs = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'passes',    label: '🎫 Passes' },
    { id: 'users',     label: '👥 Users' },
    { id: 'locations', label: '📍 Locations' },
    { id: 'reports',   label: '📋 Reports' },
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
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'passes'    && <ActivePassesAdmin />}
      {tab === 'users'     && <UsersManager />}
      {tab === 'locations' && <LocationsManager />}
      {tab === 'reports'   && <Reports />}
    </div>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    GET('/passes/stats').then(setStats).catch(console.error);
  }, []);

  if (!stats) return <div className="spinner" style={{ marginTop: '1rem' }}>Loading…</div>;

  return (
    <div style={{ marginTop: '1rem' }}>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="num">{stats.active_passes}</div>
          <div className="lbl">Active Passes</div>
        </div>
        <div className="stat-card">
          <div className="num">{stats.passes_today}</div>
          <div className="lbl">Passes Today</div>
        </div>
      </div>
      <div className="card">
        <h2>Location Occupancy</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Location</th><th>Current</th><th>Max</th></tr>
            </thead>
            <tbody>
              {stats.locations.map(l => (
                <tr key={l.name}>
                  <td>{l.name}</td>
                  <td>{l.current_occupancy}</td>
                  <td>{l.max_occupancy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Active Passes (Admin) ───────────────────────────────────────────────────

function ActivePassesAdmin() {
  const [passes, setPasses] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
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
    try { await PATCH(`/passes/${passId}/${action}`, {}); load(); }
    catch (err) { alert(err.message); }
  }

  if (loading) return <div className="spinner" style={{ marginTop: '1rem' }}>Loading…</div>;

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>Active Passes</h2>
        <button className="btn btn-primary btn-sm" onClick={load}>↻ Refresh</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Student</th><th>Location</th><th>Teacher</th><th>Issued</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {passes.length === 0
              ? <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--muted)' }}>No active passes</td></tr>
              : passes.map(p => (
                <tr key={p.id}>
                  <td>{p.student_name}</td>
                  <td>{p.location_name}</td>
                  <td>{p.teacher_name}</td>
                  <td>{new Date(p.issued_at + 'Z').toLocaleTimeString()}</td>
                  <td style={{ display: 'flex', gap: '0.4rem' }}>
                    <button className="btn btn-success btn-sm" onClick={() => handleAction(p.id, 'return')}>Return</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleAction(p.id, 'expire')}>Expire</button>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Users Manager ───────────────────────────────────────────────────────────

function UsersManager() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', role: 'student', display_name: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(() => {
    GET('/admin/users').then(setUsers).catch(console.error);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await POST('/admin/users', form);
      setSuccess(`User "${form.username}" created.`);
      setForm({ username: '', password: '', role: 'student', display_name: '' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id, username) {
    if (!confirm(`Delete user "${username}"?`)) return;
    try { await DELETE(`/admin/users/${id}`); load(); }
    catch (err) { alert(err.message); }
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '1', minWidth: '280px' }}>
          <h2>Create User</h2>
          {error   && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}
          <form onSubmit={handleCreate}>
            {['username', 'password', 'display_name'].map(f => (
              <div className="form-group" key={f}>
                <label>{f.replace('_', ' ')}</label>
                <input
                  type={f === 'password' ? 'password' : 'text'}
                  value={form[f]}
                  onChange={e => setForm(prev => ({ ...prev, [f]: e.target.value }))}
                  required
                />
              </div>
            ))}
            <div className="form-group">
              <label>Role</label>
              <select value={form.role} onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button className="btn btn-primary" type="submit">Create User</button>
          </form>
        </div>
        <div className="card" style={{ flex: '2', minWidth: '320px' }}>
          <h2>All Users</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Username</th><th>Display Name</th><th>Role</th><th></th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.display_name}</td>
                    <td>{u.role}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u.id, u.username)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Locations Manager ───────────────────────────────────────────────────────

function LocationsManager() {
  const [locations, setLocations] = useState([]);
  const [name, setName] = useState('');
  const [maxOcc, setMaxOcc] = useState(3);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    GET('/locations').then(setLocations).catch(console.error);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    try {
      await POST('/locations', { name, max_occupancy: parseInt(maxOcc) });
      setName(''); setMaxOcc(3);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggle(loc) {
    try {
      await PATCH(`/locations/${loc.id}`, { active: loc.active ? 0 : 1 });
      load();
    } catch (err) { alert(err.message); }
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '1', minWidth: '260px' }}>
          <h2>Add Location</h2>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Max Occupancy</label>
              <input type="number" min="1" value={maxOcc} onChange={e => setMaxOcc(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit">Add Location</button>
          </form>
        </div>
        <div className="card" style={{ flex: '2', minWidth: '320px' }}>
          <h2>All Locations</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Max</th><th>Current</th><th>Status</th></tr>
              </thead>
              <tbody>
                {locations.map(l => (
                  <tr key={l.id}>
                    <td>{l.name}</td>
                    <td>{l.max_occupancy}</td>
                    <td>{l.current_occupancy}</td>
                    <td>
                      <button
                        className={`btn btn-sm ${l.active ? 'btn-danger' : 'btn-success'}`}
                        onClick={() => handleToggle(l)}
                      >
                        {l.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Reports ─────────────────────────────────────────────────────────────────

function Reports() {
  const [passes, setPasses] = useState([]);
  const [filters, setFilters] = useState({ status: '', start_date: '', end_date: '' });
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.status)     params.set('status',     filters.status);
    if (filters.start_date) params.set('start_date', filters.start_date);
    if (filters.end_date)   params.set('end_date',   filters.end_date);
    try {
      const data = await GET(`/admin/report?${params}`);
      setPasses(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ marginTop: '1rem' }}>
      <div className="card">
        <h2>Filters</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '140px' }}>
            <label>Status</label>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="returned">Returned</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '140px' }}>
            <label>From</label>
            <input type="date" value={filters.start_date}
              onChange={e => setFilters(f => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '140px' }}>
            <label>To</label>
            <input type="date" value={filters.end_date}
              onChange={e => setFilters(f => ({ ...f, end_date: e.target.value }))} />
          </div>
          <button className="btn btn-primary" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Apply'}
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Student</th><th>Location</th><th>Teacher</th><th>Status</th><th>Issued</th></tr>
          </thead>
          <tbody>
            {passes.length === 0
              ? <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--muted)' }}>No records</td></tr>
              : passes.map(p => (
                <tr key={p.id}>
                  <td>{p.student_name}</td>
                  <td>{p.location_name}</td>
                  <td>{p.teacher_name}</td>
                  <td><Badge status={p.status} /></td>
                  <td>{new Date(p.issued_at + 'Z').toLocaleString()}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
