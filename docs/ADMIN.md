# Guía de Admin

Pensada para una persona no técnica. Entra en `/admin` con la contraseña
definida en `ADMIN_PASSWORD`.

## Viajes

`/admin/viajes` → crear, duplicar o editar. El formulario está organizado
en secciones plegables (básico, estado, precio y plazas, contenido
editorial, transporte, hotel, entrada, seguro, personas, orígenes,
planning, actividades, incluido/no incluido, checklist, FAQ del viaje,
WhatsApp, condiciones, SEO).

Puntos importantes:

- **`published`** decide si el viaje tiene ficha pública (`/viajes/[slug]`).
  Un viaje "Próximamente" puede existir sin ficha pública — se muestra en
  Home/`/viajes` con un botón "Avísame" en lugar de enlace a la ficha.
- **`homeFeatured`** decide si aparece en la portada.
- **`isDemo`** — nunca lo desmarques en un viaje real sin haber completado
  el checklist de `docs/LEGAL_CHECKLIST.md` y `docs/PAYMENTS.md`: mientras
  esté marcado, ese viaje jamás cobrará de verdad aunque haya credenciales
  de producción.
- **Plazas vendidas** (`soldSpots`) no se edita a mano: la actualizan las
  reservas y las cancelaciones automáticamente.
- **Duplicar** crea una copia en `draft`, sin publicar, con un slug nuevo —
  útil para reutilizar la estructura de un viaje anterior.
- **Archivar** retira el viaje de todos los listados públicos sin borrar
  sus datos (reservas, histórico).

## Reservas

`/admin/reservas` — listado completo + detalle por reserva: viajeros,
estado del pasaporte CDF, notas internas, solicitudes de cambio/cancelación
y el historial de emails enviados a esa reserva. "Cancelar y reembolsar"
libera las plazas del viaje automáticamente.

Exportación CSV con columnas separadas (no JSON) en `/admin/reservas/export`.

## Viajeros

`/admin/viajeros` — vista plana de cada viajero de cada reserva, pensada
para gestión operativa (documentación, habitaciones, pasaporte CDF).
Exportación CSV en `/admin/viajeros/export`.

## Interesados

`/admin/interesados` — leads de "Avísame" y lista de espera, con resumen
por viaje y por ciudad. Exportación CSV en `/admin/interesados/export`.

## Emails

`/admin/emails` — cada plantilla se puede activar/desactivar, editar
(asunto y cuerpo, con variables `{{firstName}}`, `{{tripName}}`, etc.),
previsualizar y enviar de prueba. El botón "Procesar emails pendientes"
ejecuta manualmente la misma lógica que el cron diario protegido
(`/api/cron/process-emails`), útil en demo donde no hay scheduler externo.

La plantilla de confirmación de "Avísame" (`notify_confirmation`) está
desactivada por defecto — actívala desde aquí cuando quieras que se envíe.

## Configuración

`/admin/configuracion` — nombre de marca, claim, contacto, redes, datos
legales (vacíos por defecto, a propósito — nunca se inventan), reviews
(ocultas por defecto hasta que actives una URL real de Google/Trustpilot) y
los IDs de analítica (GA4, Meta Pixel, TikTok Pixel).
