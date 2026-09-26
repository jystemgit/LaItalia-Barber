"use client";

import { useState, type FormEvent } from "react";
import { business } from "@/lib/business";

type BookingFlowProps = {
  services: readonly string[];
};

const steps = ["Servicio", "Fecha", "Tus datos"];

function getLocalDate() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export default function BookingFlow({ services }: BookingFlowProps) {
  const [step, setStep] = useState(0);
  const [selectedService, setSelectedService] = useState("");
  const [date, setDate] = useState("");
  const [dateError, setDateError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  function continueToDetails() {
    if (!date) {
      setDateError("Elegí una fecha para continuar");
      return;
    }
    if (date < getLocalDate()) {
      setDateError("La fecha tiene que ser hoy o posterior");
      return;
    }
    setDateError("");
    setStep(2);
  }

  function submitInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = [
      "Hola, L’Italia Barber. Quisiera consultar disponibilidad para un turno",
      `Servicio: ${selectedService}`,
      `Fecha que me interesa: ${date}`,
      `Nombre: ${name.trim()}`,
      `Teléfono: ${phone.trim()}`,
      "Entiendo que el turno queda pendiente de confirmación",
    ].join("\n");
    const url = `${business.whatsappUrl}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="booking-form" aria-label="Consulta de turno">
      <ol className="booking-progress" aria-label="Pasos de la consulta">
        {steps.map((label, index) => (
          <li className={index <= step ? "is-current" : ""} key={label}>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="booking-step">
          <fieldset>
            <legend>¿Qué te gustaría hacerte?</legend>
            <div className="booking-services">
              {services.map((service) => (
                <button
                  className={`booking-service ${selectedService === service ? "is-selected" : ""}`}
                  type="button"
                  aria-pressed={selectedService === service}
                  onClick={() => setSelectedService(service)}
                  key={service}
                >
                  <span>{service}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <button
            className="button button--light booking-next"
            type="button"
            disabled={!selectedService}
            onClick={() => setStep(1)}
          >
            Continuar
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="booking-step">
          <label className="field-label" htmlFor="booking-date">¿Qué día te gustaría venir?</label>
          <input
            className="booking-input"
            id="booking-date"
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setDateError("");
            }}
            aria-describedby={dateError ? "date-error availability-note" : "availability-note"}
            aria-invalid={Boolean(dateError)}
          />
          {dateError && <p className="field-error" id="date-error">{dateError}</p>}
          <p className="availability-note" id="availability-note">
            Los horarios se coordinan por WhatsApp. El turno queda pendiente hasta recibir confirmación
          </p>
          <div className="booking-step__actions">
            <button className="booking-back" type="button" onClick={() => setStep(0)}>
              Volver
            </button>
            <button className="button button--light" type="button" onClick={continueToDetails}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <form className="booking-step" onSubmit={submitInquiry}>
          <p className="booking-summary">{selectedService} · {date}</p>
          <label className="field-label" htmlFor="booking-name">Tu nombre</label>
          <input
            className="booking-input"
            id="booking-name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Cómo te llamás"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <label className="field-label" htmlFor="booking-phone">Tu teléfono</label>
          <input
            className="booking-input"
            id="booking-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="Con código de área"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
          />
          <p className="availability-note">
            Esta consulta abre WhatsApp. No confirma un turno automáticamente.
          </p>
          <div className="booking-step__actions">
            <button className="booking-back" type="button" onClick={() => setStep(1)}>
              Volver
            </button>
            <button className="button button--light" type="submit">
              Enviar consulta
            </button>
          </div>
        </form>
      )}
    </div>
  );
}