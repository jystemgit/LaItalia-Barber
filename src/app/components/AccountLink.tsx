"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AccountLinkProps = {
  className?: string;
  onNavigate?: () => void;
};

export default function AccountLink({ className, onNavigate }: AccountLinkProps) {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (active) setRole(data?.user?.role ?? null); })
      .catch(() => { if (active) setRole(null); });
    return () => { active = false; };
  }, []);

  const href = role === "ADMIN" ? "/admin" : role ? "/account" : "/ingresar";
  const label = role ? "Mi Cuenta" : "Iniciar sesión";

  return <Link className={className} href={href} onClick={onNavigate}>{label}</Link>;
}