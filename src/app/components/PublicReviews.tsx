"use client";

import { useEffect, useState } from "react";

type PublicReview = { id: string; rating: number; comment: string; created_at: string; customer_name: string };
type PublicReviewData = { reviews: PublicReview[]; count: number; average: number };

export default function PublicReviews() {
  const [data, setData] = useState<PublicReviewData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/reviews/public")
      .then(async (response) => {
        if (!response.ok) throw new Error("No disponible");
        return response.json() as Promise<PublicReviewData>;
      })
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  return <section className="public-reviews section-pad" id="resenas" aria-labelledby="reviews-title">
    <div className="section-heading">
      <div>
        <p className="eyebrow">OPINIONES REALES</p>
        <h2 id="reviews-title">Lo que dicen<br /><em>nuestros clientes</em></h2>
      </div>
      {data && data.count > 0 && <p className="public-reviews__summary"><strong>{data.average.toFixed(1)}</strong><span aria-label={`${data.average} de 5 estrellas`}>★★★★★</span><small>{data.count} {data.count === 1 ? "reseña" : "reseñas"}</small></p>}
    </div>
    {failed && <p className="public-reviews__empty">Las reseñas no están disponibles por el momento.</p>}
    {data?.count === 0 && <p className="public-reviews__empty">Todavía no hay reseñas publicadas.</p>}
    {!!data?.reviews.length && <div className="public-reviews__list">
      {data.reviews.map((review) => <article className="public-review" key={review.id}>
        <div className="public-review__rating" aria-label={`${review.rating} de 5 estrellas`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</div>
        <blockquote>{review.comment}</blockquote>
        <p>{review.customer_name} <time dateTime={review.created_at}>{new Date(review.created_at).toLocaleDateString("es-AR", { year: "numeric", month: "long" })}</time></p>
      </article>)}
    </div>}
  </section>;
}
