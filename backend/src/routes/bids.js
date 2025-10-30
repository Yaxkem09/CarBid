import { Router } from 'express';
import { Bid, Auction, sequelize } from '../db/orm.js';
import { auth } from '../middleware/auth.js';

const router = Router();

router.get('/mine', auth, async (req, res) => {
  // ORM: consultas de pujas del usuario con Sequelize.
  const bids = await Bid.findAll({
    where: { bidderId: req.user.id },
    include: [
      {
        model: Auction,
        as: 'auction',
        attributes: ['id', 'title', 'status', 'endsAt'],
      },
    ],
    order: [['createdAt', 'DESC']],
  });

  const bidsPlain = bids.map((bid) => bid.get({ plain: true }));
  const auctionIds = Array.from(
    new Set(
      bidsPlain
        .map((bid) => bid.auction?.id)
        .filter((auctionId) => auctionId !== undefined && auctionId !== null),
    ),
  );

  const highestByAuction =
    auctionIds.length > 0
      ? await Bid.findAll({
          where: { auctionId: auctionIds },
          attributes: [
            'auctionId',
            [sequelize.fn('MAX', sequelize.col('amount')), 'highestAmount'],
          ],
          group: ['auction_id'],
          raw: true,
        })
      : [];

  const highestMap = new Map(
    highestByAuction.map((row) => [
      row.auctionId ?? row.auction_id,
      Number(row.highestAmount ?? 0),
    ]),
  );

  res.json(
    bidsPlain.map((bid) => {
      const auction = bid.auction ?? {};
      const highestAmount = highestMap.get(auction.id) ?? null;
      let result = 'En curso';

      if (auction.status === 'ended') {
        result =
          highestAmount !== null && Number(bid.amount) === Number(highestAmount)
            ? 'Ganada'
            : 'No ganada';
      }

      return {
        id: bid.id,
        amount: Number(bid.amount),
        createdAt: bid.createdAt ?? bid.created_at,
        listingId: auction.id,
        bidderId: bid.bidderId ?? bid.bidder_id,
        userId: bid.bidderId ?? bid.bidder_id,
        listingTitle: auction.title,
        listingStatus: auction.status,
        listingEndsAt: auction.endsAt ?? auction.ends_at,
        result,
      };
    }),
  );
});

export default router;
