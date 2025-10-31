import cron from 'node-cron';
import { Op } from 'sequelize';
import { Auction, Bid, sequelize } from '../db/orm.js';
import { emitAuctionEnded } from '../realtime/events.js';

/**
 * Schedules the recurring task that marks expired auctions as ended.
 */
export const startAuctionStatusJob = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const summaries = await sequelize.transaction(async (transaction) => {
        // ORM: cierre automático de subastas usando Sequelize.
        const expiredAuctions = await Auction.findAll({
          where: {
            status: 'active',
            endsAt: { [Op.lt]: new Date() },
          },
          attributes: ['id', 'endsAt', 'basePrice', 'minIncrement'],
          lock: transaction.LOCK.UPDATE,
          transaction,
        });

        if (!expiredAuctions.length) {
          return [];
        }

        const expiredPlain = expiredAuctions.map((auction) => auction.get({ plain: true }));
        const auctionIds = expiredPlain.map((auction) => auction.id);

        await Auction.update(
          { status: 'ended' },
          {
            where: { id: auctionIds },
            transaction,
          },
        );

        const topBids = await Bid.findAll({
          where: { auctionId: auctionIds },
          attributes: ['auctionId', 'bidderId', 'amount'],
          order: [
            ['auctionId', 'ASC'],
            ['amount', 'DESC'],
            ['createdAt', 'ASC'],
          ],
          transaction,
          raw: true,
        });

        const highestByAuction = new Map();
        for (const bid of topBids) {
          const auctionId = bid.auctionId ?? bid.auction_id;
          if (!highestByAuction.has(auctionId)) {
            highestByAuction.set(auctionId, bid);
          }
        }

        return expiredPlain.map((auction) => {
          const highest = highestByAuction.get(auction.id);
          return {
            id: auction.id,
            status: 'ended',
            ends_at: auction.endsAt ?? auction.ends_at,
            base_price: auction.basePrice ?? auction.base_price,
            min_increment: auction.minIncrement ?? auction.min_increment,
            highest_bid: highest ? highest.amount : null,
            highest_bidder_id: highest
              ? highest.bidderId ?? highest.bidder_id
              : null,
          };
        });
      });

      if (!summaries.length) {
        return;
      }

      summaries.forEach((summary) => {
        emitAuctionEnded({
          auctionId: summary.id,
          summaryRow: summary,
        });
      });

      console.log(`Finalizadas automaticamente ${summaries.length} subastas.`);
    } catch (error) {
      console.error('Error al actualizar subastas:', error);
    }
  });
};
