import { db } from "./db";

export type ReviewInput = { rating: number; comment: string };

export async function listCustomerReviews(customerId: string) {
  return db()`
    SELECT id, booking_id, rating, comment, status, created_at, updated_at
    FROM reviews WHERE customer_id = ${customerId} ORDER BY created_at DESC
  `;
}

export async function listPublicReviews() {
  const [reviews, summary] = await Promise.all([
    db()`
      SELECT r.id, r.rating, r.comment, r.created_at, p.first_name AS customer_name
      FROM reviews r JOIN profiles p ON p.user_id = r.customer_id
      WHERE r.status = 'APPROVED'
      ORDER BY r.created_at DESC LIMIT 24
    `,
    db()`
      SELECT count(*)::int AS count, COALESCE(round(avg(rating)::numeric, 1), 0)::float AS average
      FROM reviews WHERE status = 'APPROVED'
    `,
  ]);
  return { reviews, count: Number(summary[0].count), average: Number(summary[0].average) };
}

export async function createCustomerReview(customerId: string, bookingId: string, input: ReviewInput) {
  const rows = await db()`
    INSERT INTO reviews (customer_id, booking_id, rating, comment)
    SELECT ${customerId}, b.id, ${input.rating}, ${input.comment}
    FROM bookings b
    WHERE b.id = ${bookingId} AND b.customer_id = ${customerId} AND b.status = 'COMPLETED'
    ON CONFLICT (booking_id) DO NOTHING
    RETURNING id, booking_id, rating, comment, status, created_at, updated_at
  `;
  return rows[0] ?? null;
}

export async function updateCustomerReview(customerId: string, reviewId: string, input: ReviewInput) {
  const rows = await db()`
    UPDATE reviews SET rating = ${input.rating}, comment = ${input.comment}, status = 'PENDING', updated_at = now()
    WHERE id = ${reviewId} AND customer_id = ${customerId} AND status <> 'APPROVED'
    RETURNING id, booking_id, rating, comment, status, created_at, updated_at
  `;
  return rows[0] ?? null;
}

export async function deleteCustomerReview(customerId: string, reviewId: string) {
  const rows = await db()`DELETE FROM reviews WHERE id = ${reviewId} AND customer_id = ${customerId} RETURNING id`;
  return rows.length > 0;
}

export async function moderateReview(reviewId: string, status: "PENDING" | "APPROVED" | "REJECTED") {
  const rows = await db()`UPDATE reviews SET status = ${status}, updated_at = now() WHERE id = ${reviewId} RETURNING id, status`;
  return rows[0] ?? null;
}

export async function deleteReviewAsAdmin(reviewId: string) {
  const rows = await db()`DELETE FROM reviews WHERE id = ${reviewId} RETURNING id`;
  return rows.length > 0;
}