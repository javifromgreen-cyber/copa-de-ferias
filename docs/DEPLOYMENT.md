# Despliegue: de demo a producción

## Base de datos

En local/demo, Prisma usa SQLite (`prisma/schema.prisma`,
`datasource db { provider = "sqlite" }`). Para producción:

1. Cambia `provider` a `"postgresql"` en `prisma/schema.prisma`.
2. Apunta `DATABASE_URL` a tu instancia Postgres (Supabase u otra).
3. Ejecuta `npx prisma migrate deploy` contra esa base de datos.
4. Decide si quieres reejecutar `prisma/seed.ts` (probablemente no en
   producción — está pensado para datos demo) o cargar los viajes reales
   desde Admin.

Si usas Supabase específicamente: crea el proyecto, copia la
`DATABASE_URL` (conexión directa o pooled, según tu volumen), y
opcionalmente usa Supabase Storage/Auth en el futuro para reemplazar la
autenticación de Admin por contraseña (ver más abajo).

## Vercel (o similar)

1. Conecta el repositorio.
2. Define las variables de entorno de `.env.example` en el panel del
   proveedor (como mínimo: `DATABASE_URL`, `ADMIN_PASSWORD`,
   `ADMIN_SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`).
3. Mantén `APP_MODE=demo` hasta que quieras vender de verdad.
4. Ejecuta `npx prisma migrate deploy` como parte del build o de un paso
   previo — no hagas `migrate dev` en producción.

### `vercel.json` — solo para Preview Deployments en modo demo

El `vercel.json` de este repo tiene un `buildCommand` pensado únicamente
para poder navegar una Preview Deployment sin conectar Postgres/Supabase:
genera `prisma/demo-seed.db` (SQLite migrado + con el seed habitual) antes
de `next build`, y `src/lib/db.ts` copia ese archivo a `/tmp` en cada
arranque en frío del entorno serverless de Vercel (el resto del filesystem
del despliegue es de solo lectura). Esto **no es persistencia real**: cada
instancia serverless nueva arranca desde el estado del seed, y los cambios
solo duran mientras esa instancia siga caliente. Ese comportamiento solo se
activa cuando `process.env.VERCEL` existe **y** `APP_MODE` no es
`"production"` — nunca afecta a un despliegue de producción.

Para un despliegue real en Vercel (Postgres/Supabase, `APP_MODE=production`):
sustituye el `buildCommand` de `vercel.json` por uno normal (`next build`,
o bórralo para que Vercel use `npm run build`) y sigue el resto de esta
sección tal cual.

## Cron

Configura una tarea diaria contra `/api/cron/process-emails` con la
cabecera `Authorization: Bearer $CRON_SECRET`. En Vercel, usa Vercel Cron
(`vercel.json` → `crons`).

## Pagos y emails reales

Ver [PAYMENTS.md](PAYMENTS.md) y [EMAILS.md](EMAILS.md) — ambos documentan
exactamente qué falta implementar y qué variables activar. Por diseño,
nada de esto se activa por accidente: hace falta `APP_MODE=production` +
`PAYMENTS_LIVE_ENABLED=true` + desmarcar `isDemo` en el viaje, para pagos;
y `RESEND_API_KEY` + `APP_MODE=production`, para emails.

## Autenticación de Admin

La V1 usa una contraseña compartida (`ADMIN_PASSWORD`) con una cookie
firmada (`src/lib/auth/admin.ts`, verificada en `src/proxy.ts`). Es
razonable para un equipo pequeño. Si el equipo crece, sustituir por
Supabase Auth (o similar) con roles por usuario es el siguiente paso
natural — la superficie a tocar es pequeña: `src/proxy.ts`,
`src/server/actions/admin-auth.ts` y el formulario de login.

## Analítica

Rellena `NEXT_PUBLIC_GA4_ID` / `NEXT_PUBLIC_META_PIXEL_ID` /
`NEXT_PUBLIC_TIKTOK_PIXEL_ID` (o los campos equivalentes en
`/admin/configuracion`, que tienen prioridad al leerse desde `BrandConfig`
en tiempo de ejecución) cuando tengas las cuentas creadas. No rompen nada
si se dejan vacíos.

## Checklist antes de anunciar el primer viaje real

1. `docs/LEGAL_CHECKLIST.md` completo.
2. Base de datos en Postgres, migraciones aplicadas.
3. Pagos activados y probados con un cargo real de importe bajo.
4. Emails reales activados y probados (`sendTestEmail` desde Admin).
5. Dominio propio + `NEXT_PUBLIC_SITE_URL` actualizado (afecta a SEO,
   sitemap y emails).
6. Datos de `BrandConfig` (legal, contacto, redes) completos y reales.
7. El viaje en cuestión con `isDemo=false`.
