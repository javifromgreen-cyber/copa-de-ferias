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

## Principio: el email avisa, Mi Viaje contiene el detalle

Ningún email duplica toda la información de la reserva. Cada plantilla es
breve y siempre incluye un CTA a Mi Viaje (`{{myTripUrl}}`, construido con
el `accessToken` seguro de la reserva — nunca un ID interno ni una
referencia sin autorización).

## Las 5 comunicaciones base

| Plantilla | `key` | Disparador |
|---|---|---|
| Reserva confirmada | `booking_confirmed` | Inmediato, al confirmar el pago. Incluye el acceso a Mi Viaje — no existe un email de bienvenida separado. |
| Acción necesaria | `action_required` | Evento: se envía desde `createBookingAction` (`src/server/actions/admin-mi-viaje.ts`) cada vez que Admin crea una acción pendiente real. Nunca por calendario. |
| Cambio importante | `important_update` | Evento: `createBookingUpdate` solo la envía si Admin marca explícitamente "Es un cambio importante — enviar email al cliente" al crear la actualización. No se envía por cada actualización de la línea de tiempo. |
| Recordatorio antes del viaje | `trip_reminder` | `before_departure`, 48 h antes (aproximado como `matchDate - 1 día - 2 días`). Único recordatorio previo. |
| Gracias / valoración | `thanks_review` | `after_return`, +1 día tras el regreso (aproximado). Único email posterior al viaje. |

Además, `notify_confirmation` (confirmación del formulario "Avísame" de un
partido próximamente) sigue existiendo, desactivada por defecto — es
independiente del ciclo de vida de una reserva.

## Variables

`renderTemplate()` (`src/lib/email/render.ts`) sustituye `{{variable}}` y
deja el resto tal cual — nunca falla si falta una variable.

Las variables comunes a toda reserva las construye
`buildBookingEmailVariables()` (`src/lib/email/bookingVariables.ts`), el
único lugar que las deriva, para que signifiquen siempre lo mismo:

- `{{customerName}}`, `{{tripName}}`, `{{matchName}}` (equipo local –
  visitante, o el nombre del producto si no hay matchup)
- `{{bookingReference}}`, `{{total}}`, `{{partySize}}`, `{{travelMode}}`
  ("A TU AIRE" / "GRUPO CDF")
- `{{myTripUrl}}` — enlace seguro a Mi Viaje con el `accessToken`

Además, según la plantilla:

- `action_required`: `{{actionTitle}}`, `{{actionDescription}}`,
  `{{actionDueDate}}` (ya formateada, o vacía si no hay fecha límite)
- `important_update`: `{{updateTitle}}`

`notify_confirmation` sigue usando su propio set histórico
(`{{firstName}}`, `{{tripName}}`), sin relación con las reservas.

## Plantillas archivadas

La secuencia antigua orientada a Grupos CDF (bienvenida, datos pendientes,
30/21 días antes, grupo de WhatsApp, planning definitivo, últimos
detalles, gracias, solicitud de reseña, futuros viajes) se conserva en la
base de datos con `archived: true, active: false` — nunca se borra, para
no complicar migraciones ni perder histórico de envíos ya registrados en
`EmailLog`. `archived: true` las excluye del listado operativo de Admin
(quedan en una sección plegada aparte) y de `processPendingEmails()`;
`active: false` las hace además imposibles de enviar, incluso a mano,
salvo con `force: true` (usado solo por "enviar prueba" en Admin).

## Cron

`/api/cron/process-emails` ejecuta `processPendingEmails()` — recorre las
reservas confirmadas y envía lo que toque de `trip_reminder`/
`thanks_review`, de forma idempotente por `(bookingId, templateKey)`.
Nunca envía `booking_confirmed`, `action_required` ni `important_update`
— esos son "evento"/"inmediato" y se disparan directamente desde el código
en el momento real. Protegido por cabecera
`Authorization: Bearer $CRON_SECRET`. En demo, el botón "Procesar emails
pendientes" de Admin hace lo mismo manualmente.

> Nota: la fecha de salida/regreso se sigue aproximando como
> `matchDate ± 1 día`. Si en el futuro un viaje tiene una duración
> distinta, esta aproximación debería sustituirse por fechas explícitas de
> salida/regreso en el modelo `Trip`.

## Fuera de alcance (deliberado)

No existen todavía plantillas automáticas propias por proveedor (check-in
de vuelo, check-in de hotel, cambios de aerolínea, confirmación de hotel,
emisión de billetes...). Cuando se integren proveedores reales, se
decidirá entonces qué comunica el proveedor directamente y qué sigue
pasando por Copa de Ferias.
