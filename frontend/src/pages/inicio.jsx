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

const RESULTS_PER_PAGE = 4;
const CARD_MEDIA_ASPECT_RATIO = 16 / 15;
const CARD_MEDIA_FIT_THRESHOLD = 0.35;

const ResponsiveCardMedia = ({ src, alt, fallbackLabel }) => {
  const [fitMode, setFitMode] = useState('cover');
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setFitMode('cover');
    setHasError(false);
  }, [src]);

  const handleImageLoad = useCallback((event) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (!naturalWidth || !naturalHeight) {
      setFitMode('contain');
      return;
    }

    const ratio = naturalWidth / naturalHeight;
    if (!Number.isFinite(ratio)) {
      setFitMode('contain');
      return;
    }

    const ratioDelta = Math.abs(ratio - CARD_MEDIA_ASPECT_RATIO) / CARD_MEDIA_ASPECT_RATIO;
    setFitMode(ratioDelta > CARD_MEDIA_FIT_THRESHOLD ? 'contain' : 'cover');
  }, []);

  const handleImageError = useCallback(() => {
    setHasError(true);
  }, []);

  if (!src || hasError) {
    return (
      <div className="inicio-card__media" aria-hidden="true">
        <span aria-hidden="true">{fallbackLabel ?? '?'}</span>
      </div>
    );
  }

  return (
    <div className={`inicio-card__media ${fitMode === 'contain' ? 'inicio-card__media--contain' : ''}`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="inicio-card__media-img"
        onLoad={handleImageLoad}
        onError={handleImageError}
      />
    </div>
  );
};

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
  const [searchPage, setSearchPage] = useState(1);
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
      .slice(0, 3);
  }, []);

  const totalSearchPages = useMemo(() => {
    if (!searchResults.length) {
      return 1;
    }
    return Math.ceil(searchResults.length / RESULTS_PER_PAGE);
  }, [searchResults.length]);

  const paginatedSearchResults = useMemo(() => {
    const start = (searchPage - 1) * RESULTS_PER_PAGE;
    return searchResults.slice(start, start + RESULTS_PER_PAGE);
  }, [searchResults, searchPage]);

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
        setSearchPage(1);
      })
      .catch((err) => {
        setSearchError(err.response?.data?.message || 'No se pudieron filtrar las subastas');
        setSearchResults([]);
        setSearchPage(1);
      })
      .finally(() => setSearching(false));
  };

  useEffect(() => {
    if (!searchResults.length) {
      setSearchPage(1);
      return;
    }

    const maxPage = Math.max(1, Math.ceil(searchResults.length / RESULTS_PER_PAGE));
    setSearchPage((prev) => (prev > maxPage ? maxPage : prev));
  }, [searchResults.length]);

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
              const brandModel = [listing.brand, listing.model].filter(Boolean).join(' ').trim();
              const subtitleParts = [
                brandModel || null,
                listing.year ? String(listing.year) : null,
              ].filter(Boolean);
              const subtitle = subtitleParts.join(' | ');
              const cardTitle = listing.title || brandModel || 'Subasta recomendada';
              const imageSrc = buildImageUrl(listing.images?.[0]);

              return (
                <article key={`recommended-${listing.id}`} className="inicio-card inicio-card--featured">
                  <ResponsiveCardMedia
                    src={imageSrc}
                    alt={`Imagen de ${cardTitle}`}
                    fallbackLabel={initials}
                  />
                  <div className="inicio-card__body">
                    <h3 className="inicio-card__title">{cardTitle}</h3>
                    {subtitle && <p className="inicio-card__subtitle">{subtitle}</p>}
                    <button
                      type="button"
                      className="inicio-card__cta"
                      onClick={() => handleViewDetails(listing.id)}
                    >
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
              <>
                <div className="inicio-page__grid">
                  {paginatedSearchResults.map((listing) => {
                    const imageSrc = buildImageUrl(listing.images?.[0]);
                    const listingLabel = [listing.brand, listing.model].filter(Boolean).join(' ') || listing.title;
                    const kilometrajeNumber = Number(listing.kilometraje);
                    const kilometrajeLabel = Number.isFinite(kilometrajeNumber)
                      ? `${kilometrajeNumber.toLocaleString('es-GT')} km`
                      : null;
                    const brandModel = [listing.brand, listing.model].filter(Boolean).join(' ').trim();
                    const subtitleParts = [
                      brandModel || null,
                      listing.year ? String(listing.year) : null,
                    ].filter(Boolean);
                    const subtitle = subtitleParts.join(' | ');
                    const initials = (listing.brand || listing.title || '?').slice(0, 1).toUpperCase();

                    return (
                    <article key={listing.id} className="inicio-card inicio-card--detailed">
                      <ResponsiveCardMedia
                        src={imageSrc}
                        alt={`Imagen de ${listingLabel}`}
                        fallbackLabel={initials}
                      />
                        <div className="inicio-card__body">
                          <div className="inicio-card__header">
                            <h3 className="inicio-card__title">{listing.title}</h3>
                            <p className="inicio-card__subtitle">{subtitle || listingLabel}</p>
                          </div>
                          <div className="inicio-card__stats">
                            <div className="inicio-card__stat">
                              <span className="inicio-card__stat-label">Precio base</span>
                              <span className="inicio-card__stat-value">
                                {currencyFormatter.format(listing.basePrice)}
                              </span>
                            </div>
                            <div className="inicio-card__stat">
                              <span className="inicio-card__stat-label">Oferta mas alta</span>
                              <span className="inicio-card__stat-value">
                                {currencyFormatter.format(listing.highestBid ?? listing.basePrice)}
                              </span>
                            </div>
                            {kilometrajeLabel && (
                              <div className="inicio-card__stat">
                                <span className="inicio-card__stat-label">Kilometraje</span>
                                <span className="inicio-card__stat-value">{kilometrajeLabel}</span>
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            className="inicio-card__cta"
                            onClick={() => handleViewDetails(listing.id)}
                          >
                            Ver detalles
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {searchResults.length > RESULTS_PER_PAGE && (
                  <div className="inicio-pagination" role="navigation" aria-label="Paginacion de resultados">
                    <button
                      type="button"
                      className="inicio-pagination__button"
                      onClick={() => setSearchPage((prev) => Math.max(1, prev - 1))}
                      disabled={searchPage === 1}
                    >
                      Anterior
                    </button>
                    <span className="inicio-pagination__status">
                      Pagina {searchPage} de {totalSearchPages}
                    </span>
                    <button
                      type="button"
                      className="inicio-pagination__button"
                      onClick={() => setSearchPage((prev) => Math.min(totalSearchPages, prev + 1))}
                      disabled={searchPage === totalSearchPages}
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </>
            )}
            {!searchPerformed && <p>Utiliza los filtros para encontrar tu próximo vehículo.</p>}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Inicio;



