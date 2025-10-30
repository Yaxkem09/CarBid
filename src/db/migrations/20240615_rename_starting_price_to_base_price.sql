-- Migration: rename starting_price column to base_price in auctions table
-- Run this on environments that still use the old column name.
ALTER TABLE auctions
  CHANGE COLUMN starting_price base_price DECIMAL(12,2) NOT NULL;
