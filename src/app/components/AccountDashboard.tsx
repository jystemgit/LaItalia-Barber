"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

type User = { first_name: string; last_name: string; email: string; phone: string; role: "CUSTOMER" | "ADMIN" };

async function send(path: string, body: object) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data;
}

export default function AccountDashboard({ user }: { user: User }) {
  const router = useRouter();
  const [profile, setProfile] = useState({ firstName: user.first_name, lastName: user.last_name, phone: user.phone });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage("Datos actualizados");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudieron actualizar los datos"); }
    finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (values.password !== values.confirmPassword) { setMessage("Las contraseñas no coinciden"); return; }
    setBusy(true);
    try {
      await send("/api/auth/change-password", values);
      form.reset();
      router.replace("/ingresar?changed=1");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo cambiar la contraseña"); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    try {
      await send("/api/auth/logout", {});
      router.replace("/ingresar");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo cerrar sesión"); setBusy(false); }
  }

  return <main className="app-shell account-shell">
    <header className="account-top">
      <Link className="account-top__brand" href="/" aria-label="L’Italia Barber, inicio">
        <Image src="/images/logobarber.png" alt="" width={44} height={44} />
        <span><strong>L’ITALIA</strong><small>BARBER</small></span>
      </Link>
      <div className="account-top__actions">
        <Link className="button button--reserve account-top__home" href="/">Volver al inicio</Link>
        <button type="button" disabled={busy} onClick={logout}>Cerrar sesión</button>
      </div>
    </header>
    <div className="account-heading">
      <p className="eyebrow">{user.role === "ADMIN" ? "ESPACIO DE GESTIÓN" : "TU ESPACIO PERSONAL"}</p>
      <h1>{user.role === "ADMIN" ? "Administración" : "Mi cuenta"}</h1>
      <p>{user.email} · {user.role === "ADMIN" ? "Administrador" : "Cliente"}</p>
    </div>
    {message && <p role="status" className="app-message">{message}</p>}
    <div className="app-columns">
      <section className="app-panel"><h2>Información personal</h2><form className="app-form" onSubmit={saveProfile}>
        <label>Nombre<input name="firstName" autoComplete="given-name" value={profile.firstName} onChange={(event) => setProfile({ ...profile, firstName: event.target.value })} required /></label>
        <label>Apellido<input name="lastName" autoComplete="family-name" value={profile.lastName} onChange={(event) => setProfile({ ...profile, lastName: event.target.value })} required /></label>
        <label>Email<input type="email" value={user.email} readOnly /></label>
        <label>Teléfono<input name="phone" type="tel" autoComplete="tel" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} minLength={7} required /></label>
        <button type="submit" className="button button--reserve" disabled={busy}>Guardar datos</button>
      </form></section>
      <section className="app-panel"><h2>Seguridad</h2><form className="app-form" onSubmit={changePassword}>
        <label>Contraseña actual<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
        <label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
        <label>Confirmar nueva contraseña<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required /></label>
        <button type="submit" className="button button--reserve" disabled={busy}>Cambiar contraseña</button>
      </form></section>
    </div>
  </main>;
}