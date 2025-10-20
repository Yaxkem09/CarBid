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

const steps = [
  { title: 'Datos básicos' },
  { title: 'Fotos' },
  { title: 'Parámetros de subasta' },
  { title: 'Descripción' },
];

const PublicarCarro = () => {
  const [formData, setFormData] = useState(initialState);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateStep = (stepIndex) => {
    setError('');
    switch (stepIndex) {
      case 0: {
        const { title, brand, model, year } = formData;
        if (!title || !brand || !model || !year) {
          setError('Completa los datos básicos del vehículo.');
          return false;
        }
        const yearNum = Number(year);
        const maxYear = new Date().getFullYear() + 1;
        if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > maxYear) {
          setError(`El año debe estar entre 1900 y ${maxYear}.`);
          return false;
        }
        return true;
      }
      case 1:
        // Aún no subes fotos, no validamos.
        return true;
      case 2: {
        const { basePrice, minIncrement, endsAt } = formData;
        if (!basePrice || Number(basePrice) <= 0) {
          setError('Define un precio base mayor a 0.');
          return false;
        }
        if (!minIncrement || Number(minIncrement) <= 0) {
          setError('Define un incremento mínimo mayor a 0.');
          return false;
        }
        if (!endsAt) {
          setError('Indica la fecha y hora de cierre de la subasta.');
          return false;
        }
        if (new Date(endsAt) <= new Date()) {
          setError('La subasta debe cerrar en una fecha futura.');
          return false;
        }
        return true;
      }
      case 3:
        // Descripción opcional
        return true;
      default:
        return false;
    }
  };

  const handlePrevious = () => {
    setError('');
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleNextOrSubmit = async (e) => {
    e.preventDefault();

    // Valida el paso actual
    if (!validateStep(currentStep)) return;

    const isLastStep = currentStep === steps.length - 1;

    if (!isLastStep) {
      setError('');
      setCurrentStep((prev) => prev + 1);
      return;
    }

    // Enviar al backend en el último paso
    const { title, brand, model, year, basePrice, minIncrement, description, endsAt } = formData;

    try {
      setLoading(true);
      setError('');
      const payload = {
        title: title.trim(),
        brand: brand.trim(),
        model: model.trim(),
        year: Number(year),
        basePrice: Number(basePrice),
        minIncrement: Number(minIncrement),
        description: description?.trim() || '',
        endsAt, // viene de <input type="datetime-local">, suele ser aceptado por el backend tal cual
      };

      const response = await api.post('/listings', payload);

      setFormData(initialState);
      setCurrentStep(0);
      navigate(`/detalle-subasta/${response.data.id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo publicar el vehículo');
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="publicar-carro__fields">
            <label>
              Título
              <input
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
              />
            </label>
            <label>
              Marca
              <input
                name="brand"
                value={formData.brand}
                onChange={handleChange}
                required
              />
            </label>
            <label>
              Modelo
              <input
                name="model"
                value={formData.model}
                onChange={handleChange}
                required
              />
            </label>
            <label>
              Año
              <input
                type="number"
                name="year"
                min="1900"
                max={new Date().getFullYear() + 1}
                value={formData.year}
                onChange={handleChange}
                required
              />
            </label>
          </div>
        );
      case 1:
        return (
          <div className="publicar-carro__placeholder">
            <p>Próximamente podrás subir fotografías de tu vehículo.</p>
            <p>Por ahora, continúa con la publicación completando los detalles de la subasta.</p>
          </div>
        );
      case 2:
        return (
          <div className="publicar-carro__fields">
            <label>
              Precio base
              <input
                type="number"
                name="basePrice"
                min="0.01"
                step="0.01"
                value={formData.basePrice}
                onChange={handleChange}
                required
              />
            </label>
            <label>
              Incremento mínimo
              <input
                type="number"
                name="minIncrement"
                min="0.01"
                step="0.01"
                value={formData.minIncrement}
                onChange={handleChange}
                required
              />
            </label>
            <label>
              Fecha y hora de cierre
              <input
                type="datetime-local"
                name="endsAt"
                value={formData.endsAt}
                onChange={handleChange}
                required
              />
            </label>
          </div>
        );
      case 3:
        return (
          <div className="publicar-carro__fields">
            <label>
              Descripción
              <textarea
                name="description"
                rows="4"
                value={formData.description}
                onChange={handleChange}
              />
            </label>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="publicar-carro">
      <h1>Publicar vehículo</h1>

      {/* Barra de pasos */}
      <div className="publicar-carro__steps">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          return (
            <div
              key={step.title}
              className={`publicar-carro__step${
                isActive ? ' publicar-carro__step--active' : ''
              }${isCompleted ? ' publicar-carro__step--completed' : ''}`}
            >
              <span className="publicar-carro__step-number">{index + 1}</span>
              <span className="publicar-carro__step-title">{step.title}</span>
            </div>
          );
        })}
      </div>

      {/* ÚNICO formulario */}
      <form onSubmit={handleNextOrSubmit} className="publicar-carro__form">
        <div className="publicar-carro__section">{renderStepContent()}</div>

        {error && <p className="publicar-carro__error">{error}</p>}

        <div className="publicar-carro__actions">
          <button
            type="button"
            className="publicar-carro__button publicar-carro__button--secondary"
            onClick={handlePrevious}
            disabled={currentStep === 0 || loading}
          >
            Anterior
          </button>
          <button type="submit" className="publicar-carro__button" disabled={loading}>
            {currentStep === steps.length - 1
              ? (loading ? 'Publicando…' : 'Publicar')
              : 'Siguiente'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PublicarCarro;