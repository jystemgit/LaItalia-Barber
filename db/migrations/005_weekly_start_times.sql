ALTER TABLE business_hours
  ADD COLUMN start_times time[] NOT NULL DEFAULT '{}'::time[];

UPDATE business_hours
SET opens_at = '12:30', closes_at = '19:00', slot_minutes = 90,
    start_times = ARRAY['12:30', '14:30', '16:00', '17:30']::time[]
WHERE weekday IN (1, 3, 5);

UPDATE business_hours
SET opens_at = '10:30', closes_at = '17:30', slot_minutes = 90,
    start_times = ARRAY['10:30', '12:30', '14:30', '16:00']::time[]
WHERE weekday IN (2, 4, 6);

UPDATE business_hours
SET opens_at = NULL, closes_at = NULL, slot_minutes = 90,
    start_times = '{}'::time[]
WHERE weekday = 0;
