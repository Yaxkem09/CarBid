-- Migration: add min_increment column to auctions table
ALTER TABLE auctions
  ADD COLUMN min_increment DECIMAL(12,2) NOT NULL DEFAULT 1.00 AFTER base_price;
