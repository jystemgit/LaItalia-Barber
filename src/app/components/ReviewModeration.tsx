"use client";

import { useEffect, useState } from "react";

type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
type Review = { id: string; rating: number; comment: string; status: ReviewStatus; created_at: string; email: string; first_name: string; last_name: string };
const filters: { status: ReviewStatus | "ALL"; label: string }[] = [
  { status: "PENDING", label: "Pendientes" },
  { status: "APPROVED", label: "Publicadas" },
  { status: "REJECTED", label: "No aprobadas" },
  { status: "ALL", label: "Todas" },
];

export default function ReviewModeration() {
  const [status, setStatus] = useState<ReviewStatus | "ALL">("PENDING");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const query = status === "ALL" ? "" : `?status=${status}`;
    const response = await fetch(`/api/admin/reviews${query}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudieron cargar las reseñas");
    setReviews(data.items);
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/reviews${status === "ALL" ? "" : `?status=${status}`}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudieron cargar las reseñas");
        if (active) setReviews(data.items);
      })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Error de servidor"); });
    return () => { active = false; };
  }, [status]);

  async function mutate(id: string, method: "PATCH" | "DELETE", nextStatus?: ReviewStatus) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/reviews", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(method === "PATCH" ? { id, status: nextStatus } : { id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar la reseña");
      setMessage(data.message);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error de servidor"); }
    finally { setBusy(false); }
  }

  return <section className="review-moderation" aria-labelledby="moderation-title">
    <div className="review-moderation__heading"><div><p className="eyebrow">MODERACIÓN</p><h2 id="moderation-title">Reseñas de clientes</h2></div></div>
    <div className="review-moderation__filters" role="group" aria-label="Filtrar reseñas">
      {filters.map((filter) => <button key={filter.status} type="button" className={status === filter.status ? "is-active" : ""} onClick={() => { setStatus(filter.status); setMessage(""); }}>{filter.label}</button>)}
    </div>
    {message && <p className="app-message" role="status">{message}</p>}
    {!reviews.length && <p>{status === "PENDING" ? "No hay reseñas pendientes." : "No hay reseñas en este filtro."}</p>}
    {reviews.map((review) => <article className="app-row review-moderation__item" key={review.id}>
      <div><strong>{review.first_name} {review.last_name} · {review.rating}/5</strong><span>{review.email}</span></div>
      <p>{review.comment || "Sin comentario"}</p>
      <small>{new Date(review.created_at).toLocaleDateString("es-AR", { dateStyle: "medium" })} · {review.status}</small>
      <div className="app-actions">
        {review.status !== "APPROVED" && <button type="button" disabled={busy} onClick={() => void mutate(review.id, "PATCH", "APPROVED")}>Publicar</button>}
        {review.status !== "REJECTED" && <button type="button" disabled={busy} onClick={() => void mutate(review.id, "PATCH", "REJECTED")}>No aprobar</button>}
        <button type="button" disabled={busy} onClick={() => { if (confirm("¿Eliminar esta reseña definitivamente?")) void mutate(review.id, "DELETE"); }}>Eliminar</button>
      </div>
    </article>)}
  </section>;
}
