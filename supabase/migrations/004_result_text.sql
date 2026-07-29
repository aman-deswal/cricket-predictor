-- Add result_text to prediction_results
-- Stores the human-readable match result e.g. "India won by 47 runs"
-- Run in Supabase SQL Editor

ALTER TABLE prediction_results
  ADD COLUMN IF NOT EXISTS result_text TEXT;
