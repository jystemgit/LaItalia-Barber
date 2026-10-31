CREATE TABLE customer_no_shows (
  booking_id uuid PRIMARY KEY REFERENCES bookings(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL
);
CREATE INDEX customer_no_shows_customer_idx ON customer_no_shows(customer_id, recorded_at);
CREATE INDEX bookings_active_customer_end_idx ON bookings(customer_id, ends_at)
  WHERE status IN ('PENDING','CONFIRMED');

CREATE TABLE customer_suspensions (
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  no_show_count integer NOT NULL CHECK (no_show_count >= 5 AND no_show_count % 5 = 0),
  starts_at timestamptz NOT NULL,
  suspended_until timestamptz NOT NULL,
  PRIMARY KEY (customer_id, no_show_count),
  CHECK (suspended_until > starts_at)
);
CREATE INDEX customer_suspensions_active_idx ON customer_suspensions(customer_id, suspended_until DESC);

INSERT INTO customer_no_shows (booking_id, customer_id, recorded_at)
SELECT b.id, b.customer_id,
  COALESCE((SELECT min(event.created_at) FROM booking_events event WHERE event.booking_id = b.id AND event.event = 'NO_SHOW'), b.updated_at)
FROM bookings b
WHERE b.status = 'NO_SHOW'
  OR EXISTS (
    SELECT 1 FROM booking_events event
    WHERE event.booking_id = b.id AND event.event = 'NO_SHOW'
  );

WITH ranked_no_shows AS (
  SELECT customer_id, recorded_at,
    row_number() OVER (PARTITION BY customer_id ORDER BY recorded_at, booking_id)::integer AS no_show_count
  FROM customer_no_shows
)
INSERT INTO customer_suspensions (customer_id, no_show_count, starts_at, suspended_until)
SELECT customer_id, no_show_count, recorded_at, recorded_at + interval '3 months'
FROM ranked_no_shows
WHERE no_show_count % 5 = 0;