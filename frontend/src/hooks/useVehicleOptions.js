import { useCallback, useEffect, useMemo, useState } from 'react';
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
const fallbackBrandModelMap = {};

const normalizeBrandKey = (value) =>
  typeof value === 'string' ? value.trim().toLocaleLowerCase('es-GT') : '';

const normalizeBrandModelMap = (candidate) => {
  if (!candidate || typeof candidate !== 'object') {
    return fallbackBrandModelMap;
  }

  return Object.entries(candidate).reduce((acc, [brandName, models]) => {
    const brandKey = normalizeBrandKey(brandName);
    if (!brandKey) {
      return acc;
    }
    const normalizedModels = toUniqueSortedList(models);
    if (normalizedModels.length) {
      acc[brandKey] = normalizedModels;
    }
    return acc;
  }, {});
};

export function useVehicleOptions() {
  const [brands, setBrands] = useState(fallbackBrands);
  const [models, setModels] = useState(fallbackModels);
  const [modelsByBrand, setModelsByBrand] = useState(fallbackBrandModelMap);
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
        const fetchedBrandMap = normalizeBrandModelMap(response.data?.brandModelMap);

        setBrands(fetchedBrands.length ? fetchedBrands : fallbackBrands);
        setModels(fetchedModels.length ? fetchedModels : fallbackModels);
        setModelsByBrand(
          Object.keys(fetchedBrandMap).length ? fetchedBrandMap : fallbackBrandModelMap,
        );
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'No se pudieron cargar las opciones disponibles.');
          setBrands(fallbackBrands);
          setModels(fallbackModels);
          setModelsByBrand(fallbackBrandModelMap);
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

  const getModelsForBrand = useCallback(
    (brand) => {
      const key = normalizeBrandKey(brand);
      if (key && modelsByBrand[key]?.length) {
        return modelsByBrand[key];
      }
      return models;
    },
    [models, modelsByBrand],
  );

  return useMemo(
    () => ({
      brands,
      models,
      getModelsForBrand,
      loading,
      error,
    }),
    [brands, models, getModelsForBrand, loading, error],
  );
}
