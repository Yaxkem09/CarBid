import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { vehicleBrands, vehicleModels } from '../constants/vehicleOptions';

const toUniqueSortedList = (values) => {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  values.forEach((value) => {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    const key = trimmed.toLocaleLowerCase('es-GT');
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    normalized.push(trimmed);
  });

  return normalized.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
};

const fallbackBrands = toUniqueSortedList(vehicleBrands);
const fallbackModels = toUniqueSortedList(vehicleModels);

export function useVehicleOptions() {
  const [brands, setBrands] = useState(fallbackBrands);
  const [models, setModels] = useState(fallbackModels);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const fetchOptions = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/api/listings/options');
        if (cancelled) {
          return;
        }

        const fetchedBrands = toUniqueSortedList(response.data?.brands);
        const fetchedModels = toUniqueSortedList(response.data?.models);

        setBrands(fetchedBrands.length ? fetchedBrands : fallbackBrands);
        setModels(fetchedModels.length ? fetchedModels : fallbackModels);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'No se pudieron cargar las opciones disponibles.');
          setBrands(fallbackBrands);
          setModels(fallbackModels);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(
    () => ({
      brands,
      models,
      loading,
      error,
    }),
    [brands, models, loading, error],
  );
}

