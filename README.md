# Copa de Ferias

Fútbol que merece el viaje.

Copa de Ferias organiza viajes de fútbol cerrados para grupos pequeños:
elegimos el partido, montamos el viaje (transporte, alojamiento, entrada,
experiencias, host y coordinador) y publicamos plazas. El cliente decide si
se apunta.

Este repositorio es un proyecto **completamente independiente** — no
comparte código, infraestructura ni decisiones técnicas con ningún otro
producto.

---

## Arquitectura

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS 4**
- **Prisma** ORM — SQLite en local/demo (cero configuración), esquema listo
  para Postgres en producción (ver [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md))
- **Server Actions** para toda la escritura (leads, reservas, Mi Viaje,
  Admin) — sin API REST intermedia salvo webhooks/cron/exportaciones CSV
- Autenticación de Admin: cookie firmada con contraseña (`ADMIN_PASSWORD`),
  verificada en `src/proxy.ts` (el "middleware" de Next 16)
- Acceso a "Mi Viaje": token de acceso opaco por reserva (sustituye a un
  magic link por email mientras no hay envío de email real)
- **Pagos**: arquitectura de adaptadores (`src/lib/payments`) — Demo /
  Stripe / PayPal — con doble protección para que un pago real solo pueda
  ocurrir si `APP_MODE=production` **y** `PAYMENTS_LIVE_ENABLED=true` **y**
  el viaje no está marcado `isDemo`
- **Emails**: arquitectura de adaptadores (`src/lib/email`) — Console (demo,
  registra en `EmailLog`) / Resend — plantillas 100% editables desde Admin
- **Analítica**: GA4 / Meta Pixel / TikTok Pixel, cargados solo tras
  consentimiento, sin PII en los eventos (`src/lib/analytics/events.ts`)
- **Tests**: Vitest (lógica) + Playwright (flujos, mobile, accesibilidad)

Toda la identidad de marca (nombre, claim, contacto, redes, legal, reviews,
analítica) vive en una fila `BrandConfig` editable desde
`/admin/configuracion` — no está repartida por el código, así que se puede
cambiar de nombre sin tocar decenas de archivos.

---

## Cómo ejecutar en local (modo demo)

No hace falta ninguna cuenta externa (Supabase, Stripe, PayPal, Resend,
Vercel) para levantar la web completa.

```bash
npm install
cp .env.example .env
npm run db:migrate      # crea prisma/dev.db (SQLite) y aplica el esquema
npm run db:seed         # datos demo: Belgrado (abierto), Fútbol Inglés y
                         # Lisboa (próximamente), leads, reservas demo,
                         # plantillas de email, FAQ, configuración de marca
npm run dev
```

Abre http://localhost:3000.

- Panel de administración: http://localhost:3000/admin — contraseña definida
  en `ADMIN_PASSWORD` (`.env.example` trae un valor de ejemplo, cámbialo)
- Área de cliente: reserva un viaje de Belgrado y sigue el enlace a "Mi
  Viaje" que aparece en la pantalla de confirmación

### APP_MODE

```
APP_MODE=demo         # por defecto — sin cobros ni emails reales
APP_MODE=production    # activa las integraciones reales SI además hay
                        # credenciales Y PAYMENTS_LIVE_ENABLED=true
```

Un viaje marcado internamente `isDemo=true` (todos los viajes seed lo
están) **nunca** realiza un cargo real, incluso si accidentalmente hay
credenciales de producción configuradas — ver `src/lib/payments/index.ts`.

---

## Variables de entorno

Ver [.env.example](.env.example) para la lista completa y comentada.
Ninguna es obligatoria para ejecutar en modo demo salvo `DATABASE_URL`
(ya trae el valor correcto por defecto) y, si quieres entrar en Admin,
`ADMIN_PASSWORD`.

---

## Base de datos y seed

- `prisma/schema.prisma` — modelo completo (viajes, orígenes, planning,
  actividades, incluido/no incluido, requisitos, FAQ, leads, reservas,
  viajeros, solicitudes de cambio, plantillas de email, log de emails,
  configuración de marca)
- `prisma/seed.ts` — genera los 3 viajes demo, reservas y leads de ejemplo
  (claramente ficticios), FAQ global y las plantillas de email
- `npm run db:reset` — vuelve a crear la base de datos y ejecuta el seed

---

## Admin (panel interno)

Pensado para que una persona no técnica pueda operar el día a día sin
volver a tocar código:

- **Viajes** — crear, duplicar, editar y publicar. Todo el contenido de la
  ficha (planning, hotel, entrada, actividades, incluido/no incluido,
  requisitos, FAQ del viaje, condiciones, WhatsApp, SEO) es editable ahí.
- **Reservas** — ver, cancelar/reembolsar, gestionar solicitudes de cambio,
  estado del pasaporte CDF, exportar CSV.
- **Viajeros** — export plano por columnas (no JSON) para gestión operativa.
- **Interesados** — leads de "Avísame" y lista de espera, resumen por viaje
  y por ciudad, export CSV.
- **Emails** — activar/desactivar cada plantilla, editar asunto/cuerpo,
  vista previa con variables, enviar prueba, procesar manualmente los
  emails pendientes (equivalente al cron diario).
- **Configuración** — marca, contacto, redes, datos legales (placeholders
  hasta que existan datos reales), reviews, analítica.

Más detalle en [docs/ADMIN.md](docs/ADMIN.md).

---

## Documentación

- [docs/PRODUCT.md](docs/PRODUCT.md) — modelo de producto y decisiones
- [docs/ADMIN.md](docs/ADMIN.md) — guía del panel para el equipo no técnico
- [docs/PAYMENTS.md](docs/PAYMENTS.md) — arquitectura de pagos y checklist
  para activar Stripe/PayPal en real
- [docs/EMAILS.md](docs/EMAILS.md) — plantillas, variables, temporización
- [docs/LEGAL_CHECKLIST.md](docs/LEGAL_CHECKLIST.md) — qué falta revisar
  legalmente antes de vender de verdad
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — paso de demo a producción
  (Postgres/Supabase, Vercel, cron, dominios)

---

## Tests

```bash
npm run typecheck
npm run lint
npm test          # Vitest — lógica pura (precios, estados, plantillas, CSV,
                   # validación, analítica sin PII, guardas de lenguaje)
npm run e2e        # Playwright — flujos completos, mobile, accesibilidad
                    # (arranca su propio `next dev` en el puerto 3100)
npm run build
```

---

## Qué NO incluye esta V1 (a propósito)

Buscador de vuelos/hoteles, integraciones con APIs de vuelos/hoteles/tickets
(Duffel u otras), configurador de viaje por el cliente, marketplace de
proveedores, chat, foro/red social, app móvil, blog, traducciones, badge de
"salida garantizada", reseñas inventadas, escudos oficiales de clubes o
activos gráficos de la antigua Copa de Ferias. Ver spec original para el
detalle completo de exclusiones.
