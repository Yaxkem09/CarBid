import React, { useEffect, useState } from 'react';
import api from '../services/api';
import './historial.css';

const Historial = () => {
  const [myListings, setMyListings] = useState([]);
  const [myBids, setMyBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);

    Promise.all([
      api.get('/listings', { params: { mine: 1 } }),
      api.get('/bids/mine'),
    ])
      .then(([listingsResponse, bidsResponse]) => {
        if (!alive) return;
        setMyListings(listingsResponse.data);
        setMyBids(bidsResponse.data);
        setError('');
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.response?.data?.message || 'No se pudo cargar el historial');
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, []);

  const activeListings = myListings.filter((listing) => listing.status === 'active');
  const closedListings = myListings.filter((listing) => listing.status !== 'active');
  const activeBids = myBids.filter((bid) => bid.listingStatus === 'active');
  const closedBids = myBids.filter((bid) => bid.listingStatus !== 'active');

  return (
    <div className="historial-page">
      <h1>Mi historial</h1>

      {loading && <p>Cargando historial…</p>}
      {error && <p className="historial-page__error">{error}</p>}

      {!loading && !error && (
        <div className="historial-page__grid">
          <section>
            <h2>Subastas activas</h2>
            <ul>
              {activeListings.map((listing) => (
                <li key={listing.id}>
                  {listing.title} · Oferta más alta: ${listing.highestBid ?? listing.basePrice}
                </li>
              ))}
              {activeListings.length === 0 && <li>No tienes subastas activas.</li>}
            </ul>
          </section>

          <section>
            <h2>Subastas terminadas</h2>
            <ul>
              {closedListings.map((listing) => (
                <li key={listing.id}>
                  {listing.title} · Oferta más alta: ${listing.highestBid ?? listing.basePrice}
                </li>
              ))}
              {closedListings.length === 0 && <li>No tienes subastas terminadas.</li>}
            </ul>
          </section>

          <section>
            <h2>Mis participaciones actuales</h2>
            <ul>
              {activeBids.map((bid) => (
                <li key={bid.id}>
                  {bid.listingTitle} · Tu oferta: ${bid.amount}
                </li>
              ))}
              {activeBids.length === 0 && <li>No estás participando en subastas activas.</li>}
            </ul>
          </section>

          <section>
            <h2>Mis pujas anteriores</h2>
            <ul>
              {closedBids.map((bid) => (
                <li key={bid.id}>
                  {bid.listingTitle} · Tu oferta: ${bid.amount} · Resultado: {bid.result}
                </li>
              ))}
              {closedBids.length === 0 && <li>No registras pujas anteriores.</li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
};

export default Historial;
