import cron from 'node-cron';
import { pool } from '../db/pool.js';
import { emitAuctionEnded } from '../realtime/events.js';

/**
 * Schedules the recurring task that marks expired auctions as ended.
 */
export const startAuctionStatusJob = () => {
  cron.schedule('* * * * *', async () => {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [expiredRows] = await connection.query(`
        SELECT id
        FROM auctions
        WHERE status = 'active' AND ends_at < NOW()
        FOR UPDATE
      `);

      if (!expiredRows.length) {
        await connection.commit();
        return;
      }

      const auctionIds = expiredRows.map((row) => row.id);
      const placeholders = auctionIds.map(() => '?').join(', ');

      await connection.query(
        `UPDATE auctions
         SET status = 'ended'
         WHERE id IN (${placeholders})`,
        auctionIds,
      );

      const [summaries] = await connection.query(
        `SELECT
            a.id,
            a.status,
            a.ends_at,
            a.base_price,
            a.min_increment,
            (
              SELECT MAX(b.amount)
              FROM bids b
              WHERE b.auction_id = a.id
            ) AS highest_bid,
            (
              SELECT b2.bidder_id
              FROM bids b2
              WHERE b2.auction_id = a.id
              ORDER BY b2.amount DESC, b2.created_at ASC
              LIMIT 1
            ) AS highest_bidder_id,
            (
              SELECT u.nombre
              FROM bids b3
              LEFT JOIN users u ON u.id = b3.bidder_id
              WHERE b3.auction_id = a.id
              ORDER BY b3.amount DESC, b3.created_at ASC
              LIMIT 1
            ) AS highest_bidder_name
         FROM auctions a
         WHERE a.id IN (${placeholders})`,
        auctionIds,
      );

      await connection.commit();

      summaries.forEach((summary) => {
        emitAuctionEnded({
          auctionId: summary.id,
          summaryRow: {
            ...summary,
            status: 'ended',
          },
        });
      });

      console.log(`Finalizadas automaticamente ${auctionIds.length} subastas.`);
    } catch (error) {
      await connection.rollback();
      console.error('Error al actualizar subastas:', error);
    } finally {
      connection.release();
    }
  });
};
