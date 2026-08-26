# Emails transaccionales

## Arquitectura

`src/lib/email/types.ts` define `EmailProvider` (`send()`). Dos
implementaciones:

- `ConsoleEmailProvider` — no envía nada externamente, solo hace `console.log`.
  Es la que se usa en `APP_MODE=demo`.
- `ResendEmailProvider` — preparado para Resend. **No implementado**: lanza
  un error si se intenta usar sin `RESEND_API_KEY`.

`src/lib/email/index.ts` (`sendTemplatedEmail`) es el punto único de envío:
renderiza la plantilla, llama al proveedor que corresponda según
`APP_MODE`, y **siempre** escribe un `EmailLog` (con `mode: "demo"` o
`"real"`) para que Admin tenga historial completo pase lo que pase.

## Plantillas y variables

Cada `EmailTemplate` tiene `key`, `subject`, `body`, `active` y una
temporización (`timingReference` + `timingDaysOffset`):

- `immediate` — se dispara directamente desde el código en el momento del
  evento (reserva confirmada, datos pendientes, confirmación de "Avísame").
- `booking_plus_1` — N días después de la reserva.
- `before_departure` — N días antes de la salida (aproximada como
  `matchDate - 1 día`).
- `after_return` — N días después del regreso (aproximado como
  `matchDate + 1 día`).

Las variables disponibles en el cuerpo/asunto son `{{firstName}}`,
`{{tripName}}`, `{{tripNumber}}`, `{{departureCity}}`, `{{departureDate}}`,
`{{returnDate}}`, `{{whatsappUrl}}`. `renderTemplate()`
(`src/lib/email/render.ts`) sustituye lo que reconoce y deja el resto tal
cual — nunca falla si falta una variable.

> Nota: la fecha de salida/regreso se aproxima como
> `matchDate ± 1 día`, ajustada al patrón viernes-viaja / sábado-partido /
> domingo-regreso usado en los viajes demo. Si en el futuro un viaje tiene
> una duración distinta, esta aproximación debería sustituirse por fechas
> explícitas de salida/regreso en el modelo `Trip`.

## Secuencia (spec §43)

1. Reserva confirmada (inmediato)
2. Bienvenida (+1 día tras la reserva)
3. Datos pendientes (inmediato, cuando falten datos)
4. 30 días antes
5. 21 días antes
6. Grupo de WhatsApp (15 días antes)
7. Planning definitivo (7 días antes)
8. Últimos detalles (48h antes)
9. Gracias (+1 día tras el regreso)
10. Solicitud de reseña (+4 días tras el regreso)
11. Futuros viajes (inmediato/manual, requiere consentimiento comercial —
    **desactivada por defecto**)

La confirmación de "Avísame" (`notify_confirmation`) también está
**desactivada por defecto** — actívala desde Admin > Emails cuando quieras
enviarla.

## Cron

`/api/cron/process-emails` ejecuta `processPendingEmails()` (recorre las
reservas confirmadas y envía lo que toque, de forma idempotente por
`(bookingId, templateKey)`). Está protegido por cabecera
`Authorization: Bearer $CRON_SECRET`. Configúralo como cron diario en tu
plataforma de despliegue (por ejemplo, Vercel Cron). En demo, el botón
"Procesar emails pendientes" de Admin hace lo mismo manualmente.
