# Producto

## Qué es Copa de Ferias

Viajes de fútbol cerrados para grupos pequeños. Copa de Ferias selecciona
previamente el partido, la ciudad y el estadio, y monta un producto cerrado:
transporte, alojamiento, entrada, transfers, experiencia futbolística, host
local, coordinador del grupo y, cuando aplica, seguro. El cliente ve el viaje
ya montado y decide si se apunta.

No es un buscador de vuelos, ni una agencia a medida, ni un configurador, ni
un marketplace de entradas.

## Modelo de datos (resumen)

- **Trip** — la unidad central. Estado (`draft` → `upcoming`/`open` →
  `sold_out`/`completed`/`archived`), `published` controla si tiene ficha
  pública independientemente del estado.
- **TripOrigin** — ciudades de salida, mismo PVP para todas en V1.
- **TripPlanningDay / TripActivity / TripInclusion / TripRequirement /
  TripFaq** — contenido editorial editable por viaje, sin CMS complejo.
- **Lead** — "Avísame" (`notify`), lista de espera (`waitlist`) o captación
  general de home (`general`).
- **Booking / Traveler** — una reserva agrupa 1..N viajeros. Los datos
  sensibles de cada viajero se completan progresivamente en "Mi Viaje", no
  en el checkout.
- **ChangeRequest** — cambio de viajero, cambio importante o cancelación,
  como workflow administrativo (nunca automatizado).
- **EmailTemplate / EmailLog** — la secuencia de emails transaccionales,
  100% editable y con historial.
- **BrandConfig** — fila única con toda la identidad de marca.

## Estados públicos

| Estado interno | Público          |
| --------------- | ----------------- |
| `upcoming`       | Próximamente      |
| `open`           | Abierto           |
| `sold_out`       | Agotado + lista de espera |
| `completed`      | Realizado         |

Nunca se muestra un badge de "salida garantizada" — ver `src/lib/trips/status.ts`.

## Inventario

`Trip.maxSpots` / `Trip.soldSpots` son la fuente de verdad. Una reserva
incrementa `soldSpots` dentro de una transacción de base de datos que
primero relee el viaje y comprueba capacidad, evitando overselling en
compras simultáneas (ver `src/server/actions/booking.ts`). Si el pago falla
tras reservar el hueco, la transacción de liberación revierte `soldSpots` y
reabre el viaje si se había marcado `sold_out`.

## Nombre y marca

"Copa de Ferias" es provisional. Todo el texto de marca (nombre, claim,
contacto, redes) sale de `BrandConfig` vía `src/lib/brand.ts` — cambiar de
nombre es una edición en Admin, no una búsqueda y reemplazo en el código.
