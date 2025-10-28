import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let ioInstance = null;

const AUCTION_ROOM_PREFIX = 'auction:';
const LISTINGS_ROOM = 'listings:active';

function parseCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return {};
  }

  return cookieHeader.split(';').reduce((acc, pair) => {
    const [rawKey, ...rawValue] = pair.split('=');
    if (!rawKey) {
      return acc;
    }
    const key = rawKey.trim();
    const value = rawValue.join('=').trim();
    if (key && value) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {});
}

function extractToken(handshake) {
  const cookies = parseCookies(handshake?.headers?.cookie);
  return cookies?.token;
}

function validateAuctionId(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }
  return String(numeric);
}

export function initRealtime(httpServer) {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_ORIGIN,
      credentials: true,
    },
  });

  ioInstance.use((socket, next) => {
    try {
      const token = extractToken(socket.handshake);
      if (!token) {
        return next(new Error('UNAUTHORIZED'));
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.user = {
        id: payload.id,
        email: payload.email,
        role: payload.role,
      };
      socket.data.subscriptions = new Set();
      return next();
    } catch (error) {
      return next(new Error('UNAUTHORIZED'));
    }
  });

  ioInstance.on('connection', (socket) => {
    socket.on('subscribe-auction', (rawAuctionId) => {
      const auctionId = validateAuctionId(rawAuctionId);
      if (!auctionId) {
        socket.emit('subscription-error', { reason: 'INVALID_AUCTION' });
        return;
      }

      const room = `${AUCTION_ROOM_PREFIX}${auctionId}`;
      socket.join(room);
      socket.data.subscriptions.add(room);
    });

    socket.on('unsubscribe-auction', (rawAuctionId) => {
      const auctionId = validateAuctionId(rawAuctionId);
      if (!auctionId) {
        return;
      }
      const room = `${AUCTION_ROOM_PREFIX}${auctionId}`;
      socket.leave(room);
      socket.data.subscriptions.delete(room);
    });

    socket.on('subscribe-listings', () => {
      socket.join(LISTINGS_ROOM);
    });

    socket.on('unsubscribe-listings', () => {
      socket.leave(LISTINGS_ROOM);
    });

    socket.on('disconnect', () => {
      socket.data.subscriptions?.clear();
    });
  });

  return ioInstance;
}

export function getIO() {
  if (!ioInstance) {
    throw new Error('Realtime server not initialized');
  }
  return ioInstance;
}

export function getAuctionRoom(auctionId) {
  const validId = validateAuctionId(auctionId);
  if (!validId) {
    throw new Error('Invalid auction id for room');
  }
  return `${AUCTION_ROOM_PREFIX}${validId}`;
}

export function getListingsRoom() {
  return LISTINGS_ROOM;
}
