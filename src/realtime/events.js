import { getAuctionRoom, getIO, getListingsRoom } from './socket.js';

function normalizeBid(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    amount: Number(row.amount),
    createdAt: row.created_at,
    bidderId:
      row.bidder_id !== null && row.bidder_id !== undefined
        ? String(row.bidder_id)
        : null,
  };
}

function normalizeSummary(row) {
  if (!row) {
    return null;
  }

  const payload = {
    auctionId: String(row.auction_id ?? row.id),
    status: row.status ?? null,
    highestBid: row.highest_bid !== undefined && row.highest_bid !== null ? Number(row.highest_bid) : null,
    highestBidderId:
      row.highest_bidder_id !== null && row.highest_bidder_id !== undefined
        ? String(row.highest_bidder_id)
        : null,
    basePrice: row.base_price !== undefined && row.base_price !== null ? Number(row.base_price) : null,
    minIncrement: row.min_increment !== undefined && row.min_increment !== null ? Number(row.min_increment) : null,
    endsAt: row.ends_at ?? null,
    updatedAt: new Date().toISOString(),
  };

  return payload;
}

function broadcastAuctionUpdate(summary) {
  if (!summary?.auctionId) {
    return;
  }

  const io = getIO();
  const room = getAuctionRoom(summary.auctionId);
  const listingsRoom = getListingsRoom();

  io.to(room).emit('auction:updated', summary);
  io.to(listingsRoom).emit('auction:updated', summary);
}

export function emitBidCreated({ auctionId, bidRow, summaryRow }) {
  const bid = normalizeBid(bidRow);
  const summary = normalizeSummary({ ...summaryRow, auction_id: auctionId });

  broadcastAuctionUpdate(summary);

  if (!bid) {
    return;
  }

  const io = getIO();
  const room = getAuctionRoom(auctionId);

  io.to(room).emit('bid:created', {
    auctionId: String(auctionId),
    bid,
    summary,
  });
}

export function emitAuctionEnded({ auctionId, summaryRow }) {
  const summary = normalizeSummary({ ...summaryRow, auction_id: auctionId });

  broadcastAuctionUpdate(summary);

  const io = getIO();
  const room = getAuctionRoom(auctionId);
  const listingsRoom = getListingsRoom();

  io.to(room).emit('auction:ended', summary);
  io.to(listingsRoom).emit('auction:ended', summary);
}
