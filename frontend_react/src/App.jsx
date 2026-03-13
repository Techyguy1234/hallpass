import { useState, useEffect } from 'react';
import { getUser, clearAuth } from './api';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import TeacherDashboard from './components/TeacherDashboard';
import StudentPortal from './components/StudentPortal';

export default function App() {
  const [user, setUser] = useState(() => getUser());

  function handleLogin(userData) {
    setUser(userData);
  }

  function handleLogout() {
    clearAuth();
    setUser(null);
  }

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div>
      <nav className="navbar">
        <h1>🎫 HallPass</h1>
        <span>{user.display_name} ({user.role})</span>
        <button className="btn-logout" onClick={handleLogout}>Logout</button>
      </nav>
      <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '2rem' }}>
        {user.role === 'admin'   && <AdminDashboard />}
        {user.role === 'teacher' && <TeacherDashboard />}
        {user.role === 'student' && <StudentPortal />}
      </div>
    </div>
  );
}
