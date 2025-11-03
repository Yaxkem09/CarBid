// src/services/api.js
import axios from 'axios';

const isLocal = window.location.hostname === 'localhost';

// ⚙️ Configurar automáticamente según el entorno
const api = axios.create({
  baseURL: isLocal
    ? 'http://localhost:5000' // 👈 sin /api aquí
    : process.env.REACT_APP_API_URL || 'https://backend-carbid-env.eba-xcwij82h.us-east-2.elasticbeanstalk.com',
  withCredentials: true,
});

export default api;