import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useVehicleOptions } from '../hooks/useVehicleOptions';
import {
  vehicleColors,
  vehicleYears,
  priceRange,
} from '../constants/vehicleOptions';
import { connectSocket } from '../services/socket';
import './inicio.css';

const Inicio = () => {
  const [listings, setListings] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    brand: '',
    model: '',
    color: '',
    year: '',
    minPrice: priceRange.min,
    maxPrice: priceRange.max,
  });
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchPerformed, setSearchPerformed] = useState(false);
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const { brands: brandOptions, models: modelOptions } = useVehicleOptions();

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('es-GT', {
        style: 'currency',
        currency: 'GTQ',
        maximumFractionDigits: 0,
      }),
    [],
  );

  const sortedColors = useMemo(
    () => [...vehicleColors].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
    [],
  );

  const assetBaseUrl = useMemo(() => {
    const base = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    return base.replace(/\/api\/?$/, '');
  }, []);

  const buildImageUrl = (imagePath) => {
    if (!imagePath) {
      return null;
    }

    if (/^https?:\/\//i.test(imagePath)) {
      return imagePath;
    }

    const normalizedBase = assetBaseUrl.replace(/\/$/, '');
    const normalizedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
    return `${normalizedBase}${normalizedPath}`;
  };

  const sortRecommendations = useCallback((collection) => {
    if (!Array.isArray(collection)) {
      return [];
    }

    return [...collection]
      .sort((a, b) => {
        const highestA = Number(a.highestBid ?? a.basePrice ?? 0);
        const highestB = Number(b.highestBid ?? b.basePrice ?? 0);
        if (highestA !== highestB) {
          return highestB - highestA;
        }

        const endsA = a.endsAt ? new Date(a.endsAt).getTime() : Number.POSITIVE_INFINITY;
        const endsB = b.endsAt ? new Date(b.endsAt).getTime() : Number.POSITIVE_INFINITY;
        return endsA - endsB;
      })
      .slice(0, 5);
  }, []);

  const applySummaryToCollections = useCallback(
    (summary) => {
      if (!summary || !summary.auctionId) {
        return;
      }

      const targetId = String(summary.auctionId);
      const shouldRemove = summary.status === 'ended';

      const updateCollection = (collection) => {
        if (!Array.isArray(collection) || !collection.length) {
          return collection;
        }

        if (shouldRemove) {
          const filtered = collection.filter((item) => String(item.id) !== targetId);
          return filtered.length === collection.length ? collection : filtered;
        }

        let changed = false;
        const updated = collection.map((item) => {
          if (String(item.id) !== targetId) {
            return item;
          }
          changed = true;
          return {
            ...item,
            status: summary.status ?? item.status,
            highestBid:
              summary.highestBid !== undefined ? summary.highestBid : item.highestBid,
            endsAt: summary.endsAt ?? item.endsAt,
            highestBidderId:
              summary.highestBidderId !== undefined
                ? summary.highestBidderId
                : item.highestBidderId,
          };
        });
        return changed ? updated : collection;
      };

      setListings((previous) => updateCollection(previous));
      setSearchResults((previous) => updateCollection(previous));
      setRecommended((previous) => {
        const updated = updateCollection(previous);
        if (updated === previous) {
          return previous;
        }
        return sortRecommendations(updated);
      });
    },
    [sortRecommendations],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);

    Promise.all([
      api.get('/api/listings', { params: { status: 'active' } }),
      api.get('/api/listings', { params: { status: 'active', sort: 'highestBid' } }),
    ])
      .then(([activeResponse, recommendedResponse]) => {
        if (!alive) return;

        const activeListings = activeResponse.data ?? [];
        const recommendationCandidates = recommendedResponse.data ?? [];
        const sortedRecommendations = sortRecommendations(recommendationCandidates);

        setListings(activeListings);
        setRecommended(sortedRecommendations);
        setError('');
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.response?.data?.message || 'No se pudieron cargar las subastas');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [sortRecommendations]);

  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;

    const subscribe = () => {
      socket.emit('subscribe-listings');
    };

    const handleSummary = (summary) => {
      applySummaryToCollections(summary);
    };

    socket.on('connect', subscribe);
    socket.on('auction:updated', handleSummary);
    socket.on('auction:ended', handleSummary);

    if (socket.connected) {
      subscribe();
    }

    return () => {
      socket.off('connect', subscribe);
      socket.off('auction:updated', handleSummary);
      socket.off('auction:ended', handleSummary);
      if (socket.connected) {
        socket.emit('unsubscribe-listings');
      }
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [applySummaryToCollections]);

  const handleViewDetails = (id) => navigate(`/detalle-subasta/${id}`);
  const handlePublish = () => navigate('/publicar-carro');
  const handleHistory = () => navigate('/historial');

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handlePriceChange = (event) => {
    const { name, value } = event.target;
    const numericValue = Number(value);

    setFilters((prev) => {
      if (name === 'minPrice') {
        const nextMin = Math.min(numericValue, prev.maxPrice);
        return { ...prev, minPrice: nextMin };
      }

      if (name === 'maxPrice') {
        const nextMax = Math.max(numericValue, prev.minPrice);
        return { ...prev, maxPrice: nextMax };
      }

      return prev;
    });
  };

  const handleFilterSubmit = (event) => {
    event.preventDefault();
    setSearching(true);
    setSearchError('');
    setSearchPerformed(true);

    const params = { status: 'active' };
    const brandValue = filters.brand.trim();
    const modelValue = filters.model.trim();
    const colorValue = filters.color.trim();
    const yearValue = Number.parseInt(filters.year, 10);
    const minPriceValue = Number(filters.minPrice);
    const maxPriceValue = Number(filters.maxPrice);

    if (brandValue) params.brand = brandValue.toLowerCase();
    if (modelValue) params.model = modelValue.toLowerCase();
    if (colorValue) params.color = colorValue.toLowerCase();
    if (!Number.isNaN(yearValue)) params.year = yearValue;
    if (Number.isFinite(minPriceValue) && minPriceValue > priceRange.min) {
      params.minPrice = minPriceValue;
    }
    if (Number.isFinite(maxPriceValue) && maxPriceValue < priceRange.max) {
      params.maxPrice = maxPriceValue;
    }

    api
      .get('/api/listings', { params })
      .then((response) => {
        setSearchResults(response.data ?? []);
      })
      .catch((err) => {
        setSearchError(err.response?.data?.message || 'No se pudieron filtrar las subastas');
        setSearchResults([]);
      })
      .finally(() => setSearching(false));
  };

  return (
    <div className="inicio-page">
      {/* Recomendadas arriba */}
      <section className="inicio-recommended" aria-labelledby="inicio-recommended-title">
        <div className="inicio-recommended__header">
          <h2 id="inicio-recommended-title">Recomendaciones</h2>
          <p>Subastas destacadas por sus pujas altas y cierres próximos.</p>
        </div>

        {error ? (
          <p className="inicio-recommended__message">{error}</p>
        ) : loading ? (
          <p className="inicio-recommended__message">Cargando recomendaciones...</p>
        ) : recommended.length ? (
          <div className="inicio-recommended__list">
            {recommended.map((listing) => {
              const initials = (listing.brand || listing.title || '?').slice(0, 1).toUpperCase();
              const highestBid = listing.highestBid ?? listing.basePrice;
              const descriptorParts = [
                [listing.brand, listing.model].filter(Boolean).join(' ').trim(),
                listing.year,
                listing.color,
              ].filter(Boolean);
              const descriptor = descriptorParts.join(' · ');
              const kilometrajeNumber = Number(listing.kilometraje);
              const kilometrajeLabel = Number.isFinite(kilometrajeNumber)
                ? `${kilometrajeNumber.toLocaleString('es-GT')} km`
                : null;
              const imageSrc = buildImageUrl(listing.images?.[0]);

              return (
                <article key={`recommended-${listing.id}`} className="inicio-recommended-card">
                  <div className="inicio-recommended-card__image" aria-hidden={!imageSrc}>
                    {imageSrc ? (
                      <img src={imageSrc} alt={`Imagen de ${descriptor || listing.title}`} loading="lazy" />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>
                  <div className="inicio-recommended-card__content">
                    <h3>{listing.title}</h3>
                    <p>{descriptor || 'Subasta destacada'}</p>
                    {kilometrajeLabel && (
                      <p className="inicio-recommended-card__meta">
                        Kilometraje: {kilometrajeLabel}
                      </p>
                    )}
                    <p className="inicio-recommended-card__meta">
                      Oferta más alta: {currencyFormatter.format(highestBid)}
                    </p>
                    <button type="button" onClick={() => handleViewDetails(listing.id)}>
                      Ver detalles
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="inicio-recommended__message">No encontramos subastas recomendadas por ahora.</p>
        )}
      </section>
      {/* Filtros + resultados */}
      <div className="inicio-page__content">
        <aside className="inicio-page__filters">
          <h2>Filtrar subastas</h2>
          <form onSubmit={handleFilterSubmit} className="inicio-page__form">
            <label className="inicio-page__field">
              <span>Marca</span>
              <div className="inicio-select-wrapper">
                <select
                  name="brand"
                  value={filters.brand}
                  onChange={handleFilterChange}
                  className="inicio-select"
                >
                  <option value="">Todas las marcas</option>
                  {brandOptions.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="inicio-page__field">
              <span>Modelo</span>
              <div className="inicio-select-wrapper">
                <select
                  name="model"
                  value={filters.model}
                  onChange={handleFilterChange}
                  className="inicio-select"
                >
                  <option value="">Todos los modelos</option>
                  {modelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="inicio-page__field">
              <span>Color</span>
              <div className="inicio-select-wrapper">
                <select
                  name="color"
                  value={filters.color}
                  onChange={handleFilterChange}
                  className="inicio-select"
                >
                  <option value="">Cualquier color</option>
                  {sortedColors.map((colorOption) => (
                    <option key={colorOption} value={colorOption}>
                      {colorOption}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="inicio-page__field">
              <span>Año</span>
              <div className="inicio-select-wrapper">
                <select
                  name="year"
                  value={filters.year}
                  onChange={handleFilterChange}
                  className="inicio-select"
                >
                  <option value="">Cualquier año</option>
                  {vehicleYears.map((yearOption) => (
                    <option key={yearOption} value={String(yearOption)}>
                      {yearOption}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <fieldset className="inicio-page__field inicio-page__range">
              <legend>Rango de precio</legend>
              <div className="inicio-page__range-inputs" role="group" aria-label="Rango de precio">
                <label>
                  <span>Mínimo</span>
                  <input
                    type="range"
                    name="minPrice"
                    min={priceRange.min}
                    max={priceRange.max}
                    step={priceRange.step}
                    value={filters.minPrice}
                    onChange={handlePriceChange}
                    aria-label="Precio mínimo"
                  />
                </label>
                <label>
                  <span>Máximo</span>
                  <input
                    type="range"
                    name="maxPrice"
                    min={priceRange.min}
                    max={priceRange.max}
                    step={priceRange.step}
                    value={filters.maxPrice}
                    onChange={handlePriceChange}
                    aria-label="Precio máximo"
                  />
                </label>
              </div>
              <div className="inicio-page__range-labels">
                <span>{currencyFormatter.format(filters.minPrice)}</span>
                <span>{currencyFormatter.format(filters.maxPrice)}</span>
              </div>
            </fieldset>

            <button type="submit" className="inicio-page__submit" disabled={searching}>
              {searching ? 'Buscando...' : 'Aplicar filtros'}
            </button>

            {searchError && <p className="inicio-page__error">{searchError}</p>}
          </form>
        </aside>

        <section className="inicio-page__results">
          <h1>Subastas activas</h1>

          <div className="inicio-page__section">
            <h2>Resultados de búsqueda</h2>
            {searching && <p>Buscando subastas...</p>}
            {!searching && searchError && <p className="inicio-page__error">{searchError}</p>}
            {!searching && searchPerformed && searchResults.length === 0 && !searchError && (
              <p>No encontramos subastas que coincidan con tu búsqueda.</p>
            )}
            {!searching && !searchError && searchResults.length > 0 && (
              <div className="inicio-page__grid">
                {searchResults.map((listing) => {
                  const imageSrc = buildImageUrl(listing.images?.[0]);
                  const listingLabel = [listing.brand, listing.model].filter(Boolean).join(' ') || listing.title;
                  const descriptorParts = [
                    [listing.brand, listing.model].filter(Boolean).join(' ').trim(),
                    listing.year,
                    listing.color,
                  ].filter(Boolean);
                  const descriptor = descriptorParts.join(' · ');
                  const kilometrajeNumber = Number(listing.kilometraje);
                  const kilometrajeLabel = Number.isFinite(kilometrajeNumber)
                    ? `${kilometrajeNumber.toLocaleString('es-GT')} km`
                    : null;

                  return (
                    <article key={listing.id} className="inicio-card">
                      <div className="inicio-card__image" aria-hidden={!imageSrc}>
                        {imageSrc ? (
                          <img src={imageSrc} alt={`Imagen de ${listingLabel}`} loading="lazy" />
                        ) : (
                          <span>{(listing.brand || listing.title || '?').slice(0, 1).toUpperCase()}</span>
                        )}
                      </div>
                      <h3>{listing.title}</h3>
                      <p>{descriptor || listingLabel}</p>
                      {kilometrajeLabel && (
                        <p>
                          Kilometraje: {kilometrajeLabel}
                        </p>
                      )}
                      <p>Precio base: {currencyFormatter.format(listing.basePrice)}</p>
                      <p>Oferta más alta: {currencyFormatter.format(listing.highestBid ?? listing.basePrice)}</p>
                      <button type="button" onClick={() => handleViewDetails(listing.id)}>
                        Ver detalles
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
            {!searchPerformed && <p>Utiliza los filtros para encontrar tu próximo vehículo.</p>}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Inicio;



