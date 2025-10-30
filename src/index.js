import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import listingRoutes from './routes/listings.js';
import bidRoutes from './routes/bids.js';
import { startAuctionStatusJob } from './jobs/auctionStatusJob.js';
import { initRealtime } from './realtime/socket.js';
import { pool } from './db/pool.js'; // 👈 AGREGA ESTA IMPORTACIÓN

// ---------------- CONFIGURACIÓN BÁSICA ----------------
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN,
  credentials: true
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ---------------- RUTA DE SALUD ----------------
app.get('/health', (req, res) => res.send('ok'));

// ---------------- RUTA PARA PROBAR LA BD ----------------
app.get('/db-check', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT NOW() AS fecha');
    res.send(`✅ Conexión exitosa a la BD. Fecha: ${rows[0].fecha}`);
  } catch (err) {
    console.error('❌ Error en la conexión a la BD:', err.message);
    res.status(500).send('Error en la conexión a la base de datos: ' + err.message);
  }
});

// ---------------- RUTAS PRINCIPALES ----------------
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/bids', bidRoutes);

// ---------------- SERVIDOR HTTP ----------------
const httpServer = createServer(app); // 👈 AQUÍ va esta línea

// ---------------- FUNCIONES AUXILIARES ----------------
initRealtime(httpServer);
startAuctionStatusJob();

// ---------------- INICIAR SERVIDOR ----------------
const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`✅ API escuchando en el puerto ${PORT}`);
});