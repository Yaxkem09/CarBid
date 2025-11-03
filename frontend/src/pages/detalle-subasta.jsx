import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { connectSocket } from '../services/socket';
import './detalle-subasta.css';

const quetzalFormatter = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: 'GTQ',
  maximumFractionDigits: 0,
});

const formatCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 'Q0';
  }
  try {
    return quetzalFormatter.format(numeric);
  } catch (_error) {
    return `Q${numeric.toLocaleString('es-GT')}`;
  }
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
  const [viewerId, setViewerId] = useState(null);
  const [isLeading, setIsLeading] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const socketRef = useRef(null);
  const viewerIdRef = useRef(null);

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
        const response = await api.get(`/api/listings/${id}`);
        const listingData = response.data.listing ?? null;
        const viewer = response.data.viewer?.id;
        const viewerString = viewer !== undefined && viewer !== null ? String(viewer) : null;
        viewerIdRef.current = viewerString;
        setViewerId(viewerString);

        const normalizedListing = listingData ? { ...listingData } : null;
        const highestBidderId =
          normalizedListing?.highestBidderId !== null && normalizedListing?.highestBidderId !== undefined
            ? String(normalizedListing.highestBidderId)
            : null;

        if (normalizedListing) {
          normalizedListing.highestBidderId = highestBidderId;
          normalizedListing.isLeading =
            viewerString && highestBidderId
              ? String(highestBidderId) === viewerString
              : false;
        }

        setListing(normalizedListing);

        const normalizedBids = Array.isArray(response.data.bids)
          ? response.data.bids.map((bid) => ({
              ...bid,
              bidderId:
                bid.bidderId !== null && bid.bidderId !== undefined
                  ? String(bid.bidderId)
                  : null,
            }))
          : [];
        setBids(normalizedBids);

        setIsLeading(
          Boolean(
            viewerString &&
              highestBidderId &&
              String(highestBidderId) === viewerString,
          ),
        );
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

  const applySummaryUpdate = useCallback(
    (summary) => {
      if (!summary) {
        return;
      }

      const targetId = String(summary.auctionId ?? '');
      if (!targetId || targetId !== String(id)) {
        return;
      }

      let nextIsLeadingState = null;

      setListing((prev) => {
        if (!prev || String(prev.id) !== targetId) {
          return prev;
        }

        const next = { ...prev };
        if (summary.status) {
          next.status = summary.status;
        }
        if (summary.highestBid !== undefined) {
          next.highestBid = summary.highestBid;
        }
        if (summary.minIncrement !== undefined) {
          next.minIncrement = summary.minIncrement;
        }
        if (summary.basePrice !== undefined) {
          next.basePrice = summary.basePrice;
        }
        if (summary.endsAt) {
          next.endsAt = summary.endsAt;
        }
        if (summary.highestBidderId !== undefined) {
          const leaderId =
            summary.highestBidderId !== null && summary.highestBidderId !== undefined
              ? String(summary.highestBidderId)
              : null;
          const viewer = viewerIdRef.current;
          const viewerMatch =
            viewer && leaderId ? String(leaderId) === String(viewer) : false;
          next.highestBidderId = leaderId;
          next.isLeading = viewerMatch;
          nextIsLeadingState = viewerMatch;
        }
        return next;
      });

      if (nextIsLeadingState !== null) {
        setIsLeading(nextIsLeadingState);
      }
    },
    [id],
  );

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    viewerIdRef.current = viewerId;
  }, [viewerId]);

  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;

    const ensureSubscription = () => {
      socket.emit('subscribe-auction', id);
    };

    const handleBidCreated = (payload) => {
      if (!payload || String(payload.auctionId) !== String(id)) {
        return;
      }

      if (payload.summary) {
        applySummaryUpdate(payload.summary);
      } else if (payload.bid) {
        const viewer = viewerIdRef.current;
        if (viewer) {
          const leaderFromBid =
            payload.bid.bidderId !== null && payload.bid.bidderId !== undefined
              ? String(payload.bid.bidderId) === String(viewer)
              : false;
          setIsLeading(leaderFromBid);
        }
      }

      if (payload.bid) {
        setBids((previous) => {
          const nextBid = payload.bid;
          if (!nextBid?.id) {
            return previous;
          }

          const normalizedBid = {
            ...nextBid,
            bidderId:
              nextBid.bidderId !== null && nextBid.bidderId !== undefined
                ? String(nextBid.bidderId)
                : null,
          };

          const alreadyExists = previous.some((item) => item.id === normalizedBid.id);
          if (alreadyExists) {
            return previous.map((item) => (item.id === normalizedBid.id ? normalizedBid : item));
          }
          return [normalizedBid, ...previous];
        });
      }
    };

    const handleAuctionUpdated = (summary) => {
      if (!summary || String(summary.auctionId) !== String(id)) {
        return;
      }
      applySummaryUpdate(summary);
    };

    const handleAuctionEnded = (summary) => {
      if (!summary || String(summary.auctionId) !== String(id)) {
        return;
      }
      applySummaryUpdate(summary);
      setIsLive(false);
      setBidError('La subasta ha finalizado.');
    };

    socket.on('connect', ensureSubscription);
    socket.on('bid:created', handleBidCreated);
    socket.on('auction:updated', handleAuctionUpdated);
    socket.on('auction:ended', handleAuctionEnded);

    if (socket.connected) {
      ensureSubscription();
    }

    return () => {
      socket.off('connect', ensureSubscription);
      socket.off('bid:created', handleBidCreated);
      socket.off('auction:updated', handleAuctionUpdated);
      socket.off('auction:ended', handleAuctionEnded);
      if (socket.connected) {
        socket.emit('unsubscribe-auction', id);
      }
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [id, applySummaryUpdate]);

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

  const listingImages = Array.isArray(listing?.images) ? listing.images : [];
  const hasImages = listingImages.length > 0;
  const canNavigateImages = listingImages.length > 1;
  const safeActiveIndex = hasImages
    ? Math.min(activeImageIndex, listingImages.length - 1)
    : 0;
  const currentImageSrc = hasImages
    ? resolveImageSrc(listingImages[safeActiveIndex])
    : '';
  const primaryDescriptor = [listing?.brand, listing?.model].filter(Boolean).join(' ').trim();
  const vehicleMetaItems = [
    primaryDescriptor ? { key: 'brand-model', label: primaryDescriptor } : null,
    listing?.year ? { key: 'year', label: `A\u00f1o ${listing?.year}` } : null,
    listing?.color ? { key: 'color', label: `Color ${listing?.color}` } : null,
  ].filter((item) => item && item.label && item.label.trim().length > 0);
  const handleOpenImageModal = useCallback(() => {
    if (hasImages) {
      setIsImageModalOpen(true);
    }
  }, [hasImages]);
  const handleCloseImageModal = useCallback(() => {
    setIsImageModalOpen(false);
  }, []);
  const cycleImage = useCallback(
    (step) => {
      if (!hasImages || listingImages.length <= 1) {
        return;
      }
      const total = listingImages.length;
      setActiveImageIndex((previousIndex) => {
        const baseIndex =
          previousIndex >= 0 && previousIndex < total ? previousIndex : safeActiveIndex;
        const nextIndex = (baseIndex + step + total) % total;
        return nextIndex;
      });
    },
    [hasImages, listingImages.length, safeActiveIndex],
  );
  const handleShowNextImage = useCallback(() => {
    cycleImage(1);
  }, [cycleImage]);
  const handleShowPreviousImage = useCallback(() => {
    cycleImage(-1);
  }, [cycleImage]);

  useEffect(() => {
    if (isImageModalOpen && !currentImageSrc) {
      setIsImageModalOpen(false);
    }
  }, [currentImageSrc, isImageModalOpen]);

  useEffect(() => {
    if (!isImageModalOpen) {
      return;
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsImageModalOpen(false);
        return;
      }
      if (event.key === 'ArrowRight' && canNavigateImages) {
        event.preventDefault();
        cycleImage(1);
        return;
      }
      if (event.key === 'ArrowLeft' && canNavigateImages) {
        event.preventDefault();
        cycleImage(-1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const previousOverflow = typeof document !== 'undefined' ? document.body.style.overflow : null;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (typeof document !== 'undefined' && previousOverflow !== null) {
        document.body.style.overflow = previousOverflow;
      }
    };
  }, [canNavigateImages, cycleImage, isImageModalOpen]);

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
      await api.post(`/api/listings/${id}/bids`, { amount });
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
  const leadingBidId = sortedBids[0]?.id ?? null;
  const viewerIdString = viewerId !== null && viewerId !== undefined ? String(viewerId) : null;
  const leaderLabelTitle = listing.status === 'ended' ? 'Ganador final:' : 'Lider provisional:';
  const leaderLabelValue = (() => {
    if (!highestBidAmount) {
      return 'Sin ofertas';
    }
    if (listing.status === 'ended') {
      return isLeading ? 'Tu oferta gano' : 'Otro usuario gano';
    }
    return isLeading ? 'Tu oferta lidera' : 'Otro usuario lidera';
  })();
  return (
    <>
      <div className="detalle-subasta">
        <section className="detalle-subasta__info">
          <div className="detalle-subasta__header">
            <div className="detalle-subasta__title-block">
              <h1>{listing.title}</h1>
              {vehicleMetaItems.length > 0 && (
                <div className="detalle-subasta__meta">
                  {vehicleMetaItems.map(({ key, label }) => (
                    <span key={key} className="detalle-subasta__meta-chip">
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <span
              className={`detalle-subasta__badge ${
                isLive ? 'detalle-subasta__badge--live' : 'detalle-subasta__badge--ended'
              }`}
            >
              {isLive ? 'En vivo' : 'Finalizada'}
            </span>
          </div>

          <div className="detalle-subasta__timer">
            <span className="detalle-subasta__timer-label">Tiempo restante</span>
            <strong>{timeLeft || 'Sin informacion'}</strong>
          </div>

          <div className="detalle-subasta__gallery">
            {hasImages ? (
              <>
              <div className="detalle-subasta__gallery-main">
                {canNavigateImages && (
                  <>
                    <button
                      type="button"
                      className="detalle-subasta__gallery-nav detalle-subasta__gallery-nav--prev"
                      onClick={(event) => {
                        event.preventDefault();
                        handleShowPreviousImage();
                      }}
                      aria-label="Ver imagen anterior"
                    >
                      <span aria-hidden="true">‹</span>
                    </button>
                    <button
                      type="button"
                      className="detalle-subasta__gallery-nav detalle-subasta__gallery-nav--next"
                      onClick={(event) => {
                        event.preventDefault();
                        handleShowNextImage();
                      }}
                      aria-label="Ver imagen siguiente"
                    >
                      <span aria-hidden="true">›</span>
                    </button>
                  </>
                )}
                {currentImageSrc && (
                  <button
                    type="button"
                    className="detalle-subasta__gallery-expand"
                    onClick={handleOpenImageModal}
                      aria-label="Ampliar imagen principal"
                    >
                      Ampliar
                    </button>
                  )}
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
              <span className="detalle-subasta__stats-label">{leaderLabelTitle}</span>{' '}
              <strong>{leaderLabelValue}</strong>
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
            {sortedBids.map((bid) => {
              const isLeadingBid = bid.id === leadingBidId;
              const bidBelongsToViewer =
                viewerIdString && bid.bidderId
                  ? String(bid.bidderId) === viewerIdString
                  : false;
              const statusLabel = listing?.status === 'ended'
                ? (bidBelongsToViewer ? 'Tu oferta gano' : 'Oferta ganadora')
                : (bidBelongsToViewer ? 'Tu oferta lidera' : 'Oferta lider');

              return (
                <li
                  key={bid.id}
                  className={`detalle-subasta__bid${
                    isLeadingBid ? ' detalle-subasta__bid--leading' : ''
                  }`}
                >
                  <div>
                    <strong>{formatCurrency(bid.amount)}</strong> | {formatDateTime(bid.createdAt)}
                  </div>
                  {isLeadingBid && (
                    <span className="detalle-subasta__bid-status">
                      {statusLabel}
                    </span>
                  )}
                </li>
              );
            })}
            {sortedBids.length === 0 && <li>Todavia no hay ofertas.</li>}
          </ul>
        </section>
      </div>
      {isImageModalOpen && currentImageSrc && (
        <div
          className="detalle-subasta__lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Imagen ampliada de ${listing.title}`}
          onClick={handleCloseImageModal}
        >
          <div
            className="detalle-subasta__lightbox-content"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="detalle-subasta__lightbox-close"
              onClick={handleCloseImageModal}
              aria-label="Cerrar imagen ampliada"
            >
              <span aria-hidden="true">&times;</span>
            </button>
            {canNavigateImages && (
              <>
                <button
                  type="button"
                  className="detalle-subasta__lightbox-nav detalle-subasta__lightbox-nav--prev"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleShowPreviousImage();
                  }}
                  aria-label="Ver imagen anterior"
                >
                  <span aria-hidden="true">‹</span>
                </button>
                <button
                  type="button"
                  className="detalle-subasta__lightbox-nav detalle-subasta__lightbox-nav--next"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleShowNextImage();
                  }}
                  aria-label="Ver imagen siguiente"
                >
                  <span aria-hidden="true">›</span>
                </button>
              </>
            )}
            <img src={currentImageSrc} alt={listing.title} />
          </div>
        </div>
      )}
    </>
  );
};

export default DetalleSubasta;
