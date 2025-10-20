import { Router } from 'express';
import { pool } from '../db/pool.js';
import { auth } from '../middleware/auth.js';

const router = Router();

router.get('/mine', auth, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT b.id, b.amount, b.created_at, b.auction_id, b.bidder_id, a.title, a.status, a.ends_at,
            CASE
              WHEN a.status = 'ended' AND b.amount = (
                SELECT MAX(b2.amount) FROM bids b2 WHERE b2.auction_id = b.auction_id
              ) THEN 'Ganada'
              WHEN a.status = 'ended' THEN 'No ganada'
              ELSE 'En curso'
            END AS result
       FROM bids b
       JOIN auctions a ON a.id = b.auction_id
       WHERE b.bidder_id = ?
       ORDER BY b.created_at DESC`,
    [req.user.id]
  );

  res.json(
    rows.map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      createdAt: row.created_at,
      listingId: row.auction_id,
      bidderId: row.bidder_id,
      userId: row.bidder_id,
      listingTitle: row.title,
      listingStatus: row.status,
      listingEndsAt: row.ends_at,
      result: row.result,
      bidderId: row.bidder_id,
    }))
  );
});

export default router;
