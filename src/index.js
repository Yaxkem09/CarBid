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
import { ensureDatabaseConnection } from './db/orm.js';

try {
  await ensureDatabaseConnection();
  console.log('Database connection ready.');
} catch (error) {
  console.error('Unable to connect to the database:', error);
  process.exit(1);
}

const app = express();

/* 🧩 NUEVA CONFIGURACIÓN DE CORS — admite tanto carbid.click como www.carbid.click */
const allowedOrigins = [
  'https://carbid.click',
  'https://www.carbid.click'
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// ✅ responder a solicitudes OPTIONS (preflight)
app.options('*', cors());

app.use(express.json());
app.use(cookieParser());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ✅ ruta raíz
app.get('/', (_req, res) => {
  res.send('Backend CarBid running');
});

app.get('/health', (_req, res) => res.send('ok'));

app.get('/db-check', async (_req, res) => {
  try {
    await ensureDatabaseConnection();
    res.send(`Database connection OK. Timestamp: ${new Date().toISOString()}`);
  } catch (err) {
    console.error('Database connectivity error:', err.message);
    res.status(500).send('Database connection error: ' + err.message);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/bids', bidRoutes);

const httpServer = createServer(app);

initRealtime(httpServer);
startAuctionStatusJob();

const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});