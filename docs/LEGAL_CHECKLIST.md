# Checklist legal antes de vender de verdad

Este documento **no es asesoramiento jurídico**. Es una lista de lo que hay
que verificar con un profesional antes de operar comercialmente. Nada de
esto se ha inventado ni se ha rellenado con datos ficticios en el producto:
donde falta información real, la web muestra un placeholder explícito
("Pendiente de completar") en vez de un dato inventado.

## Marca y sociedad

- [ ] Verificación marcaria de "Copa de Ferias" (o el nombre definitivo)
- [ ] Constitución/alta de la sociedad o figura mercantil que va a operar
- [ ] NIF/CIF, domicilio social, datos registrales →
      `BrandConfig.legalName/legalTaxId/legalAddress`

## Agencia de viajes / viajes combinados

- [ ] Licencia de agencia de viajes (o régimen aplicable) en la
      jurisdicción de operación
- [ ] Cumplimiento de la normativa de viajes combinados aplicable
      (información precontractual, garantía frente a insolvencia,
      derechos de desistimiento, etc.)
- [ ] Revisión de `/condiciones` con un profesional — el texto actual es un
      borrador de trabajo

## Seguros

- [ ] Seguro de responsabilidad civil del organizador
- [ ] Seguro de asistencia en viaje ofrecido a los clientes — condiciones
      reales, no las descripciones genéricas de la demo
- [ ] Confirmar que el seguro no sustituye ninguna obligación legal del
      organizador (ya reflejado en el copy, pero debe validarse)

## Política de cancelación y mínimo de viajeros

- [ ] Definir tramos y porcentajes reales de reembolso por cancelación
      (actualmente editable por viaje desde Admin, sin valores por defecto
      vinculantes)
- [ ] Confirmar el criterio de "mínimo de viajeros no alcanzado" y el plazo
      de reembolso íntegro

## Privacidad y cookies

- [ ] Revisión de `/privacidad` y `/cookies` conforme al RGPD/LOPDGDD (o
      normativa aplicable)
- [ ] Confirmar base legal de cada tratamiento (contractual, consentimiento)
- [ ] Documentación de datos de menores — el producto ya exige 18 años
      mínimo, pero debe formalizarse

## Proveedores

- [ ] Contratos con proveedores de transporte, alojamiento y entradas
- [ ] Acuerdos de encargado de tratamiento con Stripe/PayPal/Resend/hosting

## Documentación de viajeros

- [ ] Confirmar qué campos son estrictamente necesarios para cada viaje
      (algunos destinos pueden requerir más datos que otros)
- [ ] Si en el futuro se sube documentación (DNI/pasaporte escaneado),
      **no está implementado en esta V1** — implementar con almacenamiento
      privado y URLs firmadas antes de activarlo (ver spec §69)

## Analítica y marketing

- [ ] Confirmar que los IDs de GA4/Meta/TikTok solo se activan tras
      consentimiento (ya implementado en `CookieConsent` +
      `AnalyticsScripts`) y que ningún dato personal llega a los píxeles
      (ya implementado en `src/lib/analytics/events.ts`)
