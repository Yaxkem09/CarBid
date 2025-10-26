import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { vehicleBrands, vehicleModels, vehicleYears } from '../constants/vehicleOptions';
import './publicar-carro.css';

const initialState = {
  title: '',
  brand: '',
  model: '',
  year: '',
  basePrice: '',
  minIncrement: '',
  description: '',
  endsAt: '',
};

const MAX_PHOTOS = 4;

const currencyFormatter = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: 'GTQ',
  minimumFractionDigits: 2,
});

const formatCurrency = (value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return null;
  }
  return currencyFormatter.format(numericValue);
};

const formatDateTime = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.includes('T') ? value.replace('T', ' ') : value;
  }

  return parsed.toLocaleString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function Field({ label, children, hint }) {
  return (
    <label className="publish-car__field">
      <span className="publish-car__field-label">{label}</span>
      <div className="publish-car__field-control">{children}</div>
      {hint && <p className="publish-car__field-hint">{hint}</p>}
    </label>
  );
}

function PhotoGrid({ images = [], onRemove }) {
  return (
    <div className="publish-car__photo-grid">
      {[0, 1, 2, 3].map((index) => {
        const image = images[index];
        const isFilled = Boolean(image);
        const slotProps =
          isFilled && typeof onRemove === 'function'
            ? {
                role: 'button',
                tabIndex: 0,
                onClick: () => onRemove(index),
                onKeyDown: (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onRemove(index);
                  }
                },
                title: 'Haz clic o presiona Enter para eliminar esta foto',
              }
            : {};

        return (
          <div key={index} className="publish-car__photo-slot" {...slotProps}>
            {isFilled ? (
              <img src={image} alt={`foto-${index}`} />
            ) : (
              <span>+ Foto {index + 1}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PreviewCard({ data, photos = [] }) {
  const { title, brand, model, year, basePrice, minIncrement, endsAt, description } = data;

  const price = formatCurrency(basePrice) || 'Q0.00';
  const increment = formatCurrency(minIncrement) || 'Q0.00';
  const endsAtText = formatDateTime(endsAt) || 'dd/mm/aa hh:mm';
  const coverPhoto = photos[0] ?? null;

  return (
    <aside className="publish-car__preview-card">
      <h3 className="publish-car__preview-title">Vista previa</h3>
      <div className="publish-car__preview-media">
        {coverPhoto ? (
          <img src={coverPhoto} alt="Vista previa del vehiculo" />
        ) : (
          <span>Fotos del vehiculo</span>
        )}
      </div>
      <div className="publish-car__preview-body">
        <p className="publish-car__preview-heading">
          {title || 'Titulo de la subasta'}
        </p>
        <p className="publish-car__preview-subheading">
          {brand || 'Marca'}{' '}
          {model || 'Modelo'}{' '}
          {year ? ` - ${year}` : '- Año'}
        </p>
        <p className="publish-car__preview-meta">Precio base: <strong>{price}</strong></p>
        <p className="publish-car__preview-meta">Incremento minimo: <strong>{increment}</strong></p>
        <p className="publish-car__preview-meta">Cierre: {endsAtText}</p>
        {description && (
          <p className="publish-car__preview-note">{description}</p>
        )}
      </div>
      <button type="button" className="publish-car__preview-button">
        Simular publicacion
      </button>
    </aside>
  );
}

const getValidationError = (data) => {
  const { title, brand, model, year, basePrice, minIncrement, endsAt } = data;

  if (!title.trim()) {
    return 'Agrega un titulo descriptivo para la subasta.';
  }
  if (!brand.trim() || !model.trim()) {
    return 'Completa la marca y el modelo del vehiculo.';
  }
  const yearNumber = Number(year);
  const currentYearLimit = new Date().getFullYear() + 1;
  if (!Number.isInteger(yearNumber) || yearNumber < 1900 || yearNumber > currentYearLimit) {
    return `El año debe estar entre 1900 y ${currentYearLimit}.`;
  }
  const basePriceNumber = Number(basePrice);
  if (!Number.isFinite(basePriceNumber) || basePriceNumber <= 0) {
    return 'El precio base debe ser un numero mayor a 0.';
  }
  const minIncrementNumber = Number(minIncrement);
  if (!Number.isFinite(minIncrementNumber) || minIncrementNumber <= 0) {
    return 'El incremento minimo debe ser un numero mayor a 0.';
  }
  if (!endsAt) {
    return 'Selecciona la fecha y hora de cierre.';
  }
  const endsAtDate = new Date(endsAt);
  if (Number.isNaN(endsAtDate.getTime())) {
    return 'Define una fecha de cierre valida.';
  }
  if (endsAtDate <= new Date()) {
    return 'La subasta debe cerrar en una fecha futura.';
  }

  return '';
};

const PublicarCarro = () => {
  const [formData, setFormData] = useState(initialState);
  const [photos, setPhotos] = useState([]);
  const photosRef = useRef([]);
  const fileInputRef = useRef(null);
  const [error, setError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const brandSelectValue = useMemo(
    () => (vehicleBrands.includes(formData.brand) ? formData.brand : ''),
    [formData.brand],
  );

  const modelSelectValue = useMemo(
    () => (vehicleModels.includes(formData.model) ? formData.model : ''),
    [formData.model],
  );

  const yearSelectValue = useMemo(() => {
    if (!formData.year) {
      return '';
    }
    const stringYear = String(formData.year);
    return vehicleYears.some((yearOption) => String(yearOption) === stringYear) ? stringYear : '';
  }, [formData.year]);

  const updatePhotos = (updater) => {
    setPhotos((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const nextIds = new Set(next.map((photo) => photo.id));

      prev.forEach((photo) => {
        if (!nextIds.has(photo.id)) {
          URL.revokeObjectURL(photo.preview);
        }
      });

      photosRef.current = next;
      return next;
    });
  };

  useEffect(
    () => () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview));
    },
    [],
  );

  const ingestFiles = (files) => {
    if (!files?.length) {
      return false;
    }

    const accepted = [];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        return;
      }

      const id = `${file.name}-${file.lastModified}-${file.size}-${Math.random().toString(36).slice(2)}`;
      const preview = URL.createObjectURL(file);
      accepted.push({ id, file, preview });
    });

    if (!accepted.length) {
      return false;
    }

    let added = false;
    updatePhotos((prev) => {
      const availableSlots = Math.max(0, MAX_PHOTOS - prev.length);
      if (!availableSlots) {
        return prev;
      }
      const next = [...prev, ...accepted.slice(0, availableSlots)];
      added = next.length > prev.length;
      return next;
    });
    return added;
  };

  const handlePhotoInputChange = (event) => {
    const { files } = event.target;
    const success = ingestFiles(files);
    if (!success) {
      const message =
        photosRef.current.length >= MAX_PHOTOS
          ? `Limite de ${MAX_PHOTOS} fotos alcanzado.`
          : 'Selecciona archivos de imagen validos (JPG, PNG, WebP...).';
      setPhotoError(message);
    } else {
      setPhotoError('');
    }
    event.target.value = '';
  };

  const handlePhotoDrop = (event) => {
    event.preventDefault();
    const success = ingestFiles(event.dataTransfer?.files);
    if (!success) {
      const message =
        photosRef.current.length >= MAX_PHOTOS
          ? `Limite de ${MAX_PHOTOS} fotos alcanzado.`
          : 'Selecciona archivos de imagen validos (JPG, PNG, WebP...).';
      setPhotoError(message);
    } else {
      setPhotoError('');
    }
  };

  const handlePhotoDragOver = (event) => {
    event.preventDefault();
  };

  const handlePhotoRemove = (index) => {
    updatePhotos((prev) => {
      if (!prev[index]) {
        return prev;
      }
      return prev.filter((_, idx) => idx !== index);
    });
    setPhotoError('');
  };

  const handleUploadAreaClick = () => {
    fileInputRef.current?.click();
  };

  const handleUploadAreaKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) {
      setError('');
    }
  };

  const handleCancel = () => {
    updatePhotos([]);
    setPhotoError('');
    navigate(-1);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = getValidationError(formData);
    if (validationError) {
      setError(validationError);
      return;
    }

    const sanitizedTitle = formData.title.trim();
    const sanitizedBrand = formData.brand.trim();
    const sanitizedModel = formData.model.trim();
    const sanitizedDescription = formData.description.trim();
    const sanitizedEndsAt = formData.endsAt;
    const sanitizedYear = Number(formData.year);
    const sanitizedBasePrice = Number(formData.basePrice);
    const sanitizedMinIncrement = Number(formData.minIncrement);

    const formPayload = new FormData();
    formPayload.append('title', sanitizedTitle);
    formPayload.append('brand', sanitizedBrand);
    formPayload.append('model', sanitizedModel);
    formPayload.append('year', String(sanitizedYear));
    formPayload.append('basePrice', String(sanitizedBasePrice));
    formPayload.append('minIncrement', String(sanitizedMinIncrement));
    formPayload.append('description', sanitizedDescription);
    formPayload.append('endsAt', sanitizedEndsAt);
    photos.forEach((photo) => {
      if (photo?.file) {
        formPayload.append('images', photo.file);
      }
    });

    try {
      setLoading(true);
      setError('');
      const response = await api.post('/listings', formPayload);
      setFormData(initialState);
      updatePhotos([]);
      setPhotoError('');
      const listingId = response.data?.id;
      if (listingId) {
        navigate(`/detalle-subasta/${listingId}`);
      } else {
        navigate('/inicio');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo publicar el vehiculo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="publish-car">
      <div className="publish-car__content">
        <header className="publish-car__header">
          <h1>Publicar vehiculo</h1>
          <p>Define los detalles claves para que tu subasta destaque.</p>
        </header>

        <div className="publish-car__layout">
          <form className="publish-car__form-card" onSubmit={handleSubmit}>
            <section className="publish-car__section publish-car__section--vehicle">
              <h2 className="publish-car__section-title">Datos del vehiculo</h2>
              <Field label="Titulo de la subasta" hint="Visible para los compradores en la lista de subastas.">
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="Ej. SUV familiar en excelente estado"
                  className="publish-car__input"
                />
              </Field>
              <div className="publish-car__grid publish-car__grid--three">
                <Field label="Marca">
                  <select
                    name="brand"
                    value={brandSelectValue}
                    onChange={handleChange}
                    className="publish-car__select"
                  >
                    <option value="">Selecciona una marca</option>
                    {vehicleBrands.map((brand) => (
                      <option key={brand} value={brand}>
                        {brand}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    name="brand"
                    value={formData.brand}
                    onChange={handleChange}
                    placeholder="O escribe una marca personalizada"
                    className="publish-car__input publish-car__input--secondary"
                  />
                </Field>
                <Field label="Modelo">
                  <select
                    name="model"
                    value={modelSelectValue}
                    onChange={handleChange}
                    className="publish-car__select"
                  >
                    <option value="">Selecciona un modelo</option>
                    {vehicleModels.map((modelName) => (
                      <option key={modelName} value={modelName}>
                        {modelName}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    name="model"
                    value={formData.model}
                    onChange={handleChange}
                    placeholder="O escribe un modelo personalizado"
                    className="publish-car__input publish-car__input--secondary"
                  />
                </Field>
                <Field label="Año">
                  <select
                    name="year"
                    value={yearSelectValue}
                    onChange={handleChange}
                    className="publish-car__select"
                  >
                    <option value="">Selecciona un año</option>
                    {vehicleYears.map((yearOption) => (
                      <option key={yearOption} value={String(yearOption)}>
                        {yearOption}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    name="year"
                    min="1900"
                    max={new Date().getFullYear() + 1}
                    value={formData.year}
                    onChange={handleChange}
                    placeholder="O escribe manualmente"
                    className="publish-car__input publish-car__input--secondary"
                  />
                </Field>
              </div>
            </section>

            <section className="publish-car__section publish-car__section--auction">
              <h2 className="publish-car__section-title">Parametros de subasta</h2>
              <div className="publish-car__grid publish-car__grid--three">
                <Field label="Precio base (Q)">
                  <input
                    type="number"
                    name="basePrice"
                    min="0.01"
                    step="0.01"
                    value={formData.basePrice}
                    onChange={handleChange}
                    placeholder="Ej. 45000"
                    className="publish-car__input"
                  />
                </Field>
                <Field label="Incremento minimo (Q)">
                  <input
                    type="number"
                    name="minIncrement"
                    min="0.01"
                    step="0.01"
                    value={formData.minIncrement}
                    onChange={handleChange}
                    placeholder="Ej. 500"
                    className="publish-car__input"
                  />
                </Field>
                <Field label="Fecha y hora de cierre">
                  <input
                    type="datetime-local"
                    name="endsAt"
                    value={formData.endsAt}
                    onChange={handleChange}
                    className="publish-car__input"
                  />
                </Field>
              </div>
            </section>

            <section className="publish-car__section">
              <h2 className="publish-car__section-title">Fotos del vehiculo</h2>
              <Field label="Galeria" hint="Recomendado: hasta 4 imagenes horizontales (1200x900px).">
                <div
                  className="publish-car__upload"
                  role="button"
                  tabIndex={0}
                  onClick={handleUploadAreaClick}
                  onKeyDown={handleUploadAreaKeyDown}
                  onDrop={handlePhotoDrop}
                  onDragOver={handlePhotoDragOver}
                  aria-label="Subir fotos del vehiculo"
                >
                  {photos.length >= MAX_PHOTOS ? (
                    <>Limite de {MAX_PHOTOS} fotos alcanzado. Haz clic en una foto para eliminarla.</>
                  ) : (
                    <>
                      Arrastra y suelta o <span>explora archivos</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    ref={fileInputRef}
                    onChange={handlePhotoInputChange}
                    hidden
                  />
                </div>
                <div className="publish-car__photo-wrapper">
                  <PhotoGrid images={photos.map((photo) => photo.preview)} onRemove={handlePhotoRemove} />
                </div>
                {photoError && <p className="publish-car__error">{photoError}</p>}
              </Field>
            </section>

            <section className="publish-car__section">
              <h2 className="publish-car__section-title">Descripcion</h2>
              <Field label="Detalles adicionales" hint="Comparte mantenimientos, golpes, extras o cualquier informacion relevante.">
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Ej. Servicios al dia, segundo propietario, incluye accesorios originales..."
                  className="publish-car__textarea"
                />
              </Field>
            </section>

            {error && <p className="publish-car__error">{error}</p>}

            <div className="publish-car__actions">
              <button
                type="button"
                className="publish-car__button publish-car__button--ghost"
                onClick={handleCancel}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="publish-car__button publish-car__button--primary"
                disabled={loading}
              >
                {loading ? 'Publicando...' : 'Publicar'}
              </button>
            </div>
          </form>

          <PreviewCard data={formData} photos={photos.map((photo) => photo.preview)} />
        </div>
      </div>
    </div>
  );
};

export default PublicarCarro;
