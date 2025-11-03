import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './historial.css';

const Historial = () => {
  const [myListings, setMyListings] = useState([]);
  const [myBids, setMyBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('es-GT', {
        style: 'currency',
        currency: 'GTQ',
        maximumFractionDigits: 0,
      }),
    [],
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('es-GT', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);

    Promise.all([api.get('/api/listings', { params: { mine: 1 } }), api.get('/api/bids/mine')])
      .then(([listingsResponse, bidsResponse]) => {
        if (!alive) {
          return;
        }

        setMyListings(listingsResponse.data ?? []);
        setMyBids(bidsResponse.data ?? []);
        setError('');
      })
      .catch((err) => {
        if (!alive) {
          return;
        }

        setError(err.response?.data?.message || 'No se pudo cargar el historial');
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  const formatCurrency = (value) => {
    if (value === null || value === undefined) {
      return '-';
    }

    try {
      return currencyFormatter.format(value);
    } catch (err) {
      const numeric = Number(value);
      if (Number.isNaN(numeric)) {
        return '-';
      }
      return `Q${numeric.toLocaleString('es-GT')}`;
    }
  };

  const formatClosingDate = (isoDate) => {
    if (!isoDate) {
      return '-';
    }

    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) {
      return '-';
    }

    return dateFormatter.format(parsed);
  };

  const bidsByAuction = useMemo(() => {
    const map = new Map();

    myBids.forEach((bid) => {
      const current = map.get(bid.listingId);
      if (!current || bid.amount >= current.amount) {
        map.set(bid.listingId, bid);
      }
    });

    return Array.from(map.values());
  }, [myBids]);

  const participatingAuctions = useMemo(
    () => bidsByAuction.filter((bid) => bid.listingStatus === 'active'),
    [bidsByAuction],
  );

  const wonAuctions = useMemo(
    () => bidsByAuction.filter((bid) => bid.result === 'Ganada'),
    [bidsByAuction],
  );

  const getBidStatusLabel = (bid) => {
    if (bid.result === 'Ganada') {
      return 'Ganada';
    }

    if (bid.listingStatus === 'active') {
      return 'En curso';
    }

    return bid.result || 'Finalizada';
  };

  const getListingStatusLabel = (listing) => {
    if (listing.status === 'active') {
      return 'En vivo';
    }

    return 'Finalizada';
  };

  const handleViewAuction = (auctionId) => {
    navigate(`/detalle-subasta/${auctionId}`);
  };

  return (
    <div className="historial-page">
      <h1>Mi historial</h1>

      {loading && <p>Cargando historial...</p>}
      {error && <p className="historial-page__error">{error}</p>}

      {!loading && !error && (
        <div className="historial-page__sections">
          <section className="historial-card">
            <h2>Mis subastas</h2>
            <div
              className="historial-table"
              style={{
                '--table-columns':
                  'minmax(12rem, 2.1fr) repeat(3, minmax(6.75rem, 1fr)) minmax(5.25rem, auto)',
              }}
            >
              <div className="historial-table__header">
                <span>Vehiculo</span>
                <span>Mi oferta actual</span>
                <span>Estado</span>
                <span>Cierra</span>
                <span>Acciones</span>
              </div>

              {participatingAuctions.length === 0 && (
                <div className="historial-table__empty">No tienes subastas en curso.</div>
              )}

              {participatingAuctions.map((bid) => (
                <div className="historial-table__row" key={bid.listingId}>
                  <span data-label="Vehiculo">{bid.listingTitle}</span>
                  <span data-label="Mi oferta actual">{formatCurrency(bid.amount)}</span>
                  <span data-label="Estado">{getBidStatusLabel(bid)}</span>
                  <span data-label="Cierra">{formatClosingDate(bid.listingEndsAt)}</span>
                  <span data-label="Acciones">
                    <button type="button" onClick={() => handleViewAuction(bid.listingId)}>
                      Ver
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="historial-card">
            <h2>Ganadas</h2>
            <div
              className="historial-table"
              style={{
                '--table-columns':
                  'minmax(12rem, 2.2fr) repeat(2, minmax(6.75rem, 1fr)) minmax(5.25rem, auto)',
              }}
            >
              <div className="historial-table__header">
                <span>Vehiculo</span>
                <span>Oferta ganadora</span>
                <span>Fecha cierre</span>
                <span>Acciones</span>
              </div>

              {wonAuctions.length === 0 && (
                <div className="historial-table__empty">Aun no has ganado subastas.</div>
              )}

              {wonAuctions.map((bid) => (
                <div className="historial-table__row" key={bid.listingId}>
                  <span data-label="Vehiculo">{bid.listingTitle}</span>
                  <span data-label="Oferta ganadora">{formatCurrency(bid.amount)}</span>
                  <span data-label="Fecha cierre">{formatClosingDate(bid.listingEndsAt)}</span>
                  <span data-label="Acciones">
                    <button type="button" onClick={() => handleViewAuction(bid.listingId)}>
                      Ver
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="historial-card">
            <h2>Mis publicaciones</h2>
            <div
              className="historial-table"
              style={{
                '--table-columns':
                  'minmax(12rem, 2fr) minmax(6.75rem, 0.95fr) minmax(7rem, 1.05fr) minmax(6.75rem, 1fr) minmax(5.25rem, auto)',
              }}
            >
              <div className="historial-table__header">
                <span>Vehiculo</span>
                <span>Estado</span>
                <span>Finaliza</span>
                <span>Ofertas</span>
                <span>Acciones</span>
              </div>

              {myListings.length === 0 && (
                <div className="historial-table__empty">No tienes publicaciones activas.</div>
              )}

              {myListings.map((listing) => (
                <div className="historial-table__row" key={listing.id}>
                  <span data-label="Vehiculo">{listing.title}</span>
                  <span data-label="Estado">{getListingStatusLabel(listing)}</span>
                  <span data-label="Finaliza">
                    {listing.status === 'active' ? formatClosingDate(listing.endsAt) : '-'}
                  </span>
                  <span data-label="Ofertas">
                    {formatCurrency(listing.highestBid ?? listing.basePrice)}
                  </span>
                  <span data-label="Acciones">
                    <button type="button" onClick={() => handleViewAuction(listing.id)}>
                      Ver
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default Historial;
