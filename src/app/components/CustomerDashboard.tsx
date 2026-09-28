"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type User = { first_name: string; last_name: string; email: string; phone: string };
type Booking = { id: string; starts_at: string; ends_at: string; status: string; calendar_sync_status: string; service_name: string };
type Review = { id: string; booking_id: string; rating: number; comment: string; status: string };

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Error de servidor");
  return data;
}

export default function CustomerDashboard({ user }: { user: User }) {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState(user);

  async function refresh() {
    try {
      const [bookingData, reviewData] = await Promise.all([request("/api/bookings"), request("/api/reviews")]);
      setBookings(bookingData.bookings);
      setReviews(reviewData.reviews);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error de servidor"); }
  }

  useEffect(() => {
    Promise.all([request("/api/bookings"), request("/api/reviews")])
      .then(([bookingData, reviewData]) => { setBookings(bookingData.bookings); setReviews(reviewData.reviews); })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Error de servidor"));
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const data = await request("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName: profile.first_name, lastName: profile.last_name, phone: profile.phone }) });
      setMessage(data.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo actualizar"); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const data = await request("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      form.reset();
      setMessage(data.message);
      router.push("/ingresar");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo cambiar la contraseña"); }
  }

  async function cancel(id: string) {
    if (!confirm("¿Cancelar este turno?")) return;
    try {
      await request(`/api/bookings/${id}`, { method: "PATCH" });
      await refresh();
      setMessage("Reserva cancelada");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo cancelar"); }
  }

  async function addReview(event: FormEvent<HTMLFormElement>, bookingId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      await request("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId, rating: Number(data.rating), comment: data.comment }) });
      await refresh();
      setMessage("Reseña enviada para moderación");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo enviar la reseña"); }
  }

  async function logout() {
    await request("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    router.push("/");
    router.refresh();
  }

  return <main className="app-shell">
    <header className="app-top"><Link href="/">L’ITALIA BARBER</Link><button type="button" onClick={logout}>Cerrar sesión</button></header>
    <h1>Mi cuenta</h1><p>{user.email}</p>
    {message && <p className="app-message" role="status">{message}</p>}
    <div className="app-columns">
      <section className="app-panel"><h2>Mis datos</h2><form className="app-form" onSubmit={saveProfile}>
        <label>Nombre<input value={profile.first_name} onChange={(event) => setProfile({ ...profile, first_name: event.target.value })} required /></label>
        <label>Apellido<input value={profile.last_name} onChange={(event) => setProfile({ ...profile, last_name: event.target.value })} required /></label>
        <label>Teléfono<input type="tel" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} required /></label>
        <button className="button button--reserve" type="submit">Guardar datos</button></form>
        <h2>Seguridad</h2><form className="app-form" onSubmit={changePassword}>
          <label>Contraseña actual<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
          <label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
          <button className="button button--reserve" type="submit">Cambiar contraseña</button></form>
      </section>
      <section className="app-panel"><div className="app-panel-head"><h2>Mis reservas</h2><Link href="/#reservas">Reservar turno</Link></div>
        {!bookings.length && <p>Todavía no tenés reservas</p>}
        {bookings.map((booking) => <article className="app-row" key={booking.id}>
          <strong>{booking.service_name}</strong><span>{new Date(booking.starts_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "medium", timeStyle: "short" })}</span>
          <span>{booking.status} · {booking.calendar_sync_status === "FAILED" ? "Sincronización con calendario pendiente" : ""}</span>
          {(booking.status === "PENDING" || booking.status === "CONFIRMED") && new Date(booking.starts_at) > new Date() && <button type="button" onClick={() => cancel(booking.id)}>Cancelar</button>}
          {booking.status === "COMPLETED" && !reviews.some((review) => review.booking_id === booking.id) && <form className="app-form" onSubmit={(event) => addReview(event, booking.id)}>
            <label>Calificación<select name="rating" required>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating}</option>)}</select></label>
            <label>Comentario<textarea name="comment" maxLength={2000} /></label><button type="submit">Enviar reseña</button></form>}
        </article>)}
        <h2>Mis reseñas</h2>{!reviews.length && <p>Todavía no escribiste reseñas</p>}
        {reviews.map((review) => <p key={review.id}>{review.rating}/5 · {review.comment} · {review.status}</p>)}
      </section>
    </div>
  </main>;
}