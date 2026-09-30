"use client";

import { useEffect, useState } from "react";
import ToastNotification, { useToast } from "@/app/components/ToastNotification";
import { notifyAfterSuccess } from "@/lib/success-notification";

type Service = { id: string; name: string; description: string; duration_minutes: number };
type Customer = { id: string; first_name: string; last_name: string; email: string; phone: string };

async function readResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data;
}

export default function BookingFlow() {
  const { toast, showToast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [time, setTime] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    fetch("/api/services").then(readResponse).then((data) => {
      setServices(data.services);
      try {
        const saved = JSON.parse(sessionStorage.getItem("bookingSelection") || "null") as { serviceId?: string; date?: string; time?: string } | null;
        sessionStorage.removeItem("bookingSelection");
        if (saved?.serviceId && saved.date && data.services.some((item: Service) => item.id === saved.serviceId)) {
          setServiceId(saved.serviceId);
          setDate(saved.date);
          void fetch(`/api/availability?date=${encodeURIComponent(saved.date)}&serviceId=${encodeURIComponent(saved.serviceId)}`)
            .then(readResponse).then((result) => {
              setSlots(result.slots);
              if (saved.time && result.slots.includes(saved.time)) setTime(saved.time);
              else setMessage("El horario elegido ya no está disponible. Seleccioná otro");
            }).catch((error) => setMessage(error.message));
        }
      } catch { sessionStorage.removeItem("bookingSelection"); }
    }).catch((error) => setMessage(error.message));
    fetch("/api/me").then((response) => response.ok ? response.json() : null).then((data) => setCustomer(data?.user ?? null)).catch(() => {});
  }, []);

  async function loadSlots(nextDate: string, nextService: string) {
    setSlots([]);
    setTime("");
    setMessage("");
    if (!nextDate || !nextService) return;
    setLoading(true);
    try {
      const data = await readResponse(await fetch(`/api/availability?date=${encodeURIComponent(nextDate)}&serviceId=${encodeURIComponent(nextService)}`));
      setSlots(data.slots);
      if (!data.slots.length) setMessage("No hay horarios disponibles para ese día");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo comprobar disponibilidad");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    setLoading(true);
    setMessage("");
    try {
      const data = await notifyAfterSuccess(
        fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceId, date, time }),
        }).then(readResponse),
        () => showToast("Turno reservado"),
      );
      setConfirmed(true);
      setMessage(`Reserva confirmada. Identificador: ${data.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo confirmar");
      await loadSlots(date, serviceId);
    } finally {
      setLoading(false);
    }
  }

  const service = services.find((item) => item.id === serviceId);
  return <>
    <ToastNotification toast={toast} />
    <div className="booking-form" aria-label="Reservar turno">
      {confirmed ? (
        <div className="booking-step" role="status">
          <h3>Tu turno está confirmado</h3>
          <p>{service?.name} · {date} · {time}</p>
          <p>{message}</p>
          <a className="button button--reserve" href="/mi-cuenta">Ver Mi Cuenta</a>
        </div>
      ) : (
        <div className="booking-step">
          <label className="field-label" htmlFor="booking-service">Servicio</label>
          <select className="booking-input" id="booking-service" value={serviceId} onChange={(event) => { setServiceId(event.target.value); void loadSlots(date, event.target.value); }}>
            <option value="">Seleccioná un servicio</option>
            {services.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.duration_minutes} min</option>)}
          </select>
          <label className="field-label" htmlFor="booking-date">Fecha</label>
          <input className="booking-input" id="booking-date" type="date" value={date} min={new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })} onChange={(event) => { setDate(event.target.value); void loadSlots(event.target.value, serviceId); }} />
          {date && serviceId && <>
            <p className="field-label">Horarios disponibles</p>
            <div className="booking-services" role="group" aria-label="Horarios disponibles">
              {slots.map((slot) => <button className={`booking-service${time === slot ? " is-selected" : ""}`} type="button" aria-pressed={time === slot} onClick={() => setTime(slot)} key={slot}>{slot}</button>)}
            </div>
          </>}
          {message && <p className="availability-note" role="status">{message}</p>}
          {time && !customer && <p className="availability-note">Para confirmar, <a href={`/ingresar?next=${encodeURIComponent("/#reservas")}`} onClick={() => sessionStorage.setItem("bookingSelection", JSON.stringify({ serviceId, date, time }))}>iniciá sesión</a> o <a href="/registrarse" onClick={() => sessionStorage.setItem("bookingSelection", JSON.stringify({ serviceId, date, time }))}>creá tu cuenta</a>. Tu horario se confirma cuando finalices la reserva</p>}
          {time && customer && <div className="booking-confirm">
            <p><strong>Revisá tu turno</strong><br />{service?.name} · {date} · {time} · {service?.duration_minutes} minutos<br />{customer.first_name} {customer.last_name} · {customer.phone}</p>
            <button className="button button--reserve" type="button" disabled={loading} onClick={confirm}>{loading ? "Confirmando..." : "Confirmar reserva"}</button>
          </div>}
          {loading && !time && <p className="availability-note">Consultando horarios...</p>}
        </div>
      )}
    </div>
  </>;
}
