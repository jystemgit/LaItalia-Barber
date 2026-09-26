# L’Italia Barber

Sitio de captación para L’Italia Barber, construido con Next.js App Router, TypeScript y CSS responsive.

## Requisitos

Node.js 20.9 o superior y npm.

## Desarrollo

```bash
npm ci
npm run dev
```

Abrir `http://localhost:3000`.

## Producción

Opcional: definir `NEXT_PUBLIC_SITE_URL` con el dominio HTTPS público real en el entorno de despliegue. Se usa para canonical, Open Graph y sitemap. Si falta, el build igual funciona pero esos valores usan `http://localhost:3000` como fallback y el sitemap queda vacío.

Antes de desplegar, ejecutar:

```bash
npm run lint
npm audit
npm run build
npm start
```

GitHub Actions ejecuta `npm ci`, auditoría de dependencias, lint y build en cada push a `main` y pull request. El dominio `.example` del workflow es solo de prueba y no debe usarse para desplegar.

## Datos del negocio

La dirección confirmada es Alvarado 677, Bahía Blanca. Los horarios todavía deben ser informados por el dueño. Los datos de contacto y servicios se mantienen en `src/lib/business.ts`.

Las imágenes de `public/images/` son referencias editoriales, no fotos del dueño ni trabajos de L’Italia Barber. Reemplazarlas por material propio cuando esté disponible.

## Turnos

El flujo actual prepara una consulta por WhatsApp; coordina disponibilidad por conversación y no confirma reservas automáticamente. No hay backend ni integración activa con Google Calendar. Una integración futura debe usar endpoints de servidor y OAuth 2.0; las credenciales nunca deben exponerse al cliente.
