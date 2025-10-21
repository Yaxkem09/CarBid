import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
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

function PhotoGrid({ images = [] }) {
  return (
    <div className="publish-car__photo-grid">
      {[0, 1, 2, 3].map((index) => {
        const image = images[index];
        return (
          <div key={index} className="publish-car__photo-slot">
            {image ? (
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

function PreviewCard({ data }) {
  const { title, brand, model, year, basePrice, minIncrement, endsAt, description } = data;

  const price = formatCurrency(basePrice) || 'Q0.00';
  const increment = formatCurrency(minIncrement) || 'Q0.00';
  const endsAtText = formatDateTime(endsAt) || 'dd/mm/aa hh:mm';

  return (
    <aside className="publish-car__preview-card">
      <h3 className="publish-car__preview-title">Vista previa</h3>
      <div className="publish-car__preview-media">
        <span>Fotos del vehiculo</span>
      </div>
      <div className="publish-car__preview-body">
        <p className="publish-car__preview-heading">
          {title || 'Titulo de la subasta'}
        </p>
        <p className="publish-car__preview-subheading">
          {brand || 'Marca'}{' '}
          {model || 'Modelo'}{' '}
          {year ? `• ${year}` : '• Ano'}
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
    return `El ano debe estar entre 1900 y ${currentYearLimit}.`;
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) {
      setError('');
    }
  };

  const handleCancel = () => {
    navigate(-1);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = getValidationError(formData);
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = {
      title: formData.title.trim(),
      brand: formData.brand.trim(),
      model: formData.model.trim(),
      year: Number(formData.year),
      basePrice: Number(formData.basePrice),
      minIncrement: Number(formData.minIncrement),
      description: formData.description.trim(),
      endsAt: formData.endsAt,
    };

    try {
      setLoading(true);
      setError('');
      const response = await api.post('/listings', payload);
      setFormData(initialState);
      navigate(`/detalle-subasta/${response.data.id}`);
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
            <section className="publish-car__section">
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
                  <input
                    type="text"
                    name="brand"
                    value={formData.brand}
                    onChange={handleChange}
                    placeholder="Ej. Toyota"
                    className="publish-car__input"
                  />
                </Field>
                <Field label="Modelo">
                  <input
                    type="text"
                    name="model"
                    value={formData.model}
                    onChange={handleChange}
                    placeholder="Ej. Corolla"
                    className="publish-car__input"
                  />
                </Field>
                <Field label="Ano">
                  <input
                    type="number"
                    name="year"
                    min="1900"
                    max={new Date().getFullYear() + 1}
                    value={formData.year}
                    onChange={handleChange}
                    placeholder="Ej. 2022"
                    className="publish-car__input"
                  />
                </Field>
              </div>
            </section>

            <section className="publish-car__section">
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
              <Field label="Galeria" hint="Recomendado: 4 a 8 imagenes horizontales (1200x900px).">
                <div className="publish-car__upload">
                  Arrastra y suelta o <span>explora archivos</span>
                </div>
                <div className="publish-car__photo-wrapper">
                  <PhotoGrid />
                </div>
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

          <PreviewCard data={formData} />
        </div>
      </div>
    </div>
  );
};

export default PublicarCarro;
