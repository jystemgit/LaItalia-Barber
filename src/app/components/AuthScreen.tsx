"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";

type Mode = "register" | "login" | "forgot" | "reset" | "verify";

export default function AuthScreen({ mode, token, next }: { mode: Mode; token?: string; next?: string }) {
  const [message, setMessage] = useState(mode === "verify" && !token ? "Enlace de verificación inválido" : mode === "reset" && !token ? "Enlace de recuperación inválido" : "");
  const [loading, setLoading] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const verifiedToken = useRef<string | null>(null);

  useEffect(() => {
    if (mode !== "verify" || !token || verifiedToken.current === token) return;
    verifiedToken.current = token;
    fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (response) => { const data = await response.json(); setMessage(data.message || data.error); })
      .catch(() => setMessage("No se pudo verificar tu cuenta"));
  }, [mode, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if ((mode === "register" || mode === "reset") && values.password !== values.confirmPassword) { setMessage("Las contraseñas no coinciden"); return; }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "reset" ? { ...values, token } : values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (mode === "login") {
        window.location.assign(data.role === "ADMIN" ? "/admin" : next?.startsWith("/") && !next.startsWith("//") ? next : "/account");
        return;
      }
      setMessage(data.message || "Solicitud enviada");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo completar la operación");
    } finally {
      setLoading(false);
    }
  }

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/auth/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: resendEmail }) });
      const data = await response.json();
      setMessage(data.message || data.error || "No se pudo solicitar el enlace");
    } catch { setMessage("No se pudo solicitar el enlace"); }
    finally { setLoading(false); }
  }

  const titles: Record<Mode, string> = { register: "Crear cuenta", login: "Iniciar sesión", forgot: "Recuperar contraseña", reset: "Nueva contraseña", verify: "Verificar email" };
  return (
    <main className="app-shell auth-shell">
      <Link className="app-back" href="/">L’ITALIA BARBER</Link>
      <section className="app-panel">
        <p className="eyebrow">TU CUENTA</p>
        <h1>{titles[mode]}</h1>
        {mode !== "verify" && <form onSubmit={submit} className="app-form">
          {mode === "register" && <>
            <label>Nombre<input name="firstName" autoComplete="given-name" required /></label>
            <label>Apellido<input name="lastName" autoComplete="family-name" required /></label>
            <label>Teléfono<input name="phone" type="tel" autoComplete="tel" required minLength={7} /></label>
          </>}
          {mode !== "reset" && <label>Email<input name="email" type="email" autoComplete="email" required /></label>}
          {(mode === "register" || mode === "login" || mode === "reset") && <label>Contraseña<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 1 : 12} required /></label>}
          {(mode === "register" || mode === "reset") && <label>Confirmar contraseña<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required /></label>}
          <button className="button button--reserve" type="submit" disabled={loading}>{loading ? "Procesando..." : mode === "forgot" ? "Enviar enlace" : mode === "reset" ? "Cambiar contraseña" : mode === "register" ? "Crear cuenta" : "Iniciar sesión"}</button>
        </form>}
        {message && <p className="app-message" role="status">{message}</p>}
        {(mode === "register" || mode === "verify") && <form className="app-form" onSubmit={resend}>
          <label>Reenviar verificación<input type="email" placeholder="Tu email" value={resendEmail} onChange={(event) => setResendEmail(event.target.value)} required /></label>
          <button type="submit" disabled={loading}>Enviar otro enlace</button>
        </form>}
        {mode === "login" && <><Link href="/recuperar">Olvidé mi contraseña</Link><Link href="/registrarse">Crear cuenta</Link></>}
        {mode === "register" && <Link href="/ingresar">Ya tengo una cuenta</Link>}
        {(mode === "verify" || mode === "reset") && <Link href="/ingresar">Ir a iniciar sesión</Link>}
      </section>
    </main>
  );
}