// src/components/ProtectedRoute.jsx
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../services/api';

export default function ProtectedRoute({ children }) {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let alive = true;
    api.get('/api/auth/me')
      .then(() => alive && setStatus('ok'))
      .catch(() => alive && setStatus('no'));
    return () => { alive = false; };
  }, []);

  if (status === 'loading') return <div style={{ padding: 24 }}>Cargando…</div>;
  if (status === 'no') return <Navigate to="/" replace />;
  return children;
}
