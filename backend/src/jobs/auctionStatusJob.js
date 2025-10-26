import cron from 'node-cron';
import { pool } from '../db/pool.js';

/**
 * Schedules the recurring task that marks expired auctions as ended.
 */
export const startAuctionStatusJob = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const [result] = await pool.query(`
        UPDATE auctions
        SET status = 'ended'
        WHERE status = 'active' AND ends_at < NOW()
      `);

      if (result?.affectedRows) {
        console.log(`✅ ${result.affectedRows} subastas finalizadas automáticamente.`);
      }
    } catch (error) {
      console.error('❌ Error al actualizar subastas:', error);
    }
  });
};
