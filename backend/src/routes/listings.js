import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Op } from 'sequelize';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Auction, AuctionImage, Bid, User, sequelize } from '../db/orm.js';
import { auth } from '../middleware/auth.js';
import { emitBidCreated } from '../realtime/events.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

const s3Bucket = process.env.S3_BUCKET?.trim();
const s3Region = (process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION)?.trim();
const rawS3PublicUrl = process.env.S3_PUBLIC_URL?.trim();
const s3PublicBaseUrl = rawS3PublicUrl ? rawS3PublicUrl.replace(/\/$/, '') : null;
const useS3Storage = Boolean(s3Bucket && s3Region);
const s3Client = useS3Storage ? new S3Client({ region: s3Region }) : null;

if (!useS3Storage) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const MAX_IMAGE_COUNT = 4;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/jpg',
  'image/pjpeg',
]);

const allowedExtensions = new Set(['.jpeg', '.jpg', '.png', '.webp', '.gif']);

const extensionToMimeType = new Map([
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
]);

const randomSuffix = () => Math.random().toString(36).slice(2, 8);

const buildSafeBaseName = (originalName) => {
  const baseName = path
    .basename(originalName ?? 'imagen', path.extname(originalName ?? ''))
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 40);

  return baseName || 'imagen';
};

const generateSafeFileName = (originalName = 'imagen.jpg') => {
  const ext = (path.extname(originalName) || '.jpg').toLowerCase();
  const baseName = buildSafeBaseName(originalName);
  return `${Date.now()}-${randomSuffix()}-${baseName}${ext}`;
};

const buildS3Key = (originalName) => `uploads/${generateSafeFileName(originalName)}`;

const buildS3ObjectUrl = (bucket, region, key) => {
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  if (s3PublicBaseUrl) {
    return `${s3PublicBaseUrl}/${encodedKey}`;
  }

  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

async function deleteS3Objects(keys) {
  if (!useS3Storage || !Array.isArray(keys) || keys.length === 0) {
    return;
  }

  const results = await Promise.allSettled(
    keys.map((key) =>
      s3Client.send(
        new DeleteObjectCommand({
          Bucket: s3Bucket,
          Key: key,
        }),
      ),
    ),
  );

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn(
        `No se pudo eliminar objeto S3 ${keys[index]}:`,
        result.reason?.message ?? result.reason,
      );
    }
  });
}

async function uploadFilesToS3(files) {
  if (!useS3Storage || !Array.isArray(files) || files.length === 0) {
    return [];
  }

  const uploaded = [];

  try {
    for (const file of files) {
      const key = buildS3Key(file.originalname ?? 'imagen.jpg');
      const fallbackMime =
        extensionToMimeType.get((file.originalname && path.extname(file.originalname).toLowerCase()) || '') ??
        'application/octet-stream';
      const normalizedMime = (file.mimetype ? file.mimetype.toLowerCase() : '') || fallbackMime;
      const contentType = file.detectedMimeType ?? normalizedMime;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: s3Bucket,
          Key: key,
          Body: file.buffer,
          ContentType: contentType,
        }),
      );
      uploaded.push({
        key,
        url: buildS3ObjectUrl(s3Bucket, s3Region, key),
      });
    }
    return uploaded;
  } catch (error) {
    if (uploaded.length) {
      await deleteS3Objects(uploaded.map((item) => item.key));
    }
    throw error;
  }
}

const storage = useS3Storage
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadsDir),
      filename: (_req, file, cb) => {
        cb(null, generateSafeFileName(file.originalname));
      },
    });

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: MAX_IMAGE_COUNT,
  },
  fileFilter: (_req, file, cb) => {
    const mimetype = (file.mimetype ?? '').toLowerCase();
    const extension = (file.originalname && path.extname(file.originalname).toLowerCase()) || '';

    const canonicalMimeType =
      (mimetype && allowedMimeTypes.has(mimetype) && mimetype) || extensionToMimeType.get(extension);

    if (canonicalMimeType) {
      file.detectedMimeType = canonicalMimeType;
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
        return res.status(400).json({ message: 'Cada imagen debe pesar menos de 10MB.' });
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
    const filePath = file?.path;
    if (!filePath) {
      return;
    }

    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.warn('No se pudo eliminar archivo temporal:', error.message);
    }
  });
}

function mapListing(row, images = [], viewerId = null, extras = {}) {
  const normalizedImages = Array.isArray(images) ? images : [];
  const rawHighestBidderId =
    extras.highestBidderId ??
    row.highest_bidder_id ??
    row.highestBidderId ??
    null;
  const parsedHighestBidderId =
    rawHighestBidderId !== null && rawHighestBidderId !== undefined
      ? Number(rawHighestBidderId)
      : null;
  const highestBidderId = Number.isNaN(parsedHighestBidderId) ? null : parsedHighestBidderId;

  const parsedViewerId =
    viewerId !== null && viewerId !== undefined ? Number(viewerId) : null;
  const numericViewerId = Number.isNaN(parsedViewerId) ? null : parsedViewerId;
  const rawHighestBid =
    extras.highestBid ??
    row.highest_bid ??
    row.highestBid ??
    null;
  const highestBid =
    rawHighestBid !== null && rawHighestBid !== undefined
      ? Number(rawHighestBid)
      : null;
  const basePriceRaw = row.base_price ?? row.basePrice;
  const minIncrementRaw = row.min_increment ?? row.minIncrement;
  const mileageRaw = row.kilometraje ?? row.mileage ?? null;
  const kilometraje =
    mileageRaw !== null && mileageRaw !== undefined ? Number(mileageRaw) : null;

  return {
    id: row.id,
    sellerId: row.seller_id ?? row.sellerId,
    title: row.title,
    brand: row.brand,
    model: row.model,
    color: row.color ?? null,
    year: row.year,
    kilometraje,
    basePrice: basePriceRaw !== undefined && basePriceRaw !== null ? Number(basePriceRaw) : null,
    minIncrement: minIncrementRaw !== undefined && minIncrementRaw !== null ? Number(minIncrementRaw) : null,
    description: row.description ?? '',
    status: row.status,
    endsAt: row.ends_at ?? row.endsAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    highestBid,
    images: normalizedImages,
    highestBidderId: highestBidderId,
    isLeading:
      highestBidderId !== null && numericViewerId !== null
        ? highestBidderId === numericViewerId
        : false,
  };
}

async function fetchImagesMap(listingIds) {
  if (!Array.isArray(listingIds) || listingIds.length === 0) {
    return new Map();
  }

  const imageRows = await AuctionImage.findAll({
    where: { auctionId: listingIds },
    order: [['id', 'ASC']],
    raw: true,
  });

  return imageRows.reduce((map, imageRow) => {
    const auctionId = imageRow.auctionId ?? imageRow.auction_id;
    const imagePath = imageRow.imagePath ?? imageRow.image_path;

    if (!map.has(auctionId)) {
      map.set(auctionId, []);
    }

    map.get(auctionId).push(imagePath);
    return map;
  }, new Map());
}

function buildUniqueList(rows, key) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const seen = new Set();
  const results = [];

  rows.forEach((row) => {
    const rawValue = row?.[key];
    if (typeof rawValue !== 'string') {
      return;
    }
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return;
    }
    const normalized = trimmed.toLocaleLowerCase('es-GT');
    if (!seen.has(normalized)) {
      seen.add(normalized);
      results.push(trimmed);
    }
  });

  return results;
}

router.get('/options', auth, async (_req, res) => {
  try {
    const [brandRows, modelRows] = await Promise.all([
      Auction.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('brand')), 'brand']],
        order: [[sequelize.fn('LOWER', sequelize.col('brand')), 'ASC']],
        raw: true,
      }),
      Auction.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('model')), 'model']],
        order: [[sequelize.fn('LOWER', sequelize.col('model')), 'ASC']],
        raw: true,
      }),
    ]);

    const brands = buildUniqueList(brandRows, 'brand');
    const models = buildUniqueList(modelRows, 'model');

    res.json({
      brands,
      models,
    });
  } catch (error) {
    console.error('Failed to fetch listing options:', error);
    res.status(500).json({ message: 'No se pudieron obtener las opciones disponibles.' });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const mine = req.query.mine === '1' || req.query.mine === 'true';
    const status = req.query.status;
    const brand = req.query.brand?.trim();
    const model = req.query.model?.trim();
    const color = req.query.color?.trim();
    const year = Number.parseInt(req.query.year, 10);
    const minPrice = Number.parseFloat(req.query.minPrice);
    const maxPrice = Number.parseFloat(req.query.maxPrice);

    const where = {};

    if (mine) {
      where.sellerId = req.user.id;
    }

    if (status) {
      where.status = status;
    }

    const andConditions = [];

    if (brand) {
      andConditions.push(
        sequelize.where(sequelize.fn('LOWER', sequelize.col('brand')), brand.toLowerCase()),
      );
    }

    if (model) {
      andConditions.push(
        sequelize.where(sequelize.fn('LOWER', sequelize.col('model')), model.toLowerCase()),
      );
    }

    if (color) {
      andConditions.push(
        sequelize.where(sequelize.fn('LOWER', sequelize.col('color')), color.toLowerCase()),
      );
    }

    if (andConditions.length) {
      if (!where[Op.and]) {
        where[Op.and] = [];
      }
      where[Op.and].push(...andConditions);
    }

    if (Number.isInteger(year)) {
      where.year = year;
    }

    if (Number.isFinite(minPrice) && Number.isFinite(maxPrice)) {
      where.basePrice = { [Op.between]: [minPrice, maxPrice] };
    } else if (Number.isFinite(minPrice)) {
      where.basePrice = { [Op.gte]: minPrice };
    } else if (Number.isFinite(maxPrice)) {
      where.basePrice = { [Op.lte]: maxPrice };
    }

    // ORM: listamos subastas usando Sequelize con filtros seguros.
    const rows = await Auction.findAll({
      where,
      order: [['createdAt', 'DESC']],
      raw: true,
    });

    const listingIds = rows.map((row) => row.id);
    const imagesMap = await fetchImagesMap(listingIds);

    const topBids = listingIds.length
      ? await Bid.findAll({
          where: { auctionId: listingIds },
          order: [
            ['auctionId', 'ASC'],
            ['amount', 'DESC'],
            ['createdAt', 'ASC'],
          ],
          attributes: ['auctionId', 'bidderId', 'amount'],
          raw: true,
        })
      : [];

    const highestByAuction = new Map();
    for (const bid of topBids) {
      const auctionId = bid.auctionId ?? bid.auction_id;
      if (!highestByAuction.has(auctionId)) {
        highestByAuction.set(auctionId, bid);
      }
    }

    res.json(
      rows.map((row) =>
        mapListing(row, imagesMap.get(row.id) ?? [], req.user.id, {
          highestBid: highestByAuction.get(row.id)?.amount ?? null,
          highestBidderId:
            highestByAuction.get(row.id)?.bidderId ??
            highestByAuction.get(row.id)?.bidder_id ??
            null,
        }),
      ),
    );
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ message: 'Error al obtener las subastas.' });
  }
});

router.get('/:id', auth, async (req, res) => {
  const { id } = req.params;
  // ORM: obtenemos subasta y pujas mediante Sequelize.
  const listing = await Auction.findByPk(id, { raw: true });

  if (!listing) {
    return res.status(404).json({ message: 'Subasta no encontrada' });
  }

  const imagesMap = await fetchImagesMap([listing.id]);

  const bids = await Bid.findAll({
    where: { auctionId: id },
    include: [{ model: User, as: 'bidder', attributes: ['id', 'nombre'] }],
    order: [['createdAt', 'DESC']],
  });

  const bidsPlain = bids.map((bid) => bid.get({ plain: true }));

  const highestBidRecord = await Bid.findOne({
    where: { auctionId: id },
    include: [{ model: User, as: 'bidder', attributes: ['id', 'nombre'] }],
    order: [
      ['amount', 'DESC'],
      ['createdAt', 'ASC'],
      ['id', 'ASC'],
    ],
  });

  const topBidPlain = highestBidRecord?.get({ plain: true }) ?? null;
  const viewerId = req.user.id;

  res.json({
    listing: mapListing(listing, imagesMap.get(listing.id) ?? [], viewerId, {
      highestBid: topBidPlain?.amount ?? null,
      highestBidderId:
        topBidPlain?.bidderId ?? topBidPlain?.bidder_id ?? null,
    }),
    viewer: {
      id: viewerId,
    },
    bids: bidsPlain.map((bid) => ({
      id: bid.id,
      userId: bid.bidderId ?? bid.bidder_id,
      bidderId: bid.bidderId ?? bid.bidder_id,
      amount: Number(bid.amount),
      bidderName: bid.bidder?.nombre ?? 'Usuario',
      createdAt: bid.createdAt ?? bid.created_at,
    })),
  });
});

router.post('/', auth, handleImageUpload, async (req, res) => {
  const body = req.body ?? {};
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];

  if (uploadedFiles.length) {
    console.log(
      `[POST /api/listings] ${uploadedFiles.length} imagen(es) recibidas:`,
      uploadedFiles.map((file, index) => ({
        index: index + 1,
        name: file.originalname,
        size: file.size,
      })),
    );
  } else {
    console.log('[POST /api/listings] Solicitud sin imagenes adjuntas.');
  }

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
    if (!useS3Storage) {
      cleanupFiles(uploadedFiles);
    }
    return res.status(status).json({ message });
  };

  const title = readField('title');
  const brand = readField('brand');
  const model = readField('model');
  const colorValue = readField('color');
  const yearValue = readField('year');
  const kilometrajeValue = readField('kilometraje');
  const basePriceValue = readField('basePrice');
  const minIncrementValue = readField('minIncrement');
  const description = readField('description');
  const endsAtValue = readField('endsAt');

  if (
    !title ||
    !brand ||
    !model ||
    !colorValue ||
    !yearValue ||
    !kilometrajeValue ||
    !basePriceValue ||
    !minIncrementValue ||
    !endsAtValue
  ) {
    return rejectWithCleanup(
      400,
      'Campos obligatorios: titulo, marca, modelo, color, ano, kilometraje, precio base, incremento minimo y fecha de cierre.',
    );
  }

  const numericYear = Number(yearValue);
  const numericKilometraje = Number.parseInt(kilometrajeValue, 10);
  const numericBasePrice = Number(basePriceValue);
  const numericMinIncrement = Number(minIncrementValue);
  const currentYearLimit = new Date().getFullYear() + 1;

  if (!Number.isInteger(numericYear) || numericYear < 1900 || numericYear > currentYearLimit) {
    return rejectWithCleanup(400, `El ano debe estar entre 1900 y ${currentYearLimit}.`);
  }

  const kilometrajeIsValidInteger = /^\d+$/.test(kilometrajeValue);
  if (
    !kilometrajeIsValidInteger ||
    Number.isNaN(numericKilometraje) ||
    numericKilometraje < 0 ||
    numericKilometraje > 2000000
  ) {
    return rejectWithCleanup(
      400,
      'El kilometraje debe ser un entero en kilometros entre 0 y 2,000,000.',
    );
  }

  if (!Number.isFinite(numericBasePrice) || numericBasePrice <= 0) {
    return rejectWithCleanup(400, 'El precio base debe ser un numero mayor que 0.');
  }

  if (!Number.isFinite(numericMinIncrement) || numericMinIncrement <= 0) {
    return rejectWithCleanup(400, 'El incremento minimo debe ser un numero mayor que 0.');
  }

  if (colorValue.length > 80) {
    return rejectWithCleanup(400, 'El color debe contener como maximo 80 caracteres.');
  }

  const closingDate = new Date(endsAtValue);
  if (Number.isNaN(closingDate.getTime()) || closingDate <= new Date()) {
    return rejectWithCleanup(400, 'La fecha de cierre debe ser posterior al momento actual.');
  }

  let s3UploadResults = [];
  if (useS3Storage && uploadedFiles.length) {
    try {
      s3UploadResults = await uploadFilesToS3(uploadedFiles);
    } catch (error) {
      console.error('Error subiendo imagenes a S3:', error);
      return res.status(500).json({ message: 'No se pudieron subir las imagenes.' });
    }
  }

  const imageLocations = useS3Storage
    ? s3UploadResults.map((item) => item.url)
    : uploadedFiles.map((file) => `uploads/${file.filename}`);

  let listingId;
  try {
    await sequelize.transaction(async (transaction) => {
      // ORM: creación de subasta con Sequelize usando una transacción.
      const createdAuction = await Auction.create(
        {
          sellerId: req.user.id,
          title,
          brand,
          model,
          color: colorValue,
          year: numericYear,
          kilometraje: numericKilometraje,
          basePrice: numericBasePrice,
          minIncrement: numericMinIncrement,
          description: description || '',
          status: 'active',
          endsAt: closingDate,
        },
        { transaction },
      );

      listingId = createdAuction.id;

      if (imageLocations.length) {
        const imagesPayload = imageLocations.map((pathValue) => ({
          auctionId: listingId,
          imagePath: pathValue,
        }));

        await AuctionImage.bulkCreate(imagesPayload, { transaction });
      }
    });

    return res.status(201).json({ id: listingId, images: imageLocations });
  } catch (error) {
    if (useS3Storage && s3UploadResults.length) {
      await deleteS3Objects(s3UploadResults.map((item) => item.key));
    } else {
      cleanupFiles(uploadedFiles);
    }
    console.error('Error creando subasta:', error);
    return res.status(500).json({ message: 'No se pudo publicar el vehiculo.' });
  }
});

router.post('/:id/bids', auth, async (req, res) => {
  const { id } = req.params;
  const amount = Number(req.body?.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Ingresa una oferta válida.' });
  }

  // ORM: validación y creación de oferta mediante Sequelize.
  const listingInstance = await Auction.findByPk(id);

  if (!listingInstance) {
    return res.status(404).json({ message: 'Subasta no encontrada' });
  }

  if (Number(listingInstance.sellerId) === Number(req.user.id)) {
    return res.status(400).json({ message: 'No puedes ofertar en tu propia subasta.' });
  }

  const now = new Date();
  const closingDate = new Date(listingInstance.endsAt ?? listingInstance.ends_at);
  if (listingInstance.status !== 'active' || closingDate <= now) {
    if (listingInstance.status === 'active' && closingDate <= now) {
      await listingInstance.update({ status: 'ended' });
    }
    return res.status(400).json({ message: 'La subasta ya finalizó.' });
  }

  const highest = await Bid.max('amount', { where: { auctionId: id } });
  const minAmount = Math.max(
    Number(listingInstance.basePrice ?? listingInstance.base_price ?? 0),
    Number(highest ?? 0),
  );
  if (amount <= minAmount) {
    const formattedMinAmount = Number(minAmount ?? 0).toLocaleString('es-GT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return res.status(400).json({ message: `La oferta debe superar Q${formattedMinAmount}.` });
  }

  const createdBid = await Bid.create({
    auctionId: id,
    bidderId: req.user.id,
    amount,
  });

  const bidWithUser = await Bid.findByPk(createdBid.id, {
    include: [{ model: User, as: 'bidder', attributes: ['id', 'nombre'] }],
  });

  const bidPlain = bidWithUser?.get({ plain: true }) ?? createdBid.get({ plain: true });
  const createdAtValue = bidPlain.createdAt ?? bidPlain.created_at ?? new Date().toISOString();

  const summaryRow = {
    id: listingInstance.id,
    status: listingInstance.status,
    ends_at: listingInstance.endsAt ?? listingInstance.ends_at,
    base_price: listingInstance.basePrice ?? listingInstance.base_price,
    min_increment: listingInstance.minIncrement ?? listingInstance.min_increment,
    highest_bid: amount,
    highest_bidder_id: req.user.id,
  };

  emitBidCreated({
    auctionId: id,
    bidRow: {
      id: bidPlain.id,
      amount: bidPlain.amount,
      created_at: createdAtValue,
      bidder_id: bidPlain.bidderId ?? bidPlain.bidder_id,
      nombre: bidPlain.bidder?.nombre,
    },
    summaryRow,
  });

  res.status(201).json({ ok: true });
});

export default router;
