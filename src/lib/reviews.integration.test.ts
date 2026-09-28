import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "./db";
import { randomToken } from "./security";
import { createCustomerReview, deleteCustomerReview, listCustomerReviews, listPublicReviews, moderateReview, updateCustomerReview } from "./reviews";

test("PostgreSQL: reviews se limitan a reservas propias y publican solo aprobadas", { skip: !process.env.DATABASE_URL && "DATABASE_URL no configurada" }, async () => {
  const sql = db();
  const firstEmail = `review-${randomToken().slice(0, 12)}@example.test`;
  const secondEmail = `review-${randomToken().slice(0, 12)}@example.test`;
  let firstId: string | undefined;
  let secondId: string | undefined;
  try {
    const firstUser = await sql`INSERT INTO users (email, password_hash) VALUES (${firstEmail}, 'integration-hash') RETURNING id`;
    const firstUserId = firstUser[0].id as string;
    firstId = firstUserId;
    const secondUser = await sql`INSERT INTO users (email, password_hash) VALUES (${secondEmail}, 'integration-hash') RETURNING id`;
    const secondUserId = secondUser[0].id as string;
    secondId = secondUserId;
    await sql`INSERT INTO profiles (user_id, first_name, last_name, phone) VALUES (${firstUserId}, 'Review', 'Uno', '12345678'), (${secondUserId}, 'Review', 'Dos', '12345678')`;
    const service = await sql`SELECT id FROM services WHERE name = 'Corte' LIMIT 1`;
    assert.ok(service.length);
    const firstBooking = await sql`INSERT INTO bookings (customer_id, service_id, starts_at, ends_at, status) VALUES (${firstUserId}, ${service[0].id}, now() - interval '2 hours', now() - interval '1 hour', 'COMPLETED') RETURNING id`;
    const secondBooking = await sql`INSERT INTO bookings (customer_id, service_id, starts_at, ends_at, status) VALUES (${secondUserId}, ${service[0].id}, now() - interval '4 hours', now() - interval '3 hours', 'COMPLETED') RETURNING id`;

    const pending = await createCustomerReview(firstUserId, firstBooking[0].id, { rating: 3, comment: "Pendiente" });
    assert.ok(pending);
    assert.equal(pending.status, "PENDING");
    assert.equal(await createCustomerReview(firstId!, firstBooking[0].id, { rating: 5, comment: "Duplicada" }), null);
    assert.equal(await updateCustomerReview(secondUserId, pending.id, { rating: 1, comment: "Ajena" }), null);
    assert.equal(await deleteCustomerReview(secondUserId, pending.id), false);

    const updated = await updateCustomerReview(firstUserId, pending.id, { rating: 4, comment: "Editada" });
    assert.equal(updated?.status, "PENDING");
    assert.equal(updated?.comment, "Editada");
    const approved = await createCustomerReview(secondUserId, secondBooking[0].id, { rating: 5, comment: "Aprobada" });
    assert.ok(approved);
    assert.ok(await moderateReview(approved.id, "APPROVED"));

    const ownReviews = await listCustomerReviews(firstUserId);
    assert.equal(ownReviews.length, 1);
    const publicReviews = await listPublicReviews();
    assert.ok(publicReviews.reviews.some((review) => review.id === approved.id));
    assert.ok(!publicReviews.reviews.some((review) => review.id === pending.id));
    const expected = await sql`SELECT count(*)::int AS count, COALESCE(round(avg(rating)::numeric, 1), 0)::float AS average FROM reviews WHERE status = 'APPROVED'`;
    assert.equal(publicReviews.count, expected[0].count);
    assert.equal(publicReviews.average, expected[0].average);
    assert.ok(await moderateReview(approved.id, "REJECTED"));
    assert.ok(!((await listPublicReviews()).reviews.some((review) => review.id === approved.id)));
  } finally {
    if (firstId || secondId) {
      const ids = [firstId || "00000000-0000-0000-0000-000000000000", secondId || "00000000-0000-0000-0000-000000000000"];
      await sql`DELETE FROM reviews WHERE customer_id IN ${sql(ids)}`;
      await sql`DELETE FROM bookings WHERE customer_id IN ${sql(ids)}`;
      await sql`DELETE FROM users WHERE id IN ${sql(ids)}`;
    }
  }
});
