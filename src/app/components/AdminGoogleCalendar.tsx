"use client";

import { useEffect, useState } from "react";

type Calendar = { id: string; summary: string };
type CalendarConnection = { connected: boolean; calendars: Calendar[]; connection: string | null };

async function readConnection(): Promise<CalendarConnection> {
  const response = await fetch("/api/admin/calendar", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo consultar Google Calendar");
  return data as CalendarConnection;
}

async function sendCalendarRequest(path: string, method: "POST" | "PATCH" | "DELETE", body: object) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data;
}

export default function AdminGoogleCalendar() {
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [selectedCalendar, setSelectedCalendar] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const url = new URL(window.location.href);
    const callbackStatus = url.searchParams.get("calendar");
    if (callbackStatus === "connected" || callbackStatus === "error") {
      const callbackMessage = callbackStatus === "connected"
        ? "Google Calendar se conectó correctamente."
        : "No se pudo completar la conexión con Google Calendar.";
      void Promise.resolve().then(() => { if (active) setNotice(callbackMessage); });
      url.searchParams.delete("calendar");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }

    readConnection()
      .then((data) => {
        if (active) {
          setConnection(data);
          setSelectedCalendar(data.connection || "");
        }
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "No se pudo consultar Google Calendar"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function refreshConnection() {
    setLoading(true);
    setError("");
    try {
      const data = await readConnection();
      setConnection(data);
      setSelectedCalendar(data.connection || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo consultar Google Calendar");
    } finally {
      setLoading(false);
    }
  }

  async function connect() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await sendCalendarRequest("/api/admin/google", "POST", {});
      window.location.assign(data.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo iniciar la conexión");
      setBusy(false);
    }
  }

  async function saveCalendar() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await sendCalendarRequest("/api/admin/calendar", "PATCH", { calendarId: selectedCalendar });
      setNotice(data.message || "Calendario actualizado");
      await refreshConnection();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el calendario");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("¿Desconectar Google Calendar?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await sendCalendarRequest("/api/admin/google", "DELETE", {});
      setNotice(data.message || "Google Calendar desconectado");
      await refreshConnection();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo desconectar Google Calendar");
    } finally {
      setBusy(false);
    }
  }

  return <section className="admin-calendar" aria-labelledby="admin-calendar-title">
    <div className="admin-calendar__heading">
      <div><p className="eyebrow">INTEGRACIONES</p><h2 id="admin-calendar-title">Google Calendar</h2></div>
      {!loading && connection && <span className={`calendar-connection-status ${connection.connected ? "is-connected" : "is-disconnected"}`}>
        {connection.connected ? "Estado: Conectado" : "Estado: No conectado"}
      </span>}
    </div>
    {error && <p className="app-message" role="alert">{error}</p>}
    {notice && <p className="app-message" role="status">{notice}</p>}
    {loading && <p role="status">Consultando conexión...</p>}
    {!loading && connection && !connection.connected && <div className="admin-calendar__disconnected">
      <p>Conecta el calendario del negocio para sincronizar reservas confirmadas.</p>
      <button type="button" disabled={busy} onClick={() => void connect()}>{busy ? "Conectando..." : "Conectar Google Calendar"}</button>
    </div>}
    {!loading && connection?.connected && <div className="admin-calendar__connected">
      {connection.calendars.length > 0 ? <>
        <label htmlFor="admin-calendar-select">Calendario seleccionado</label>
        <div className="admin-calendar__controls">
          <select id="admin-calendar-select" value={selectedCalendar} disabled={busy} onChange={(event) => setSelectedCalendar(event.target.value)}>
            {connection.calendars.map((calendar) => <option value={calendar.id} key={calendar.id}>{calendar.summary}</option>)}
          </select>
          <button type="button" disabled={busy || !selectedCalendar || selectedCalendar === connection.connection} onClick={() => void saveCalendar()}>
            {busy ? "Guardando..." : "Guardar calendario"}
          </button>
        </div>
      </> : <p>No hay calendarios disponibles con permisos de edición.</p>}
      <p className="admin-calendar__selected">Calendario actualmente seleccionado: {connection.calendars.find((calendar) => calendar.id === connection.connection)?.summary || connection.connection || "Sin selección"}</p>
      <button className="admin-calendar__disconnect" type="button" disabled={busy} onClick={() => void disconnect()}>{busy ? "Procesando..." : "Desconectar"}</button>
    </div>}
  </section>;
}
