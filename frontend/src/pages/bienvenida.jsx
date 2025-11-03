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
  confirmPassword: '',
};

const defaultLogin = {
  email: '',
  password: '',
};

const MIN_PASSWORD = 6;
const sanitizePhoneNumber = (value) => value.replace(/\D/g, '').slice(0, 8);
const formatPhoneNumber = (value) => {
  if (!value) {
    return '';
  }
  const digits = sanitizePhoneNumber(value);
  return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
};

const EyeIcon = ({ open }) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M2 12C4.5 7.5 8 5 12 5s7.5 2.5 10 7c-2.5 4.5-6 7-10 7s-7.5-2.5-10-7Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle
      cx="12"
      cy="12"
      r="3"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {!open && (
      <line
        x1="4"
        y1="19"
        x2="20"
        y2="5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    )}
  </svg>
);

const Bienvenida = () => {
  const [mode, setMode] = useState('login');
  const [loginData, setLoginData] = useState(defaultLogin);
  const [registerData, setRegisterData] = useState(defaultRegister);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
    setShowLoginPassword(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleLoginChange = (event) => {
    const { name, value } = event.target;
    setLoginData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegisterChange = (event) => {
    const { name, value } = event.target;
    if (name === 'telefono') {
      const digitsOnly = sanitizePhoneNumber(value);
      setRegisterData((prev) => ({ ...prev, telefono: digitsOnly }));
      return;
    }
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
    const trimmedEmail = registerData.email.trim();
    if (!registerData.nombre || !registerData.apellidos || !trimmedEmail) {
      setError('Completa los campos obligatorios.');
      return;
    }
    if (!trimmedEmail.includes('@')) {
      setError('El correo debe incluir "@".');
      return;
    }
    if (registerData.telefono.length !== 8) {
      setError('El telefono debe tener 8 digitos.');
      return;
    }
    if (registerData.password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (registerData.password !== registerData.confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    try {
      setError('');
      setLoading(true);
      const { data: emailCheck } = await api.get('/api/auth/check-email', {
        params: { email: trimmedEmail },
      });

      if (emailCheck?.exists) {
        setError('El correo ya esta registrado.');
        return;
      }

      const { confirmPassword, ...payload } = registerData;
      await api.post('/api/auth/register', { ...payload, email: trimmedEmail });
      navigate('/inicio', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bienvenida-page">
      <div className={`form-container ${mode === 'register' ? 'mode-register' : 'mode-login'}`}>
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
                <div className="password-input">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    name="password"
                    placeholder="Contraseña"
                    value={loginData.password}
                    onChange={handleLoginChange}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showLoginPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    <EyeIcon open={showLoginPassword} />
                  </button>
                </div>
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
                  inputMode="numeric"
                  maxLength={9}
                  value={formatPhoneNumber(registerData.telefono)}
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
                <div className="password-input">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    placeholder="Contraseña"
                    value={registerData.password}
                    onChange={handleRegisterChange}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowPassword((prev) => !prev)}
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
                <div className="password-input">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    placeholder="Confirmar contraseña"
                    value={registerData.confirmPassword}
                    onChange={handleRegisterChange}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    <EyeIcon open={showConfirmPassword} />
                  </button>
                </div>
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
          <p className="right-side-tagline">Subasta, compra y vende vehiculos con total confianza..</p>
        </div>
      </div>
    </div>
  );
};

export default Bienvenida;
