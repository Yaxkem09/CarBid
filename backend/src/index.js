import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import listingRoutes from './routes/listings.js';
import bidRoutes from './routes/bids.js';
import { startAuctionStatusJob } from './jobs/auctionStatusJob.js';

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

app.get('/health', (req, res) => res.send('ok'));
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/bids', bidRoutes);

startAuctionStatusJob();

app.listen(process.env.PORT, () => {
  console.log(`API escuchando en :${process.env.PORT}`);
});
