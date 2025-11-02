import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import logo1 from '../assets/logo1.png';
import './Header.css';

const LINKS = [
  { to: '/inicio', label: 'Inicio' },
  { to: '/publicar-carro', label: 'Publicar vehiculo' },
  { to: '/historial', label: 'Historial' },
];

const ENDING_SOON_THRESHOLD_MINUTES = 30;

function safeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getLatestBidsPerListing(bids = []) {
  const seen = new Set();
  const latest = [];

  bids.forEach((bid) => {
    if (!bid || bid.listingId == null) return;
    if (seen.has(bid.listingId)) return;

    seen.add(bid.listingId);
    latest.push(bid);
  });

  return latest;
}

function formatRemainingDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return 'menos de un minuto';
  }

  const totalMinutes = Math.round(milliseconds / 60000);
  if (totalMinutes <= 1) {
    return 'menos de un minuto';
  }

  if (totalMinutes < 60) {
    return `${totalMinutes} minutos`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }

  return `${hours} ${hours === 1 ? 'hora' : 'horas'} y ${minutes} minutos`;
}

function createNotificationsFromBids(bids = [], now = new Date()) {
  const nowMs = now.getTime();
  const thresholdMs = ENDING_SOON_THRESHOLD_MINUTES * 60 * 1000;
  const notifications = [];

  getLatestBidsPerListing(bids).forEach((bid) => {
    const status = (bid?.listingStatus || '').toLowerCase();
    const result = (bid?.result || '').toLowerCase();
    const listingTitle = bid?.listingTitle || 'esta subasta';
    const endsAtDate = safeDate(bid?.listingEndsAt);
    const createdAtDate = safeDate(bid?.createdAt);
    const baseTimestamp = endsAtDate || createdAtDate || now;

    if (status === 'ended') {
      if (result === 'ganada') {
        notifications.push({
          id: `win-${bid.listingId}`,
          listingId: bid.listingId,
          type: 'win',
          title: 'Ganaste la subasta',
          message: `Te adjudicaste "${listingTitle}".`,
          timestamp: baseTimestamp.toISOString(),
        });
      } else {
        notifications.push({
          id: `ended-${bid.listingId}`,
          listingId: bid.listingId,
          type: 'ended',
          title: 'Subasta finalizada',
          message: `La subasta "${listingTitle}" ha terminado.`,
          timestamp: baseTimestamp.toISOString(),
        });
      }
      return;
    }

    if (!endsAtDate) return;

    const endsAtMs = endsAtDate.getTime();
    if (!Number.isFinite(endsAtMs)) return;

    if (endsAtMs > nowMs && endsAtMs - nowMs <= thresholdMs) {
      notifications.push({
        id: `ending-${bid.listingId}`,
        listingId: bid.listingId,
        type: 'endingSoon',
        title: 'Subasta por finalizar',
        message: `Quedan ${formatRemainingDuration(endsAtMs - nowMs)} para "${listingTitle}".`,
        timestamp: endsAtDate.toISOString(),
      });
    }
  });

  return notifications.sort((a, b) => {
    const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return bTime - aTime;
  });
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [userName, setUserName] = useState('Usuario');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [notifications, setNotifications] = useState([]);
  const notificationsWrapperRef = useRef(null);
  const notificationsPanelId = 'app-header-notifications-panel';
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const userMenuPanelId = 'app-header-user-menu';

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('es-CO', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [],
  );

  useEffect(() => {
    let alive = true;

    const loadUser = async () => {
      try {
        const response = await api.get('/api/auth/me');
        if (!alive) {
          return;
        }
        const user = response.data?.user ?? {};
        const lastName = Array.isArray(user.apellidos)
          ? user.apellidos[0]
          : (user.apellidos || '').split(' ').filter(Boolean)[0];
        const fullName = [user.nombre, lastName].filter(Boolean).join(' ').trim();
        const fallback = user.nombre || user.email || 'Usuario';
        setUserName(fullName || fallback);
      } catch (error) {
        if (!alive) {
          return;
        }
        setUserName('Usuario');
      }
    };

    loadUser();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const loadNotifications = async () => {
      if (!alive) return;

      setNotificationsLoading(true);
      try {
        const response = await api.get('/api/bids/mine');
        if (!alive) return;

        const items = createNotificationsFromBids(response.data ?? []);
        setNotifications(items);
        setNotificationsError('');
      } catch (error) {
        if (!alive) return;
        if (error.response?.status === 401) {
          setNotifications([]);
          setNotificationsError('');
        } else {
          setNotificationsError('No se pudieron cargar las notificaciones.');
        }
      } finally {
        if (alive) {
          setNotificationsLoading(false);
        }
      }
    };

    loadNotifications();
    const intervalId = setInterval(loadNotifications, 60000);

    return () => {
      alive = false;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!notificationsOpen) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (!notificationsWrapperRef.current) return;
      if (notificationsWrapperRef.current.contains(event.target)) return;
      setNotificationsOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setNotificationsOpen(false);
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (!userMenuOpen) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (!userMenuRef.current) return;
      if (userMenuRef.current.contains(event.target)) return;
      setUserMenuOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [userMenuOpen]);

  const handleToggleNotifications = () => {
    setUserMenuOpen(false);
    setNotificationsOpen((prev) => !prev);
  };

  const handleNotificationNavigate = (listingId) => {
    setNotificationsOpen(false);
    if (listingId != null) {
      navigate(`/detalle-subasta/${listingId}`);
    }
  };

  const notificationCount = notifications.length;
  const hasNotifications = notificationCount > 0;
  const notificationsButtonLabel = hasNotifications
    ? `Ver ${notificationCount === 1 ? '1 notificacion' : `${notificationCount} notificaciones`}`
    : 'Ver notificaciones';

  const resolveLinkParts = (to) => {
    if (typeof to === 'string') {
      const [path = '/', hash = ''] = to.split('#');
      return {
        pathname: path || '/',
        hash: hash ? `#${hash}` : '',
      };
    }

    return {
      pathname: to?.pathname ?? '/',
      hash: to?.hash ?? '',
    };
  };

  const getLinkClassName = (link) => ({ isActive }) => {
    const { pathname: linkPath, hash: linkHash } = resolveLinkParts(link.to);
    const isPathMatch = location.pathname === linkPath;
    const isHashMatch = !linkHash || location.hash === linkHash;
    const active = isActive || (isPathMatch && isHashMatch);
    return `app-header__link${active ? ' app-header__link--active' : ''}`;
  };

  const handleToggleUserMenu = () => {
    setNotificationsOpen(false);
    setUserMenuOpen((prev) => !prev);
  };

  const handleLogout = async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setUserMenuOpen(false);
      navigate('/', { replace: true });
    }
  };

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link to="/inicio" className="app-header__brand" aria-label="Ir a inicio">
          <img src={logo1} alt="CarBid" />
        </Link>
        <nav className="app-header__nav">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={getLinkClassName(link)}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="app-header__actions">
          <div className="app-header__notifications-wrapper" ref={notificationsWrapperRef}>
            <button
              type="button"
              className="app-header__notifications"
              aria-label={notificationsButtonLabel}
              aria-expanded={notificationsOpen}
              aria-controls={notificationsPanelId}
              onClick={handleToggleNotifications}
            >
              <svg
                className="app-header__notifications-icon"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M12 2C9.23858 2 7 4.23858 7 7V8.76471C7 9.70755 6.66747 10.619 6.06671 11.3333L4.53329 13.1667C3.90151 13.9194 4.23792 15 5.16839 15H18.8316C19.7621 15 20.0985 13.9194 19.4667 13.1667L17.9333 11.3333C17.3325 10.619 17 9.70755 17 8.76471V7C17 4.23858 14.7614 2 12 2Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M9.5 15C9.5 16.3807 10.6193 17.5 12 17.5C13.3807 17.5 14.5 16.3807 14.5 15"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              {hasNotifications && (
                <span className="app-header__notifications-badge">
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <div
                id={notificationsPanelId}
                className="app-header__notifications-panel"
                role="dialog"
                aria-label="Notificaciones"
              >
                <div className="app-header__notifications-header">
                  <span>Notificaciones</span>
                  {notificationsLoading && (
                    <span className="app-header__notifications-status" aria-live="polite">
                      Cargando...
                    </span>
                  )}
                </div>
                {notificationsError && (
                  <p className="app-header__notifications-error">{notificationsError}</p>
                )}
                {!notificationsError && !hasNotifications && !notificationsLoading && (
                  <p className="app-header__notifications-empty">
                    No tienes notificaciones por ahora.
                  </p>
                )}
                {!notificationsError && hasNotifications && (
                  <ul className="app-header__notifications-list">
                    {notifications.map((notification) => (
                      <li
                        key={notification.id}
                        className={`app-header__notification app-header__notification--${notification.type}`}
                      >
                        <button
                          type="button"
                          onClick={() => handleNotificationNavigate(notification.listingId)}
                        >
                          <span className="app-header__notification-title">{notification.title}</span>
                          <span className="app-header__notification-message">
                            {notification.message}
                          </span>
                          {notification.timestamp && (
                            <span className="app-header__notification-meta">
                              {dateTimeFormatter.format(new Date(notification.timestamp))}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="app-header__user" ref={userMenuRef}>
            <button
              type="button"
              className={`app-header__user-toggle${userMenuOpen ? ' app-header__user-toggle--open' : ''}`}
              onClick={handleToggleUserMenu}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              aria-controls={userMenuPanelId}
            >
              <span className="app-header__user-name">{userName}</span>
              <svg
                className="app-header__user-arrow"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div
              id={userMenuPanelId}
              className={`app-header__user-menu${userMenuOpen ? ' app-header__user-menu--open' : ''}`}
              role="menu"
            >
              <button
                type="button"
                className="app-header__user-menu-item"
                role="menuitem"
                onClick={handleLogout}
              >
                Cerrar sesion
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
