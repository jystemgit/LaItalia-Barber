CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE pending_users (
  email text PRIMARY KEY,
  password_hash text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER','ADMIN')),
  email_verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);

CREATE TABLE password_resets (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rate_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  reset_at timestamptz NOT NULL
);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 480),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE business_hours (
  weekday integer PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
  opens_at time,
  closes_at time,
  slot_minutes integer NOT NULL DEFAULT 90 CHECK (slot_minutes BETWEEN 15 AND 480),
  CHECK ((opens_at IS NULL AND closes_at IS NULL) OR
         (opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at))
);

CREATE TABLE business_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN ('CLOSED','BLOCK','SPECIAL')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX exceptions_period_idx ON business_exceptions USING gist (tstzrange(starts_at, ends_at, '[)'));

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('PENDING','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW')),
  calendar_sync_status text NOT NULL DEFAULT 'DISCONNECTED' CHECK (calendar_sync_status IN ('DISCONNECTED','PENDING','SYNCED','FAILED')),
  google_calendar_event_id text UNIQUE,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CONSTRAINT no_overlapping_bookings EXCLUDE USING gist
    (tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (status IN ('PENDING','CONFIRMED'))
);
CREATE INDEX bookings_date_idx ON bookings(starts_at);
CREATE INDEX bookings_customer_idx ON bookings(customer_id, starts_at DESC);
CREATE INDEX bookings_status_idx ON bookings(status, starts_at);

CREATE TABLE booking_events (
  id bigserial PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reviews_customer_idx ON reviews(customer_id);

CREATE TABLE google_calendar_connections (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  refresh_token_encrypted text NOT NULL,
  calendar_id text NOT NULL DEFAULT 'primary',
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE oauth_states (
  state_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

INSERT INTO business_hours (weekday, opens_at, closes_at, slot_minutes) VALUES
  (0, NULL, NULL, 90),
  (1, '10:30', '16:30', 90),
  (2, '10:30', '16:30', 90),
  (3, '10:30', '16:30', 90),
  (4, '10:30', '16:30', 90),
  (5, '10:30', '16:30', 90),
  (6, '10:30', '16:30', 90);

INSERT INTO services (name, description, duration_minutes) VALUES
  ('Corte', 'Corte personalizado y asesorado según tu estilo', 90),
  ('Barba', 'Diseño y cuidado de barba con atención al detalle', 90),
  ('Corte + barba', 'Una experiencia completa para renovar tu estilo', 90);