CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  apellidos VARCHAR(150) NOT NULL,
  genero ENUM('M', 'F', 'O') NOT NULL,
  telefono VARCHAR(20),
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auctions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  seller_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  brand VARCHAR(120) NOT NULL,
  model VARCHAR(120) NOT NULL,
  color VARCHAR(80),
  year SMALLINT NOT NULL,
  kilometraje INT UNSIGNED NOT NULL DEFAULT 0,
  base_price DECIMAL(12,2) NOT NULL,
  min_increment DECIMAL(12,2) NOT NULL DEFAULT 1.00,
  description TEXT,
  status ENUM('draft', 'active', 'ended') NOT NULL DEFAULT 'draft',
  ends_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (seller_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bids (
  id INT AUTO_INCREMENT PRIMARY KEY,
  auction_id INT NOT NULL,
  bidder_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (auction_id) REFERENCES auctions(id),
  FOREIGN KEY (bidder_id) REFERENCES users(id)
);

-- Images per auction (used by frontend listings to render thumbnails)
CREATE TABLE IF NOT EXISTS auction_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  auction_id INT NOT NULL,
  image_path VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (auction_id) REFERENCES auctions(id)
);
