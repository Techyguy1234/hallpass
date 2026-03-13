import { useState, useEffect, useCallback } from 'react';
import { GET, PATCH } from '../api';

function timeSince(iso) {
  const secs = Math.floor((Date.now() - new Date(iso + 'Z').getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

export default function StudentPortal() {
  const [pass, setPass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const passes = await GET('/passes?status=active');
      setPass(passes.length > 0 ? passes[0] : null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh timer every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  async function handleReturn() {
    setError('');
    try {
      await PATCH(`/passes/${pass.id}/return`, {});
      setMsg('You have been marked as returned. Welcome back!');
      setPass(null);
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <div className="spinner">Loading…</div>;

  return (
    <div>
      <h2 style={{ marginBottom: '1rem' }}>My Hall Pass</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {msg   && <div className="alert alert-success">{msg}</div>}

      {pass ? (
        <div className="card pass-card">
          <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
            You are currently out of class
          </div>
          <div className="location">{pass.location_name}</div>
          <div className="timer">Issued {timeSince(pass.issued_at)}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Issued by {pass.teacher_name}
            {pass.notes && <> · {pass.notes}</>}
          </div>
          <button className="btn btn-success" onClick={handleReturn}>
            ✅ I've Returned to Class
          </button>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✅</div>
          <div>You don't have an active hall pass. You're in class!</div>
        </div>
      )}
    </div>
  );
}
