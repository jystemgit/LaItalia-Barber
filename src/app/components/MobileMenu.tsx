"use client";

import { useEffect, useRef, useState } from "react";

const navigationItems = [
  ["Inicio", "#inicio"],
  ["Experiencia", "#experiencia"],
  ["Servicios", "#servicios"],
  ["Reservas", "#reservas"],
  ["Contacto", "#contacto"],
] as const;

export default function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        toggleRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className={`mobile-menu${isOpen ? " is-open" : ""}`} ref={menuRef}>
      <button
        className="mobile-menu__toggle"
        type="button"
        aria-label={isOpen ? "Cerrar menú de navegación" : "Abrir menú de navegación"}
        aria-expanded={isOpen}
        aria-controls="mobile-navigation"
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
        ref={toggleRef}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>
      <nav
        className="mobile-menu__panel"
        id="mobile-navigation"
        aria-label="Navegación para móvil"
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
        {navigationItems.map(([label, href]) => (
          <a href={href} key={href} onClick={() => setIsOpen(false)}>
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}