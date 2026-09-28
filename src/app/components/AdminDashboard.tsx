"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";

type Resource = "dashboard" | "bookings" | "customers" | "services" | "hours" | "exceptions" | "calendar" | "reviews";
type Item = Record<string, string | number | boolean | null>;
const tabs: { key: Resource; label: string }[] = [
  { key: "dashboard", label: "Resumen" }, { key: "bookings", label: "Reservas" },
  { key: "customers", label: "Clientes" }, { key: "services", label: "Servicios" },
  { key: "hours", label: "Horarios" }, { key: "exceptions", label: "Excepciones" },
  { key: "calendar", label: "Google Calendar" }, { key: "reviews", label: "Reseñas" },
];

async function api(resource: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/admin/${resource}`, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Resource>("dashboard");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api(tab).then((result) => { if (active) { setData(result); setLoading(false); } })
      .catch((error) => { if (active) { setMessage(error.message); setLoading(false); } });
    return () => { active = false; };
  }, [tab]);

  async function mutate(resource: string, method: string, body: unknown) {
    try {
      const result = await api(resource, method, body);
      setMessage(result.message || "Cambio guardado");
      setData(await api(tab));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error de servidor"); }
  }

  function submit(event: FormEvent<HTMLFormElement>, resource: string, method: string, transform?: (values: Record<string, FormDataEntryValue>) => unknown) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    void mutate(resource, method, transform ? transform(values) : values);
  }

  async function connect() {
    try { const result = await api("google", "POST", {}); window.location.assign(result.url); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo conectar"); }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    router.push("/"); router.refresh();
  }

  const items = (data.items || []) as Item[];
  const text = (value: unknown) => value == null ? "—" : String(value);
  const localDate = (value: unknown) => value ? new Date(String(value)).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "medium", timeStyle: "short" }) : "—";

  return <main className="app-shell admin-shell">
    <header className="app-top"><Link href="/">L’ITALIA BARBER</Link><span>Administración</span><button type="button" onClick={logout}>Cerrar sesión</button></header>
    <h1>Panel de gestión</h1>
    <nav className="admin-tabs" aria-label="Secciones administrativas">
      {tabs.map((item) => <button type="button" className={tab === item.key ? "is-active" : ""} onClick={() => { setTab(item.key); setMessage(""); setLoading(true); }} key={item.key}>{item.label}</button>)}
    </nav>
    {message && <p className="app-message" role="status">{message}</p>}
    {loading && <p>Cargando...</p>}
    {!loading && <section className="app-panel admin-content">
      {tab === "dashboard" && <>
        <h2>Agenda</h2>
        <div className="admin-metrics">{Object.entries((data.totals || {}) as Record<string, number>).map(([key, value]) => <p key={key}><strong>{value}</strong><span>{({ today: "Hoy", pending: "Pendientes", confirmed: "Confirmadas", customers: "Clientes" } as Record<string, string>)[key]}</span></p>)}</div>
        <h3>Próximos turnos</h3>{((data.upcoming || []) as Item[]).map((item) => <p className="app-row" key={text(item.id)}>{localDate(item.starts_at)} · {text(item.service_name)} · {text(item.first_name)} {text(item.last_name)} · {text(item.status)}</p>)}
      </>}
      {tab === "bookings" && <><h2>Reservas</h2>{items.map((item) => <article className="app-row" key={text(item.id)}>
        <strong>{localDate(item.starts_at)} · {text(item.service_name)}</strong>
        <span>{text(item.first_name)} {text(item.last_name)} · {text(item.email)} · {text(item.phone)}</span>
        <span>{text(item.status)} · Calendar: {text(item.calendar_sync_status)}</span>
        {(item.status === "CONFIRMED" || item.status === "PENDING") && <div className="app-actions">{["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"].map((status) => <button type="button" key={status} onClick={() => void mutate("bookings", "PATCH", { id: item.id, status })}>{status}</button>)}</div>}
        {(item.calendar_sync_status === "FAILED" || item.calendar_sync_status === "DISCONNECTED" || item.calendar_sync_status === "PENDING") && item.status === "CONFIRMED" && <button type="button" onClick={() => void mutate("calendar-sync", "POST", { id: item.id })}>Sincronizar calendario</button>}
      </article>)}</>}
      {tab === "customers" && <><h2>Clientes</h2>{items.map((item) => <p className="app-row" key={text(item.id)}>{text(item.first_name)} {text(item.last_name)} · {text(item.email)} · {text(item.phone)} · Reservas: {text(item.bookings)}</p>)}</>}
      {tab === "services" && <><h2>Servicios</h2>{items.map((item) => <form className="app-row app-form" key={text(item.id)} onSubmit={(event) => submit(event, "services", "PATCH", (values) => ({ ...values, id: item.id, durationMinutes: Number(values.durationMinutes), active: values.active === "on" }))}>
        <label>Nombre<input name="name" defaultValue={text(item.name)} required /></label><label>Descripción<input name="description" defaultValue={text(item.description)} required /></label>
        <label>Duración (min)<input name="durationMinutes" type="number" min="15" max="480" defaultValue={Number(item.duration_minutes)} required /></label>
        <label><input name="active" type="checkbox" defaultChecked={Boolean(item.active)} /> Activo</label><button type="submit">Guardar servicio</button>
      </form>)}
        <h3>Nuevo servicio</h3><form className="app-form" onSubmit={(event) => submit(event, "services", "POST", (values) => ({ ...values, durationMinutes: Number(values.durationMinutes) }))}>
          <label>Nombre<input name="name" required /></label><label>Descripción<input name="description" required /></label><label>Duración (min)<input name="durationMinutes" type="number" min="15" max="480" required /></label><button type="submit">Crear servicio</button>
        </form></>}
      {tab === "hours" && <><h2>Horarios</h2>{items.map((item) => <form className="app-row app-form" key={text(item.weekday)} onSubmit={(event) => submit(event, "hours", "PATCH", (values) => ({ weekday: item.weekday, opensAt: values.opensAt || null, closesAt: values.closesAt || null, slotMinutes: Number(values.slotMinutes) }))}>
        <strong>{["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][Number(item.weekday)]}</strong>
        <label>Abre<input name="opensAt" type="time" defaultValue={item.opens_at ? String(item.opens_at).slice(0, 5) : ""} /></label>
        <label>Cierra<input name="closesAt" type="time" defaultValue={item.closes_at ? String(item.closes_at).slice(0, 5) : ""} /></label>
        <label>Intervalo (min)<input name="slotMinutes" type="number" min="15" max="480" defaultValue={Number(item.slot_minutes)} required /></label><button type="submit">Guardar horario</button>
      </form>)}</>}
      {tab === "exceptions" && <><h2>Excepciones y bloqueos</h2>{items.map((item) => <p className="app-row" key={text(item.id)}>{text(item.kind)} · {localDate(item.starts_at)} a {localDate(item.ends_at)} · {text(item.note)} <button type="button" onClick={() => void mutate("exceptions", "DELETE", { id: item.id })}>Eliminar</button></p>)}
        <h3>Agregar excepción</h3><form className="app-form" onSubmit={(event) => submit(event, "exceptions", "POST", (values) => ({ startsAt: DateTime.fromISO(String(values.startsAt), { zone: "America/Argentina/Buenos_Aires" }).toUTC().toISO(), endsAt: DateTime.fromISO(String(values.endsAt), { zone: "America/Argentina/Buenos_Aires" }).toUTC().toISO(), kind: values.kind, note: values.note }))}>
          <label>Inicio<input name="startsAt" type="datetime-local" required /></label><label>Fin<input name="endsAt" type="datetime-local" required /></label>
          <label>Tipo<select name="kind"><option value="CLOSED">Cerrado</option><option value="BLOCK">Bloqueo</option><option value="SPECIAL">Horario especial</option></select></label>
          <label>Nota<input name="note" maxLength={250} /></label><button type="submit">Guardar excepción</button>
        </form></>}
      {tab === "reviews" && <><h2>Reseñas</h2>{items.map((item) => <article className="app-row" key={text(item.id)}><strong>{text(item.first_name)} {text(item.last_name)} · {text(item.rating)}/5</strong><p>{text(item.comment)}</p><span>{text(item.status)}</span><div className="app-actions">{["APPROVED", "REJECTED"].map((status) => <button key={status} type="button" onClick={() => void mutate("reviews", "PATCH", { id: item.id, status })}>{status}</button>)}</div></article>)}</>}
      {tab === "calendar" && <><h2>Google Calendar</h2><p>{data.connected ? `Conectado · ${text(data.connection)}` : "Desconectado. Sin bloqueo de calendario externo"}</p>
        {!data.connected ? <button type="button" onClick={connect}>Conectar Google Calendar</button> : <><label>Calendario<select value={String(data.connection)} onChange={(event) => void mutate("calendar", "PATCH", { calendarId: event.target.value })}>{((data.calendars || []) as { id: string; summary: string }[]).map((item) => <option value={item.id} key={item.id}>{item.summary}</option>)}</select></label><button type="button" onClick={() => { if (confirm("¿Desconectar Google Calendar?")) void mutate("google", "DELETE", {}); }}>Desconectar</button></>}
      </>}
    </section>}
  </main>;
}