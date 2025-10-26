import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import './detalle-subasta.css';

const formatCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '$0';
  }
  return `$${numeric.toLocaleString()}`;
};

const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const formatRemainingTime = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }

  const pad = (value) => value.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

const DetalleSubasta = () => {
  const { id } = useParams();
  const [listing, setListing] = useState(null);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [extraAmount, setExtraAmount] = useState('');
  const [bidError, setBidError] = useState('');
  const [bidLoading, setBidLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const assetsBaseUrl = useMemo(() => {
    const baseURL = api.defaults.baseURL ?? '';
    if (!baseURL) {
      return '';
    }
    return baseURL.replace(/\/api\/?$/, '');
  }, []);

  const resolveImageSrc = useCallback(
    (imagePath) => {
      if (!imagePath) {
        return '';
      }
      if (/^https?:\/\//i.test(imagePath)) {
        return imagePath;
      }
      const sanitizedBase = assetsBaseUrl.endsWith('/')
        ? assetsBaseUrl.slice(0, -1)
        : assetsBaseUrl;
      const sanitizedPath = imagePath.startsWith('/')
        ? imagePath.slice(1)
        : imagePath;

      if (sanitizedBase) {
        return `${sanitizedBase}/${sanitizedPath}`;
      }
      return `/${sanitizedPath}`;
    },
    [assetsBaseUrl],
  );

  const loadDetails = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setLoading(true);
        }
        const response = await api.get(`/listings/${id}`);
        setListing(response.data.listing);
        setBids(response.data.bids);
        setError('');
      } catch (err) {
        setError(err.response?.data?.message || 'No se pudo cargar la subasta');
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [id],
  );

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    const refreshInterval = setInterval(() => {
      loadDetails({ silent: true });
    }, 10000);

    return () => {
      clearInterval(refreshInterval);
    };
  }, [loadDetails]);

  useEffect(() => {
    if (!listing?.endsAt) {
      setTimeLeft('');
      setIsLive(listing?.status === 'active');
      return;
    }

    const updateCountdown = () => {
      const closingDate = new Date(listing.endsAt);
      if (Number.isNaN(closingDate.getTime())) {
        setTimeLeft('');
        setIsLive(false);
        return;
      }

      const diff = closingDate.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Finalizada');
        setIsLive(false);
        return;
      }

      setTimeLeft(formatRemainingTime(diff));
      setIsLive(listing.status === 'active');
    };

    updateCountdown();
    const intervalId = setInterval(updateCountdown, 1000);
    return () => clearInterval(intervalId);
  }, [listing]);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [listing?.id]);

  useEffect(() => {
    if (listing) {
      const defaultIncrement = Math.max(listing.minIncrement ?? 1, 1);
      setExtraAmount(String(defaultIncrement));
    }
  }, [listing]);

  const handleBidSubmit = async (event) => {
    event.preventDefault();
    setBidError('');

    const effectiveMinIncrement = Math.max(listing?.minIncrement ?? 1, 1);
    const numericExtra = Number(extraAmount);
    if (!Number.isFinite(numericExtra) || numericExtra <= 0) {
      setBidError('Ingresa un incremento valido.');
      return;
    }

    if (numericExtra < effectiveMinIncrement) {
      setBidError(`El incremento debe ser al menos ${formatCurrency(effectiveMinIncrement)}.`);
      return;
    }

    const highestBidAmount = listing?.highestBid ?? null;
    const baseAmount = highestBidAmount ?? listing.basePrice;
    const amount = baseAmount + numericExtra;
    const minNextBid = Math.max(baseAmount, listing.basePrice);
    if (amount <= minNextBid) {
      setBidError('El total debe superar la oferta actual.');
      return;
    }

    try {
      setBidLoading(true);
      await api.post(`/listings/${id}/bids`, { amount });
      setExtraAmount(String(Math.max(listing.minIncrement ?? 1, 1)));
      await loadDetails({ silent: true });
    } catch (err) {
      setBidError(err.response?.data?.message || 'No se pudo registrar la oferta');
    } finally {
      setBidLoading(false);
    }
  };

  if (loading) {
    return <p className="detalle-subasta__state">Cargando subasta...</p>;
  }

  if (error) {
    return <p className="detalle-subasta__state detalle-subasta__state--error">{error}</p>;
  }

  if (!listing) {
    return (
      <p className="detalle-subasta__state detalle-subasta__state--error">
        No se encontro la subasta.
      </p>
    );
  }

  const highestBidAmount = listing?.highestBid ?? null;
  const baseAmount = highestBidAmount ?? listing.basePrice;
  const minNextBid = Math.max(baseAmount, listing.basePrice);
  const effectiveMinIncrement = Math.max(listing.minIncrement ?? 1, 1);
  const incrementOptions = [1, 2, 3].map((multiplier) => ({
    multiplier,
    value: effectiveMinIncrement * multiplier,
  }));
  const numericExtraAmount = Number(extraAmount) || 0;
  const totalOffer = baseAmount + numericExtraAmount;
  const sortedBids = [...bids].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const hasImages = Array.isArray(listing.images) && listing.images.length > 0;
  const currentImageSrc = hasImages
    ? resolveImageSrc(listing.images[activeImageIndex])
    : '';

  return (
    <div className="detalle-subasta">
      <section className="detalle-subasta__info">
        <div className="detalle-subasta__header">
          <h1>{listing.title}</h1>
          <span
            className={`detalle-subasta__badge ${
              isLive ? 'detalle-subasta__badge--live' : 'detalle-subasta__badge--ended'
            }`}
          >
            {isLive ? 'En vivo' : 'Finalizada'}
          </span>
        </div>

        <p className="detalle-subasta__meta">
          {listing.brand} {listing.model} | {listing.year}
        </p>

        <div className="detalle-subasta__timer">
          <span className="detalle-subasta__timer-label">Tiempo restante</span>
          <strong>{timeLeft || 'Sin informacion'}</strong>
        </div>

        <div className="detalle-subasta__gallery">
          {hasImages ? (
            <>
              <div className="detalle-subasta__gallery-main">
                <img src={currentImageSrc} alt={listing.title} />
              </div>
              {listing.images.length > 1 && (
                <div className="detalle-subasta__gallery-thumbs">
                  {listing.images.map((image, index) => (
                    <button
                      key={image}
                      type="button"
                      className={`detalle-subasta__thumb ${
                        index === activeImageIndex ? 'detalle-subasta__thumb--active' : ''
                      }`}
                      onClick={() => setActiveImageIndex(index)}
                    >
                      <img src={resolveImageSrc(image)} alt={`${listing.title} ${index + 1}`} />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="detalle-subasta__gallery-placeholder">
              No hay imagenes disponibles.
            </div>
          )}
        </div>

        <p className="detalle-subasta__description">{listing.description}</p>
        <p className="detalle-subasta__closing">
          Cierra el: <strong>{formatDateTime(listing.endsAt)}</strong>
        </p>
      </section>

      <section className="detalle-subasta__bids">
        <h2>Realizar oferta</h2>
        <div className="detalle-subasta__stats">
          <p>
            <span className="detalle-subasta__stats-label">Precio base:</span>{' '}
            <strong>{formatCurrency(listing.basePrice)}</strong>
          </p>
          <p>
            <span className="detalle-subasta__stats-label">Oferta mas alta:</span>{' '}
            <strong>
              {highestBidAmount ? formatCurrency(highestBidAmount) : 'Sin ofertas'}
            </strong>
          </p>
          <p>
            <span className="detalle-subasta__stats-label">Incremento minimo:</span>{' '}
            <strong>{formatCurrency(effectiveMinIncrement)}</strong>
          </p>
        </div>
        <form onSubmit={handleBidSubmit} className="detalle-subasta__form">
          <label htmlFor="bidAmount">
            Tu incremento (se suma a {formatCurrency(baseAmount)})
          </label>
          <input
            id="bidAmount"
            type="number"
            min={effectiveMinIncrement}
            step="0.01"
            value={extraAmount}
            onChange={(event) => setExtraAmount(event.target.value)}
            required
            disabled={!isLive}
          />
          <div className="detalle-subasta__quick-buttons">
            {incrementOptions.map(({ multiplier, value }) => (
              <button
                key={multiplier}
                type="button"
                onClick={() => setExtraAmount(String(value))}
                disabled={!isLive}
              >
                +{multiplier}x ({formatCurrency(value)})
              </button>
            ))}
          </div>
          <div className="detalle-subasta__total">
            <span>Total oferta:</span>
            <strong>{formatCurrency(totalOffer)}</strong>
          </div>
          <button type="submit" disabled={bidLoading || !isLive}>
            {bidLoading ? 'Enviando...' : 'Enviar oferta'}
          </button>
        </form>
        {bidError && <p className="detalle-subasta__error">{bidError}</p>}
        {!isLive && (
          <p className="detalle-subasta__ended-note">
            La subasta ya no recibe ofertas.
          </p>
        )}

        <h3>Historial de ofertas</h3>
        <ul className="detalle-subasta__bid-list">
          {sortedBids.map((bid) => (
            <li key={bid.id}>
              <strong>{formatCurrency(bid.amount)}</strong> |{' '}
              {formatDateTime(bid.createdAt)}
            </li>
          ))}
          {sortedBids.length === 0 && <li>Todavia no hay ofertas.</li>}
        </ul>
      </section>
    </div>
  );
};

export default DetalleSubasta;
