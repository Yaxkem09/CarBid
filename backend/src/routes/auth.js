// src/routes/auth.js
import { Router } from 'express';
import { pool } from '../db/pool.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();

function setAuthCookie(res, payload) {
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    secure: false,        // en local false; en prod true con HTTPS
    sameSite: 'Lax',      // en prod usar 'None' + secure:true
    domain: process.env.COOKIE_DOMAIN, // en local: 'localhost'
    path: '/',
    maxAge: 7*24*60*60*1000
  });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { nombre, apellidos, genero, telefono, email, password } = req.body ?? {};
  if (!nombre || !apellidos || !genero || !email || !password) {
    return res.status(400).json({ message: 'Campos requeridos: nombre, apellidos, genero, email, password' });
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    const sql = `
      INSERT INTO users (nombre, apellidos, genero, telefono, email, password_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const [r] = await pool.execute(sql, [nombre, apellidos, genero, telefono ?? null, email, hash]);
    setAuthCookie(res, { id: r.insertId, email });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email ya registrado' });
    console.error(e);
    res.status(500).json({ message: 'Error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ message: 'Faltan credenciales' });

  const [rows] = await pool.execute(
    'SELECT id, password_hash, nombre FROM users WHERE email=?',
    [email]
  );
  if (!rows.length) return res.status(401).json({ message: 'Credenciales' });

  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ message: 'Credenciales' });

  setAuthCookie(res, { id: rows[0].id, email });
  res.json({ ok: true, user: { id: rows[0].id, nombre: rows[0].nombre, email } });
});

// GET /api/auth/me (opcional para pruebas)
router.get('/me', async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ message: 'No autorizado' });

  try {
    const data = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await pool.execute(
      'SELECT id, nombre, apellidos, email FROM users WHERE id = ? LIMIT 1',
      [data.id],
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const user = rows[0];
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
  res.clearCookie('token', { domain: process.env.COOKIE_DOMAIN, path: '/' });
  res.json({ ok: true });
});

export default router;