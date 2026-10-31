"use client";

import { useEffect, useState } from "react";

type Customer = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  bookings: number;
  no_show_count: number;
  suspended_until: string | null;
};

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/customers", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudieron cargar los clientes");
        return data.items as Customer[];
      })
      .then((items) => { if (active) setCustomers(items); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "No se pudieron cargar los clientes"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <section className="admin-bookings" aria-labelledby="admin-customers-title">
    <div className="admin-bookings__heading">
      <div><p className="eyebrow">SEGUIMIENTO DE CLIENTES</p><h2 id="admin-customers-title">Clientes</h2></div>
    </div>
    {error && <p className="app-message" role="alert">{error}</p>}
    {loading && <p role="status">Cargando clientes...</p>}
    {!loading && !error && customers.length === 0 && <p className="admin-bookings__empty">No hay clientes.</p>}
    {!loading && customers.map((customer) => <article className="app-row" key={customer.id}>
      <strong>{customer.first_name} {customer.last_name}</strong>
      <span>{customer.email} · {customer.phone} · Reservas: {customer.bookings}</span>
      <span>Inasistencias históricas: {customer.no_show_count}</span>
      <span>Suspensión: {customer.suspended_until ? "Suspendido" : "Activo"}{customer.suspended_until ? ` hasta el ${new Date(customer.suspended_until).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "long" })}` : ""}</span>
    </article>)}
  </section>;
}