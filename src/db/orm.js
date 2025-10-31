import { Sequelize, DataTypes } from 'sequelize';

const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

export const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  dialect: 'mysql',
  logging: false,
  define: {
    underscored: true,
  },
});

export const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    nombre: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    apellidos: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    genero: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    telefono: {
      type: DataTypes.STRING(30),
    },
    email: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true,
    },
    passwordHash: {
      field: 'password_hash',
      type: DataTypes.STRING(255),
      allowNull: false,
    },
  },
  {
    tableName: 'users',
    timestamps: false,
  },
);

export const Auction = sequelize.define(
  'Auction',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    sellerId: {
      field: 'seller_id',
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    brand: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    model: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    basePrice: {
      field: 'base_price',
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    minIncrement: {
      field: 'min_increment',
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    endsAt: {
      field: 'ends_at',
      type: DataTypes.DATE,
      allowNull: false,
    },
    createdAt: {
      field: 'created_at',
      type: DataTypes.DATE,
    },
  },
  {
    tableName: 'auctions',
    timestamps: false,
  },
);

export const Bid = sequelize.define(
  'Bid',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    auctionId: {
      field: 'auction_id',
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    bidderId: {
      field: 'bidder_id',
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    createdAt: {
      field: 'created_at',
      type: DataTypes.DATE,
    },
  },
  {
    tableName: 'bids',
    timestamps: false,
  },
);

export const AuctionImage = sequelize.define(
  'AuctionImage',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    auctionId: {
      field: 'auction_id',
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    imagePath: {
      field: 'image_path',
      type: DataTypes.STRING(500),
      allowNull: false,
    },
  },
  {
    tableName: 'auction_images',
    timestamps: false,
  },
);

User.hasMany(Auction, { foreignKey: 'seller_id', as: 'auctions' });
Auction.belongsTo(User, { foreignKey: 'seller_id', as: 'seller' });

Auction.hasMany(Bid, { foreignKey: 'auction_id', as: 'bids' });
Bid.belongsTo(Auction, { foreignKey: 'auction_id', as: 'auction' });

User.hasMany(Bid, { foreignKey: 'bidder_id', as: 'bids' });
Bid.belongsTo(User, { foreignKey: 'bidder_id', as: 'bidder' });

Auction.hasMany(AuctionImage, { foreignKey: 'auction_id', as: 'images' });
AuctionImage.belongsTo(Auction, { foreignKey: 'auction_id', as: 'auction' });

export const ensureDatabaseConnection = async () => {
  await sequelize.authenticate();
};
