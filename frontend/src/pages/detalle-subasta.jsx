import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import './detalle-subasta.css';

const DetalleSubasta = () => {
  const { id } = useParams();
  const [listing, setListing] = useState(null);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [bidError, setBidError] = useState('');
  const [bidLoading, setBidLoading] = useState(false);

  const loadDetails = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/listings/${id}`);
      setListing(response.data.listing);
      setBids(response.data.bids);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cargar la subasta');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const handleBidSubmit = async (event) => {
    event.preventDefault();
    setBidError('');

    const amount = Number(bidAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setBidError('Ingresa una cantidad válida.');
      return;
    }

    try {
      setBidLoading(true);
      await api.post(`/listings/${id}/bids`, { amount });
      setBidAmount('');
      await loadDetails();
    } catch (err) {
      setBidError(err.response?.data?.message || 'No se pudo registrar la oferta');
    } finally {
      setBidLoading(false);
    }
  };

  if (loading) {
    return <p className="detalle-subasta__state">Cargando subasta…</p>;
  }

  if (error) {
    return <p className="detalle-subasta__state detalle-subasta__state--error">{error}</p>;
  }

  return (
    <div className="detalle-subasta">
      <section className="detalle-subasta__info">
        <h1>{listing.title}</h1>
        <p className="detalle-subasta__meta">
          {listing.brand} {listing.model} · {listing.year}
        </p>
        <p>Precio base: ${listing.basePrice}</p>
        <p>Oferta más alta: ${listing.highestBid ?? listing.basePrice}</p>
        <p className="detalle-subasta__description">{listing.description}</p>
        <p>Cierre: {new Date(listing.endsAt).toLocaleString()}</p>
      </section>

      <section className="detalle-subasta__bids">
        <h2>Pujar</h2>
        <form onSubmit={handleBidSubmit} className="detalle-subasta__form">
          <label htmlFor="bidAmount">Tu oferta</label>
          <input
            id="bidAmount"
            type="number"
            min="0"
            value={bidAmount}
            onChange={(event) => setBidAmount(event.target.value)}
            required
          />
          <button type="submit" disabled={bidLoading}>
            {bidLoading ? 'Enviando…' : 'Enviar oferta'}
          </button>
        </form>
        {bidError && <p className="detalle-subasta__error">{bidError}</p>}

        <h3>Historial de ofertas</h3>
        <ul className="detalle-subasta__bid-list">
          {bids.map((bid) => (
            <li key={bid.id}>
              <strong>${bid.amount}</strong> · {new Date(bid.createdAt).toLocaleString()}
            </li>
          ))}
          {bids.length === 0 && <li>Todavía no hay ofertas.</li>}
        </ul>
      </section>
    </div>
  );
};

export default DetalleSubasta;
