# Pagos

## Arquitectura

`src/lib/payments/types.ts` define la interfaz `PaymentProvider` (un único
método `charge()`). Tres implementaciones:

- `DemoPaymentProvider` (`demo.ts`) — siempre "tiene éxito", nunca mueve
  dinero real. Es la que se usa en todo `APP_MODE=demo`.
- `StripePaymentProvider` (`stripe.ts`) — preparado para tarjeta,
  Apple Pay/Google Pay, Bizum y Klarna vía Stripe. **No implementado**: lanza
  un error explícito si se intenta usar. Ver checklist más abajo.
- `PayPalPaymentProvider` (`paypal.ts`) — preparado para PayPal Checkout
  (incluyendo Pay Later cuando esté disponible para el comprador). También
  sin implementar.

`src/lib/payments/index.ts` (`getPaymentProvider`) decide cuál usar con
**triple protección**:

1. `APP_MODE` debe ser `production` (por defecto es `demo`).
2. `PAYMENTS_LIVE_ENABLED` debe ser explícitamente `"true"`.
3. El viaje no debe estar marcado `isDemo` — un viaje demo siempre usa
   `DemoPaymentProvider`, pase lo que pase con el resto de configuración.

Si cualquiera de las tres condiciones falla, se usa el proveedor demo. No
hay forma de que un pago real ocurra por accidente.

## Inventario y checkout

Una reserva reduce las plazas disponibles dentro de una transacción de base
de datos (relee el viaje, comprueba capacidad, escribe) — ver
`src/server/actions/booking.ts`. Si el cobro falla después, la misma acción
revierte las plazas reservadas. No hay un "hold" temporal separado en esta
V1 (el inventario se compromete y libera dentro de la misma operación de
checkout); para tráfico alto en producción, considerar añadir un hold con
expiración antes de escalar el marketing de un viaje concreto.

## Checklist para activar pagos reales

1. Crear cuentas de Stripe y/o PayPal, completar KYC.
2. Rellenar `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`,
   `STRIPE_WEBHOOK_SECRET` y/o `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
   `PAYPAL_WEBHOOK_ID`.
3. Implementar `StripePaymentProvider.charge()` / `PayPalPaymentProvider.charge()`
   usando los SDKs oficiales (PaymentIntents para Stripe, Orders API para
   PayPal).
4. Implementar la verificación de firma en `/api/webhooks/stripe` y
   `/api/webhooks/paypal`, y confirmar el pago **solo** a través del
   webhook (nunca confiar en la redirección del navegador como prueba de
   pago). Los webhooks deben ser idempotentes sobre el id del evento.
5. Poner `APP_MODE=production`.
6. Poner `PAYMENTS_LIVE_ENABLED=true`.
7. Desmarcar `isDemo` únicamente en los viajes reales que vayan a cobrar.
8. Probar un cobro real de importe bajo antes de anunciar el viaje.

No completar alguno de estos pasos deja el sistema en modo demo de forma
segura — no es necesario "desactivar" nada explícitamente si no se llega al
paso 5.
