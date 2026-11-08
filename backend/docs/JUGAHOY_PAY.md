# Jugahoy Pay — motor único de cobros

Motor centralizado para cobrar cualquier concepto del club con **QR dinámico + link de pago**
(Mercado Pago Checkout Pro con la cuenta propia de cada club), con liquidación de turnos,
cuenta corriente, tiempo real, auditoría y dashboard financiero.

## Arquitectura

```
Módulo (reservas, escuela, cantina, portería, torneos…)
   │  createPaymentOrder({ complexId, modulo, referencia, cliente, concepto, detalle, importe })
   ▼
services/pay/payEngine.js ──► pay_orders (token UUID v4) ──► /pay/:token  (QR + link)
   │                                                         │ "Pagar ahora"
   │                                                         ▼
   │                                    services/pay/providers.js (Mercado Pago: preference)
   │                                                         │
   │  POST /api/webhooks/mercadopago  ◄──────────────────────┘ (firma x-signature, dedupe)
   ▼
aplicarPago (transacción + lock, idempotente por provider_payment_id)
   ├─ pay_payments / pay_events (auditoría) / pay_account_movements (cuenta corriente)
   ├─ handler del módulo (services/pay/handlers.js): caja, turno cobrado, cuota pagada…
   └─ bus → SSE (página de pago, QR del panel, kiosco) + push / email al cliente
```

| Archivo | Rol |
|---|---|
| `services/pay/payEngine.js` | API interna: `createPaymentOrder`, `generatePaymentQR`, `iniciarCheckout`, `procesarPagoProveedor`, `confirmPayment`, `cancelPayment`, `refundPayment`, `expirarVencidas`, bus de eventos |
| `services/pay/liquidacion.js` | Funciones puras en centavos: `splitReservationPayment`, `calculateConsumptionDistribution`, `mergeReservationAndConsumptions` |
| `services/pay/payService.js` | Casos de uso: liquidación de turnos, cuotas de escuela, cuenta corriente, cobro de saldo, `sendPaymentReminder`, dashboard, jobs |
| `services/pay/handlers.js` | Qué hace cada módulo al aprobarse / reembolsarse un pago (registro desacoplado) |
| `services/pay/providers.js` | Pasarelas (estrategia). Hoy Mercado Pago; MODO, GetNet, Payway, Naranja X se agregan con la misma interfaz |
| `routes/pay.js`, `routes/payWebhooks.js` | API pública, del club y webhook |

## Base de datos (migración 070, solo tablas nuevas)

- `pay_orders` — orden (token único, módulo y referencia genéricos, grupo de liquidación, cliente, detalle, importe / pagado, estado, vencimiento).
- `pay_payments` — pagos del proveedor; `(provider, provider_payment_id)` único → un webhook repetido no cobra dos veces.
- `pay_events` — auditoría de cada cambio (origen: api, webhook, admin, job, público; usuario).
- `pay_webhook_logs` — cada notificación (request-id único, firma válida, resultado).
- `pay_account_movements` — cuenta corriente (cargo +, pago −; saldo deudor = SUM).

Estados de la orden: `pendiente → procesando → aprobado` · `parcial` · `rechazado` (puede reintentar) · `vencido` · `cancelado` · `reembolsado`.

## Modos de cobro

| Modo | Dónde |
|---|---|
| 1 Un jugador paga todo · 2 Partes iguales · 3 Porcentaje · 4 Por pareja | `splitReservationPayment` (turno → "Generar cobro") |
| 5 Consumos individuales · 6 Grupales (o por pareja) | `calculateConsumptionDistribution` |
| 7 Pago parcial | orden con `permite_parcial` (el cliente elige el monto en /pay/:token) |
| 8 Pago posterior | orden "a cuenta" sin vencimiento (queda en la cuenta corriente) |
| 9 Cobro del saldo pendiente | `cobrarSaldo`: una orden por todo lo pendiente; al pagarla se cancelan las incluidas |

## API

Pública: `GET /api/pay/public/:token`, `GET …/qr`, `POST …/checkout { monto? }`, `GET …/events` (SSE).
Club (`/api/pay/club/:complexId`, permisos `caja` / `agenda` / `escuela` / `cantina_ventas`):
`POST /ordenes`, `GET /ordenes`, `GET /ordenes/:id`, `POST /ordenes/:id/{confirmar,cancelar,reembolsar,recordatorio}`,
`POST|GET /reservas/:bookingId/liquidacion`, `POST /escuela/cuotas/:pagoId/orden`,
`GET /cuenta`, `GET /cuenta/:clienteKey`, `POST /cuenta/:clienteKey/cobrar-saldo`, `GET /dashboard`, `GET /events` (SSE).
Webhook: `POST /api/webhooks/mercadopago?complex_id=N`.

Pantallas: `/pay/:token` (pago), `/autopago` (kiosco), `/admin/porteria/venta` (→ panel, pestaña Jugahoy Pay),
Panel → **Jugahoy Pay** (Cobro QR, Órdenes, Cuenta corriente, Finanzas), Agenda → turno → **Generar cobro (QR por jugador)**,
Escuelas → Cuotas → **Cobrar online (QR)**.

## Seguridad

- Token público UUID v4 (no adivinable); la página pública no expone DNI, email ni teléfono.
- Webhook: firma HMAC `x-signature` con `MP_WEBHOOK_SECRET` (inválida → 401); el pago SIEMPRE se consulta a Mercado Pago con el token OAuth del club; la orden debe ser de ese club; dedupe por request-id y por payment id.
- Transacción con lock de la orden por cada pago (ACID): orden, pago, cuenta corriente, caja y módulo se confirman juntos.
- Rate limiting en los endpoints públicos; permisos por rol en los del club; aislamiento por club.

## Configuración

| Variable | Uso |
|---|---|
| `MP_WEBHOOK_SECRET` | Clave secreta de webhooks (Mercado Pago → Tus integraciones → Webhooks). Recomendado en producción |
| `PUBLIC_API_URL` | URL pública del backend (para `notification_url`) |
| `PAY_JOBS=0` | Desactiva vencimientos y recordatorios automáticos |

Cada club conecta su propia cuenta en Configuración → Mercado Pago (OAuth existente).

## Pruebas

- `npm run test:pay` — liquidación (11 casos, cobertura 100 % de líneas).
- `npm run test:pay:e2e` — 45 verificaciones de punta a punta con Mercado Pago simulado.

## Rollback

1. `npx sequelize-cli db:migrate:undo` (070): elimina las tablas `pay_*`. No toca reservas, cuotas, caja ni cantina.
2. Quitar `app.use('/api/pay'…)` y `app.use('/api/webhooks'…)` de `src/app.js` y el arranque de jobs en `server.js`.
3. Revertir el bloqueo en `agendaController.cobrarTurno` (solo evita el doble cobro cuando hay órdenes activas).
4. Frontend: revertir rutas (`/pay`, `/autopago`, `/admin/porteria/venta`), la pestaña y los botones en TurnoModal / Escuelas.
Los pagos ya aprobados quedan registrados en la caja y en los módulos (cuotas pagadas, turnos cobrados).
