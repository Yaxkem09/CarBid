import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import logo1 from '../assets/logo1.png';
import './bienvenida.css';

const defaultRegister = {
  nombre: '',
  apellidos: '',
  genero: 'M',
  telefono: '',
  email: '',
  password: '',
};

const defaultLogin = {
  email: '',
  password: '',
};

const MIN_PASSWORD = 6;

const Bienvenida = () => {
  const [mode, setMode] = useState('login');
  const [loginData, setLoginData] = useState(defaultLogin);
  const [registerData, setRegisterData] = useState(defaultRegister);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
  };

  const handleLoginChange = (event) => {
    const { name, value } = event.target;
    setLoginData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegisterChange = (event) => {
    const { name, value } = event.target;
    setRegisterData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    if (!loginData.email || !loginData.password) {
      setError('Ingresa tu correo y contraseña.');
      return;
    }

    try {
      setError('');
      setLoading(true);
      await api.post('/api/auth/login', loginData);
      navigate('/inicio', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (event) => {
    event.preventDefault();
    if (!registerData.nombre || !registerData.apellidos || !registerData.email) {
      setError('Completa los campos obligatorios.');
      return;
    }
    if (registerData.password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }

    try {
      setError('');
      setLoading(true);
      await api.post('/api/auth/register', registerData);
      navigate('/inicio', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bienvenida-page">
      <div className="form-container">
        <div className="left-side">
          <div className="auth-wrap">
            {mode === 'login' ? (
              <form onSubmit={handleLoginSubmit}>
                <h2>Iniciar sesión</h2>
                <input
                  type="email"
                  name="email"
                  placeholder="Correo electrónico"
                  value={loginData.email}
                  onChange={handleLoginChange}
                  required
                />
                <input
                  type="password"
                  name="password"
                  placeholder="Contraseña"
                  value={loginData.password}
                  onChange={handleLoginChange}
                  required
                />
                <button type="submit" disabled={loading}>
                  {loading ? 'Enviando…' : 'Iniciar sesión'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegisterSubmit}>
                <h2>Crear cuenta</h2>
                <input
                  type="text"
                  name="nombre"
                  placeholder="Nombre"
                  value={registerData.nombre}
                  onChange={handleRegisterChange}
                  required
                />
                <input
                  type="text"
                  name="apellidos"
                  placeholder="Apellidos"
                  value={registerData.apellidos}
                  onChange={handleRegisterChange}
                  required
                />
                <select name="genero" value={registerData.genero} onChange={handleRegisterChange}>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  <option value="O">Otro</option>
                </select>
                <input
                  type="tel"
                  name="telefono"
                  placeholder="Teléfono"
                  value={registerData.telefono}
                  onChange={handleRegisterChange}
                />
                <input
                  type="email"
                  name="email"
                  placeholder="Correo electrónico"
                  value={registerData.email}
                  onChange={handleRegisterChange}
                  required
                />
                <input
                  type="password"
                  name="password"
                  placeholder="Contraseña"
                  value={registerData.password}
                  onChange={handleRegisterChange}
                  required
                />
                <button type="submit" disabled={loading}>
                  {loading ? 'Enviando…' : 'Registrarse'}
                </button>
              </form>
            )}

            {error && <small className="auth-error">{error}</small>}

            <div className="toggle-button">
              <button type="button" onClick={toggleMode}>
                {mode === 'login'
                  ? '¿No tienes cuenta? Regístrate'
                  : '¿Ya tienes cuenta? Inicia sesión'}
              </button>
            </div>
          </div>
        </div>

        <div className="right-side">
          <img src={logo1} alt="CarBid Logo" />
        </div>
      </div>
    </div>
  );
};

export default Bienvenida;
