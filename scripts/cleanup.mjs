import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL requerida");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const [pending, sessions, resets, states, limits] = await Promise.all([
    sql`DELETE FROM pending_users WHERE expires_at < now()`,
    sql`DELETE FROM sessions WHERE expires_at < now()`,
    sql`DELETE FROM password_resets WHERE expires_at < now()`,
    sql`DELETE FROM oauth_states WHERE expires_at < now()`,
    sql`DELETE FROM rate_limits WHERE reset_at < now()`,
  ]);
  console.log({ pending: pending.count, sessions: sessions.count, resets: resets.count, states: states.count, limits: limits.count });
} finally {
  await sql.end();
}