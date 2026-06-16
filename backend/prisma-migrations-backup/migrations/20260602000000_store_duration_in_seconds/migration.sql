-- Change attendance entry duration from minutes to seconds
-- No schema changes needed, only application logic updated
-- All future clockOut operations will calculate duration in seconds (/ 1000ms)
-- Conversion in recalculateDailySummary: minutes = seconds / 60

-- Note: Existing records with duration in minutes should be converted if needed
-- For now, we accept the schema change and start storing in seconds
-- Historical records in minutes can be identified and converted separately
