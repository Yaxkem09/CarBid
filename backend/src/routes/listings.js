import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pool } from '../db/pool.js';
import { auth } from '../middleware/auth.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

fs.mkdirSync(uploadsDir, { recursive: true });

const MAX_IMAGE_COUNT = 4;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/jpg',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const baseName = path
      .basename(file.originalname, path.extname(file.originalname))
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '')
      .slice(0, 40) || 'imagen';

    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${baseName}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: MAX_IMAGE_COUNT,
  },
  fileFilter: (_req, file, cb) => {
    if (allowedMimeTypes.has(file.mimetype)) {
      cb(null, true);
    } else {
      const error = new Error('INVALID_IMAGE_TYPE');
      error.code = 'INVALID_IMAGE_TYPE';
      cb(error);
    }
  },
});

const handleImageUpload = (req, res, next) => {
  upload.array('images', MAX_IMAGE_COUNT)(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err.code === 'INVALID_IMAGE_TYPE') {
      return res.status(400).json({ message: 'Solo se permiten archivos de imagen (JPG, PNG, WEBP, GIF).' });
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'Cada imagen debe pesar menos de 5MB.' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ message: `Solo se permiten ${MAX_IMAGE_COUNT} imagenes por publicacion.` });
      }
      return res.status(400).json({ message: 'No se pudieron procesar las imagenes adjuntas.' });
    }

    console.error('Error subiendo imagenes:', err);
    return res.status(500).json({ message: 'Error interno al subir las imagenes.' });
  });
};

function cleanupFiles(files) {
  if (!Array.isArray(files) || !files.length) {
    return;
  }

  files.forEach((file) => {
    try {
      fs.unlinkSync(file.path);
    } catch (error) {
      console.warn('No se pudo eliminar archivo temporal:', error.message);
    }
  });
}

function mapListing(row, images = []) {
  const normalizedImages = Array.isArray(images) ? images : [];

  return {
    id: row.id,
    sellerId: row.seller_id,
    title: row.title,
    brand: row.brand,
    model: row.model,
    year: row.year,
    basePrice: Number(row.base_price),
    minIncrement: row.min_increment !== null ? Number(row.min_increment) : null,
    description: row.description ?? '',
    status: row.status,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    highestBid: row.highest_bid !== null ? Number(row.highest_bid) : null,
    images: normalizedImages,
  };
}

async function fetchImagesMap(listingIds) {
  if (!Array.isArray(listingIds) || listingIds.length === 0) {
    return new Map();
  }

  const placeholders = listingIds.map(() => '?').join(', ');
  const [imageRows] = await pool.query(
    `SELECT auction_id, image_path
       FROM auction_images
       WHERE auction_id IN (${placeholders})
       ORDER BY id`,
    listingIds,
  );

  return imageRows.reduce((map, imageRow) => {
    if (!map.has(imageRow.auction_id)) {
      map.set(imageRow.auction_id, []);
    }

    map.get(imageRow.auction_id).push(imageRow.image_path);
    return map;
  }, new Map());
}

function formatDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

router.get('/', auth, async (req, res) => {
  try {
    const mine = req.query.mine === '1' || req.query.mine === 'true';
    const status = req.query.status;
    const brand = req.query.brand?.trim();
    const model = req.query.model?.trim();
    const year = Number.parseInt(req.query.year, 10);
    const minPrice = Number.parseFloat(req.query.minPrice);
    const maxPrice = Number.parseFloat(req.query.maxPrice);

    const conditions = [];
    const params = [];

    if (mine) {
      conditions.push('a.seller_id = ?');
      params.push(req.user.id);
    }

    if (status) {
      conditions.push('a.status = ?');
      params.push(status);
    }

    if (brand) {
      conditions.push('a.brand = ?');
      params.push(brand);
    }

    if (model) {
      conditions.push('a.model = ?');
      params.push(model);
    }

    if (Number.isInteger(year)) {
      conditions.push('a.year = ?');
      params.push(year);
    }

    if (Number.isFinite(minPrice)) {
      conditions.push('a.base_price >= ?');
      params.push(minPrice);
    }

    if (Number.isFinite(maxPrice)) {
      conditions.push('a.base_price <= ?');
      params.push(maxPrice);
    }

    let sql = `
      SELECT a.*, (
        SELECT MAX(b.amount)
        FROM bids b
        WHERE b.auction_id = a.id
      ) AS highest_bid
      FROM auctions a
    `;

    if (conditions.length) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' ORDER BY a.created_at DESC';

    const [rows] = await pool.execute(sql, params);
    const imagesMap = await fetchImagesMap(rows.map((row) => row.id));

    res.json(rows.map((row) => mapListing(row, imagesMap.get(row.id))));
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ message: 'Error al obtener las subastas.' });
  }
});

router.get('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const [[listing]] = await pool.execute(
    `SELECT a.*, (
        SELECT MAX(b.amount)
        FROM bids b
        WHERE b.auction_id = a.id
      ) AS highest_bid
      FROM auctions a
      WHERE a.id = ?`,
    [id]
  );

  if (!listing) {
    return res.status(404).json({ message: 'Subasta no encontrada' });
  }

  const imagesMap = await fetchImagesMap([listing.id]);

  const [bids] = await pool.execute(
    `SELECT b.id, b.amount, b.created_at, b.bidder_id, u.nombre
       FROM bids b
       LEFT JOIN users u ON u.id = b.bidder_id
       WHERE b.auction_id = ?
       ORDER BY b.created_at DESC`,
    [id]
  );

  res.json({
    listing: mapListing(listing, imagesMap.get(listing.id)),
    bids: bids.map((bid) => ({
      id: bid.id,
      userId: bid.bidder_id,
      bidderId: bid.bidder_id,
      amount: Number(bid.amount),
      bidderName: bid.nombre ?? 'Usuario',
      createdAt: bid.created_at,
    })),
  });
});

router.post('/', auth, handleImageUpload, async (req, res) => {
  const body = req.body ?? {};
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];

  const readField = (field) => {
    const value = body[field];
    const selected = Array.isArray(value) ? value[0] : value;
    if (typeof selected === 'string') {
      return selected.trim();
    }
    if (selected === undefined || selected === null) {
      return '';
    }
    return String(selected).trim();
  };

  const rejectWithCleanup = (status, message) => {
    cleanupFiles(uploadedFiles);
    return res.status(status).json({ message });
  };

  const title = readField('title');
  const brand = readField('brand');
  const model = readField('model');
  const yearValue = readField('year');
  const basePriceValue = readField('basePrice');
  const minIncrementValue = readField('minIncrement');
  const description = readField('description');
  const endsAtValue = readField('endsAt');

  if (!title || !brand || !model || !yearValue || !basePriceValue || !minIncrementValue || !endsAtValue) {
    return rejectWithCleanup(400, 'Campos obligatorios: titulo, marca, modelo, ano, precio base, incremento minimo y fecha de cierre.');
  }

  const numericYear = Number(yearValue);
  const numericBasePrice = Number(basePriceValue);
  const numericMinIncrement = Number(minIncrementValue);
  const currentYearLimit = new Date().getFullYear() + 1;

  if (!Number.isInteger(numericYear) || numericYear < 1900 || numericYear > currentYearLimit) {
    return rejectWithCleanup(400, `El ano debe estar entre 1900 y ${currentYearLimit}.`);
  }

  if (!Number.isFinite(numericBasePrice) || numericBasePrice <= 0) {
    return rejectWithCleanup(400, 'El precio base debe ser un numero mayor que 0.');
  }

  if (!Number.isFinite(numericMinIncrement) || numericMinIncrement <= 0) {
    return rejectWithCleanup(400, 'El incremento minimo debe ser un numero mayor que 0.');
  }

  const closingDate = new Date(endsAtValue);
  if (Number.isNaN(closingDate.getTime()) || closingDate <= new Date()) {
    return rejectWithCleanup(400, 'La fecha de cierre debe ser posterior al momento actual.');
  }

  const relativeImagePaths = uploadedFiles.map((file) => `uploads/${file.filename}`);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const sql = `
      INSERT INTO auctions (seller_id, title, brand, model, year, base_price, min_increment, description, status, ends_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `;

    const params = [
      req.user.id,
      title,
      brand,
      model,
      numericYear,
      numericBasePrice,
      numericMinIncrement,
      description || '',
      formatDate(closingDate),
    ];

    const [result] = await connection.execute(sql, params);
    const listingId = result.insertId;

    if (relativeImagePaths.length) {
      const placeholders = relativeImagePaths.map(() => '(?, ?)').join(', ');
      const imageParams = relativeImagePaths.flatMap((pathValue) => [listingId, pathValue]);
      await connection.execute(
        `INSERT INTO auction_images (auction_id, image_path) VALUES ${placeholders}`,
        imageParams,
      );
    }

    await connection.commit();
    return res.status(201).json({ id: listingId, images: relativeImagePaths });
  } catch (error) {
    await connection.rollback();
    cleanupFiles(uploadedFiles);
    console.error('Error creando subasta:', error);
    return res.status(500).json({ message: 'No se pudo publicar el vehiculo.' });
  } finally {
    connection.release();
  }
});

router.post('/:id/bids', auth, async (req, res) => {
  const { id } = req.params;
  const amount = Number(req.body?.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Ingresa una oferta válida.' });
  }

  const [[listing]] = await pool.execute(
    'SELECT id, seller_id, status, base_price, ends_at FROM auctions WHERE id = ?',
    [id]
  );

  if (!listing) {
    return res.status(404).json({ message: 'Subasta no encontrada' });
  }

  if (listing.seller_id === req.user.id) {
    return res.status(400).json({ message: 'No puedes ofertar en tu propia subasta.' });
  }

  const now = new Date();
  const closingDate = new Date(listing.ends_at);
  if (listing.status !== 'active' || closingDate <= now) {
    await pool.execute('UPDATE auctions SET status = ? WHERE id = ? AND status = "active"', ['ended', id]);
    return res.status(400).json({ message: 'La subasta ya finalizó.' });
  }

  const [[highest]] = await pool.execute(
    'SELECT MAX(amount) AS max_amount FROM bids WHERE auction_id = ?',
    [id]
  );

  const minAmount = Math.max(Number(listing.base_price), Number(highest?.max_amount ?? 0));
  if (amount <= minAmount) {
    return res.status(400).json({ message: `La oferta debe superar $${minAmount}.` });
  }

  await pool.execute(
    'INSERT INTO bids (auction_id, bidder_id, amount) VALUES (?, ?, ?)',
    [id, req.user.id, amount]
  );

  res.status(201).json({ ok: true });
});

export default router;
