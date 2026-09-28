# L’Italia Barber

Next.js 16 + TypeScript. Sitio público editorial y aplicación de gestión para un único profesional. Las vistas de clientes y administración son separadas de la web pública. No hay pagos ni precios.

## Fase 1: cuentas (alcance actual)

Se reutilizan PostgreSQL sin ORM, `postgres.js`, Argon2, sesiones persistidas y cookies HTTP-only, Zod y la integración HTTP de Resend. Registro crea exclusivamente `pending_users`; un enlace de 24 horas con token aleatorio hasheado crea `users`/`profiles` recién al verificar. `/account` incluye solo perfil, cambio de contraseña y logout. `/mi-cuenta` redirige a `/account` por compatibilidad. `/admin` es exclusivamente una página de identidad ADMIN, protegida en servidor; las funcionalidades de turnos/Calendar que ya existían no forman parte de esta fase ni se han modificado para este trabajo.

En este entorno no hay `.env.local` ni credenciales Resend: el formulario de registro debe responder 503 y **no** informar envío exitoso hasta que el proveedor real esté configurado. Los tests interceptan HTTP de correo solo dentro del proceso de pruebas; no son prueba de entrega por Resend.

### PostgreSQL local reproducible

Con PostgreSQL 17 instalado en macOS mediante Homebrew, por ejemplo:

```bash
/usr/local/opt/postgresql@17/bin/pg_ctl -D /usr/local/var/postgresql@17 -l /tmp/litalia-pg.log -o '-p 5434' start
/usr/local/opt/postgresql@17/bin/createdb -h localhost -p 5434 litalia_dev
```

Configurar `.env.local` con `DATABASE_URL=postgres://TU_USUARIO@localhost:5434/litalia_dev` y `AUTH_SECRET` generado aleatoriamente con al menos 32 caracteres. Los scripts `npm run db:migrate` y `npm run db:admin` cargan ese archivo automáticamente. Ejecutar `npm ci`, `npm run db:migrate`, `npm test`, `npm run dev`. No usar la DB local en producción.

Para el primer ADMIN, definir temporalmente `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME` y `ADMIN_PHONE` con datos reales y ejecutar `npm run db:admin`; una cuenta CUSTOMER existente nunca se promueve automáticamente. No escribir esas credenciales en un commit ni en tickets.

Para email real: configurar `RESEND_API_KEY` y `EMAIL_FROM` con remitente/dominio verificado. Registrar una cuenta de prueba autorizada, abrir el enlace recibido en su bandeja, iniciar sesión, refrescar, cerrar sesión y comprobar que `/account` queda inaccesible; probar además recuperación y cambio de contraseña. Nunca usar una cuenta del cliente sin autorización explícita.

**Checklist Fase 1 para habilitar cuentas**

- [ ] Configurar `DATABASE_URL` de PostgreSQL 17, ejecutar `npm run db:migrate` y comprobar conectividad desde la app.
- [ ] Generar `AUTH_SECRET` aleatorio de al menos 32 caracteres; no incluirlo en Git.
- [ ] Verificar dominio/remitente Resend y configurar `RESEND_API_KEY` y `EMAIL_FROM`. Sin estos datos la app devuelve 503 y no envía email.
- [ ] Registrar el primer ADMIN con datos reales vía `npm run db:admin`; verificar CUSTOMER bloqueado en `/admin`.
- [ ] Completar E2E **con correo real**: registro -> bandeja -> verificación -> login -> refresh -> logout -> recuperación y cambio de contraseña.
- [ ] Configurar `CRON_SECRET` para limpiar pendientes y tokens expirados mediante el cron existente.

Las pruebas automatizadas auth interceptan `fetch` únicamente dentro del test; la entrega real de Resend **no está probada** sin credenciales. El resto del repositorio contiene módulos de turnos y Calendar de una fase anterior, no editados para esta Fase 1; no se deben interpretar como parte de este checklist.

## Arquitectura

- `src/app`: web pública, páginas protegidas (`/account`, `/admin`) y Route Handlers de API.
- `src/lib/auth.ts`: cuentas pendientes, Argon2, sesiones revocables, verificación y recuperación.
- `src/lib/availability.ts`: motor puro de slots y solapamientos.
- `src/lib/booking.ts`: disponibilidad en zona `America/Argentina/Buenos_Aires`, reservas y sync.
- `src/lib/calendar.ts`: OAuth Google, freeBusy y eventos idempotentes; refresh token cifrado AES-256-GCM.
- `db/migrations`: migración SQL reproducible, índices y exclusión PostgreSQL de períodos solapados.
- `scripts`: migración, bootstrap del primer admin y limpieza manual.

La disponibilidad usa horarios configurados, excepciones, reservas internas y eventos ocupados de Google. Si Google está conectado pero falla, no se ofrecen slots. La reserva reconsulta antes de insertar bajo lock por fecha; una constraint de exclusión en PostgreSQL impide carreras entre solicitudes concurrentes. El booking queda confirmado en DB aunque Calendar falle: se marca `FAILED` para reintentar desde `/admin` con ID de evento determinista. Si no hay conexión Google, se marca `DISCONNECTED`; el admin puede sincronizarlo tras conectar. Al cancelar se libera el slot interno y se intenta borrar solo el evento propio. Si falla la eliminación, Google aún bloquea ese horario hasta resolver la sincronización.

## Instalación

Requiere Node.js >=20.9, npm y PostgreSQL 17. La base debe permitir `CREATE EXTENSION btree_gist`.

```bash
npm ci
# configurar variables de entorno en .env.local (ver .env.example)
npm run db:migrate
npm run dev
```

El esquema crea horarios reales iniciales: lunes a sábado 10:30-16:30, intervalos de 90 minutos, domingo cerrado, y los tres servicios confirmados con duración inicial configurable de 90 minutos. No crea usuarios, testimonios ni precios. `npm run db:migrate` registra versiones en `schema_migrations` y es idempotente. Para crear el primer propietario, configurar temporalmente `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME`, `ADMIN_PHONE` y ejecutar `npm run db:admin`. Un email existente jamás se convierte en admin mediante ese comando.

## Variables

- `DATABASE_URL`: cadena de PostgreSQL (obligatoria para API, cuentas y reservas).
- `AUTH_SECRET`: cadena aleatoria de al menos 32 caracteres; deriva clave de cifrado de tokens Google.
- `RESEND_API_KEY`, `EMAIL_FROM`: remitente verificado y API key de Resend; sin esto se rechazan registro, reenvío y recuperación, no se simula envío.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`: OAuth Web Application de Google Cloud, con Calendar API activada; redirect URI debe ser `https://TU_DOMINIO/api/admin/google/callback` tanto en Google Cloud como en Vercel.
- `CRON_SECRET`: clave de Vercel Cron para limpieza diaria de cuentas pendientes, resets, sesiones y estados OAuth expirados.
- `NEXT_PUBLIC_SITE_URL`: URL HTTPS pública para canonical, Open Graph y sitemap. Sin ella el build compila, pero se genera metadata localhost y sitemap vacío.

Nunca exponer `DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`, Google client secret ni credenciales del primer ADMIN en variables `NEXT_PUBLIC_*`. No guardar tokens en Git. Las imágenes actuales son referencias editoriales, no trabajos reales del dueño.

## Autenticación y reservas

Registro -> fila `pending_users` de 24h -> email con token SHA-256 de un uso -> creación de `users` y `profiles` -> login. Sesión HTTP-only SameSite Lax de 14 días, revocable por logout o cambio/reset de contraseña. Los endpoints POST/PATCH/DELETE comprueban Origin, permisos y datos Zod en servidor. Los formularios presentan errores de DB/email al usuario sin stack traces. Las reservas solo pueden cancelarse antes de su inicio; una política comercial adicional aún no fue definida. Las reseñas solo admiten una por reserva COMPLETED y requieren moderación. Esos flujos de reservas/reseñas quedan fuera de Fase 1.

La creación de reservas se confirma en DB antes del intento de sync Calendar. El email de reserva/cancelación se envía cuando el proveedor está configurado; una caída posterior no revierte el booking, queda registrada en logs. Este correo no tiene cola de retries todavía.

## Pruebas

```bash
npm run lint
npm audit
npm run db:migrate
npm test
npm run build
```

`npm test` ejecuta tests del motor, cifrado/OAuth URL y un test PostgreSQL de tokens, slots, domingo y dos reservas simultáneas. Sin `DATABASE_URL` el test PostgreSQL se reporta `SKIPPED`, nunca passed. CI arranca PostgreSQL 17, migra y ejecuta la suite. La OAuth real, emails enviados y eventos de calendario en una cuenta real necesitan credenciales externas y deben comprobarse manualmente antes de abrir las reservas al público.

## Production Checklist de fases posteriores

- [ ] Provisionar PostgreSQL con acceso desde Vercel; configurar `DATABASE_URL` y aplicar `npm run db:migrate` una sola vez por versión.
- [ ] Configurar `AUTH_SECRET`, `CRON_SECRET` y `NEXT_PUBLIC_SITE_URL` reales en Vercel.
- [ ] Verificar dominio de email; configurar `RESEND_API_KEY` y `EMAIL_FROM`.
- [ ] El ADMIN inicial de Fase 1 se gestiona desde el checklist anterior; el dashboard completo corresponde a una fase posterior.
- [ ] Activar Google Calendar API, OAuth consent y redirect URI; configurar los tres secretos de Google.
- [ ] Conectar Calendar desde admin, elegir calendario editable, comprobar freeBusy, creación, cancelación y retry con eventos reales. Sin credenciales no se puede afirmar que Google funcione end-to-end.
- [ ] Registrar, recibir verificación, entrar, recuperar contraseña y probar reservas/cancelación reales en desktop, tablet y mobile.
- [ ] Comprobar hora local de Bahía Blanca, cuatro turnos diarios, domingo cerrado y exceptions; revisar horarios/duraciones comerciales con el dueño.
- [ ] Confirmar entrega de correos y cron diario en el entorno desplegado; monitorear `calendar_sync_status=FAILED` y logs.
- [ ] Reemplazar fotografías editoriales por material autorizado real antes de presentar la galería como trabajos propios.

## Troubleshooting

- Si un endpoint devuelve 503: comprobar migraciones, `DATABASE_URL` y proveedor externo; no se crean reservas simuladas.
- Si el sitio compila pero no muestra servicios: ejecutar `npm run db:migrate` y comprobar conexión Vercel -> PostgreSQL.
- Si Google no devuelve disponibilidad: revisar refresh token/redirect URI/calendario editable; se bloquea la oferta de slots mientras falla.
- Si el sitemap está vacío o OG apunta a localhost: configurar `NEXT_PUBLIC_SITE_URL` antes del build y redeplegar.
- Si hay turnos con `FAILED`/`DISCONNECTED` en Calendar: usar “Sincronizar calendario” en admin tras solucionar la conexión.
