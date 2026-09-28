"use client";

import { useEffect, useState } from "react";

type BookingStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
type CalendarSyncStatus = "DISCONNECTED" | "PENDING" | "SYNCED" | "FAILED";
type Booking = {
  id: string;
  starts_at: string;
  status: BookingStatus;
  service_name: string;
  duration_minutes: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  calendar_sync_status: CalendarSyncStatus;
};
type StatusFilter = BookingStatus | "ALL";
type Transition = { status: BookingStatus; label: string; confirm?: string };

const filters: { status: StatusFilter; label: string }[] = [
  { status: "ALL", label: "Todas" },
  { status: "CONFIRMED", label: "Confirmadas" },
  { status: "PENDING", label: "Pendientes" },
  { status: "COMPLETED", label: "Completadas" },
  { status: "CANCELLED", label: "Canceladas" },
  { status: "NO_SHOW", label: "No show" },
];

const statusLabels: Record<BookingStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No show",
};

const calendarStatusLabels: Record<CalendarSyncStatus, string> = {
  SYNCED: "Sincronizado",
  PENDING: "Pendiente",
  FAILED: "Error de sincronización",
  DISCONNECTED: "Desconectado",
};

const transitions: Partial<Record<BookingStatus, Transition[]>> = {
  CONFIRMED: [
    { status: "COMPLETED", label: "Completar" },
    { status: "CANCELLED", label: "Cancelar", confirm: "¿Cancelar esta reserva?" },
    { status: "NO_SHOW", label: "Marcar no show", confirm: "¿Marcar esta reserva como no show?" },
  ],
  PENDING: [
    { status: "CONFIRMED", label: "Confirmar" },
    { status: "CANCELLED", label: "Cancelar", confirm: "¿Cancelar esta reserva?" },
  ],
};

async function fetchBookings() {
  const response = await fetch("/api/admin/bookings", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudieron cargar las reservas");
  return data.items as Booking[];
}

function localDateTime(value: string) {
  const date = new Date(value);
  return {
    date: date.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "medium" }),
    time: date.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" }),
  };
}

export default function AdminBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    fetchBookings()
      .then((items) => { if (active) setBookings(items); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "No se pudieron cargar las reservas"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function changeStatus(booking: Booking, transition: Transition) {
    if (transition.confirm && !window.confirm(transition.confirm)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: booking.id, status: transition.status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar la reserva");
      setBookings(await fetchBookings());
      setNotice("Estado de la reserva actualizado");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo actualizar la reserva");
    } finally {
      setBusy(false);
    }
  }

  async function retryCalendarSync(booking: Booking) {
    setSyncingId(booking.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/calendar-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: booking.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo reintentar la sincronización");

      const updatedBookings = await fetchBookings();
      setBookings(updatedBookings);
      const updatedBooking = updatedBookings.find((item) => item.id === booking.id);
      if (updatedBooking?.calendar_sync_status === "SYNCED") {
        setNotice("Evento sincronizado correctamente con Google Calendar.");
      } else if (updatedBooking?.calendar_sync_status === "FAILED") {
        setError("Google Calendar no pudo sincronizar el evento. La reserva sigue confirmada.");
      } else if (updatedBooking?.calendar_sync_status === "DISCONNECTED") {
        setError("Google Calendar está desconectado; no se pudo sincronizar el evento.");
      } else {
        setNotice(data.message || "Se solicitó el reintento; la sincronización sigue pendiente.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo reintentar la sincronización");
    } finally {
      setSyncingId(null);
    }
  }

  const visibleBookings = filter === "ALL" ? bookings : bookings.filter((booking) => booking.status === filter);

  return <section className="admin-bookings" aria-labelledby="admin-bookings-title">
    <div className="admin-bookings__heading">
      <div><p className="eyebrow">GESTIÓN DE TURNOS</p><h2 id="admin-bookings-title">Reservas</h2></div>
    </div>
    <div className="admin-bookings__filters" role="group" aria-label="Filtrar reservas por estado">
      {filters.map((item) => <button
        type="button"
        key={item.status}
        className={filter === item.status ? "is-active" : ""}
        aria-pressed={filter === item.status}
        onClick={() => setFilter(item.status)}
      >{item.label}</button>)}
    </div>
    {error && <p className="app-message" role="alert">{error}</p>}
    {notice && <p className="app-message" role="status">{notice}</p>}
    {loading && <p role="status">Cargando reservas...</p>}
    {!loading && !error && visibleBookings.length === 0 && <p className="admin-bookings__empty">{filter === "ALL" ? "No hay reservas." : "No hay reservas para este estado."}</p>}
    {!loading && visibleBookings.map((booking) => {
      const { date, time } = localDateTime(booking.starts_at);
      const bookingTransitions = transitions[booking.status] ?? [];
      return <article className="admin-booking" key={booking.id}>
        <div className="admin-booking__main">
          <div className="admin-booking__date"><strong>{date}</strong><span>{time}</span></div>
          <div className="admin-booking__customer"><strong>{booking.first_name} {booking.last_name}</strong><a href={`mailto:${booking.email}`}>{booking.email}</a><a href={`tel:${booking.phone}`}>{booking.phone}</a></div>
          <div className="admin-booking__service"><strong>{booking.service_name}</strong><span>{booking.duration_minutes} min</span></div>
          <span className={`booking-status booking-status--${booking.status.toLowerCase()}`}>{statusLabels[booking.status]}</span>
        </div>
        <div className="admin-booking__sync">
          <span className={`calendar-sync-status is-${booking.calendar_sync_status.toLowerCase()}`}>
            Google Calendar · {calendarStatusLabels[booking.calendar_sync_status]}
          </span>
          {booking.calendar_sync_status === "FAILED" && <button
            type="button"
            disabled={busy || syncingId !== null}
            onClick={() => void retryCalendarSync(booking)}
          >{syncingId === booking.id ? "Reintentando..." : "Reintentar"}</button>}
        </div>
        {!!bookingTransitions.length && <div className="admin-booking__actions">
          {bookingTransitions.map((transition) => <button
            type="button"
            key={transition.status}
            disabled={busy || syncingId !== null}
            onClick={() => void changeStatus(booking, transition)}
          >{transition.label}</button>)}
        </div>}
      </article>;
    })}
  </section>;
}
