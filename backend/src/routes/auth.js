// src/routes/auth.js
import { Router } from 'express';
import { User } from '../db/orm.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();

function buildCookieOptions({ includeMaxAge = false } = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const secure = Boolean(isProduction);
  const sameSite = secure ? 'None' : 'Lax';

  const domainEnv = process.env.COOKIE_DOMAIN?.trim();
  const normalizedDomain = domainEnv && !/^localhost$/i.test(domainEnv) && !/^127\.0\.0\.1$/i.test(domainEnv)
    ? domainEnv
    : undefined;

  const baseOptions = {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
  };

  if (normalizedDomain) {
    baseOptions.domain = normalizedDomain;
  }

  if (includeMaxAge) {
    baseOptions.maxAge = 7 * 24 * 60 * 60 * 1000;
  }

  return baseOptions;
}

function setAuthCookie(res, payload) {
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, buildCookieOptions({ includeMaxAge: true }));
}

// GET /api/auth/check-email
router.get('/check-email', async (req, res) => {
  const email = req.query.email?.toString().trim();
  if (!email) {
    return res.status(400).json({ message: 'Email requerido' });
  }

  try {
    const existingUser = await User.findOne({ where: { email } });
    res.json({ exists: Boolean(existingUser) });
  } catch (err) {
    console.error('Error checking email uniqueness', err);
    res.status(500).json({ message: 'Error al verificar correo' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { nombre, apellidos, genero, telefono, email, password } = req.body ?? {};
  if (!nombre || !apellidos || !genero || !email || !password) {
    return res.status(400).json({ message: 'Campos requeridos: nombre, apellidos, genero, email, password' });
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    // ORM: creamos usuario con Sequelize para evitar SQL manual.
    const createdUser = await User.create({
      nombre,
      apellidos,
      genero,
      telefono: telefono ?? null,
      email,
      passwordHash: hash,
    });
    setAuthCookie(res, { id: createdUser.id, email });
    res.json({ ok: true });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Email ya registrado' });
    console.error(e);
    res.status(500).json({ message: 'Error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ message: 'Faltan credenciales' });

  // ORM: buscamos al usuario con Sequelize.
  const user = await User.findOne({ where: { email } });
  if (!user) return res.status(401).json({ message: 'Credenciales' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Credenciales' });

  setAuthCookie(res, { id: user.id, email });
  res.json({ ok: true, user: { id: user.id, nombre: user.nombre, email } });
});

// GET /api/auth/me (opcional para pruebas)
router.get('/me', async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ message: 'No autorizado' });

  try {
    const data = jwt.verify(token, process.env.JWT_SECRET);
    // ORM: recuperamos al usuario autenticado con Sequelize.
    const user = await User.findByPk(data.id, {
      attributes: ['id', 'nombre', 'apellidos', 'email'],
    });

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellidos: user.apellidos,
      },
    });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token invalido' });
    }
    console.error(err);
    res.status(500).json({ message: 'Error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', buildCookieOptions());
  res.json({ ok: true });
});

export default router;
