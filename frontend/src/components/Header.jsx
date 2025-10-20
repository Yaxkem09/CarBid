import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import api from '../services/api';
import './Header.css';

const LINKS = [
  { to: '/inicio', label: 'Inicio' },
  { to: '/publicar-carro', label: 'Publicar vehículo' },
  { to: '/historial', label: 'Historial' },
];

export default function Header() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      navigate('/', { replace: true });
    }
  };

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="app-header__brand">CarBid</div>
        <nav className="app-header__nav">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `app-header__link${isActive ? ' app-header__link--active' : ''}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="app-header__actions">
          <button
            type="button"
            className="app-header__notifications"
            aria-label="Ver notificaciones"
          >
            <span aria-hidden="true">🔔</span>
            <span className="app-header__notifications-badge" aria-hidden="true" />
          </button>
          <div className="app-header__user">
            <div className="app-header__avatar" aria-hidden="true">
              U
            </div>
            <div className="app-header__user-meta">
              <span className="app-header__user-name">Usuario</span>
              <button
                type="button"
                className="app-header__logout"
                onClick={handleLogout}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
