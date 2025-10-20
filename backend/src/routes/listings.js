import { Router } from 'express';
import { pool } from '../db/pool.js';
import { auth } from '../middleware/auth.js';

const router = Router();

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
    `SELECT b.id, b.amount, b.created_at, b.user_id, u.nombre
       FROM bids b
       LEFT JOIN users u ON u.id = b.user_id
       WHERE b.auction_id = ?
       ORDER BY b.created_at DESC`,
    [id]
  );

  res.json({
    listing: mapListing(listing, imagesMap.get(listing.id)),
    bids: bids.map((bid) => ({
      id: bid.id,
      userId: bid.user_id,
      amount: Number(bid.amount),
      bidderName: bid.nombre ?? 'Usuario',
      createdAt: bid.created_at,
    })),
  });
});

router.post('/', auth, async (req, res) => {
  const { title, brand, model, year, basePrice, minIncrement, description, endsAt } = req.body ?? {};

  if (!title || !brand || !model || !year || !basePrice || !minIncrement || !endsAt) {
    return res.status(400).json({ message: 'Campos obligatorios: título, marca, modelo, año, precio base, incremento mínimo y fecha de cierre.' });
  }

  const closingDate = new Date(endsAt);
  if (Number.isNaN(closingDate.getTime()) || closingDate <= new Date()) {
    return res.status(400).json({ message: 'La fecha de cierre debe ser posterior al momento actual.' });
  }

  const numericBasePrice = Number(basePrice);
  const numericMinIncrement = Number(minIncrement);
  const numericYear = Number(year);

  if (!Number.isFinite(numericYear) || numericYear < 1900) {
    return res.status(400).json({ message: 'El año del vehículo no es válido.' });
  }

  if (!Number.isFinite(numericBasePrice) || numericBasePrice <= 0) {
    return res.status(400).json({ message: 'El precio base debe ser un número mayor que 0.' });
  }

  if (!Number.isFinite(numericMinIncrement) || numericMinIncrement <= 0) {
    return res.status(400).json({ message: 'El incremento mínimo debe ser un número mayor que 0.' });
  }

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
    description ?? '',
    formatDate(closingDate),
  ];

  const [result] = await pool.execute(sql, params);
  res.status(201).json({ id: result.insertId });
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
    'INSERT INTO bids (auction_id, user_id, amount) VALUES (?, ?, ?)',
    [id, req.user.id, amount]
  );

  res.status(201).json({ ok: true });
});

export default router;
