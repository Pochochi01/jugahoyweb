# Módulo Gym / Fitness Center

Módulo de gestión de gimnasios integrado a JugaHoyWeb: socios, planes y membresías,
cobranzas, control de acceso con QR, clases con reservas y lista de espera, asistencia,
profesores, rutinas versionadas, evaluación física, nutrición, equipos y mantenimiento,
dashboard ejecutivo, reportes exportables, permisos granulares y auditoría.

## Integración con el sistema

| Concepto | Cómo se resuelve |
|---|---|
| Empresa | El complejo (`complexes.id`). Todas las tablas `gym_*` tienen `complex_id` |
| Sucursales | `gym_sucursales` dentro del complejo; socios, clases, accesos, pagos y equipos pueden llevar `sucursal_id` |
| Habilitación | `complexes.modulo_gym`, solo la cambia el administrador general (Configuración del complejo) |
| Usuarios y roles | Super Administrador = `general_admin`; dueño del complejo = acceso total; colaboradores con `collaborators.permisos.gym_rol` = clave de un rol de `gym_roles` |
| Socio | No usa el panel: entra a su app con el link/QR personal (`/gym/socio/:token`), igual que el portal de escuelas |
| Cobros | Cada pago genera recibo correlativo y entra a la caja abierta (`cajaService.registrarEnCaja`, categoría `gym`). Anular un pago registra el egreso compensatorio |
| Tienda e inventario | Se reutiliza Cantina/Almacén (productos, ventas, stock, compras, mermas). El panel Gym tiene un acceso directo |
| Notificaciones | Ingreso bloqueado → notificación in-app al dueño (`notifications.tipo = 'gym_alerta'`) |
| Funciona sin canchas | Sí: la pestaña Gym no depende del modo deportivo/almacén |

## Estructura de carpetas

```
backend/
  docs/GYM.md
  src/
    migrations/20260101000055-create-gym.js        27 tablas + complexes.modulo_gym
    migrations/20260101000056-notif-gym-alerta.js  tipo de notificación
    models/gym.js                                  modelos + asociaciones (exportados por models/index.js)
    routes/gym.js                                  /api/gym
    controllers/gymController.js                   panel (auditado)
    controllers/gymSocioController.js              app del socio (token)
    services/gym/
      comun.js            auditoría, validación de campos, errores, fechas
      permisosGym.js      roles, recursos, acciones, middlewares requireGym / gymPermiso
      sociosService.js    socios, historial, apto médico, QR, control de acceso
      cobranzasService.js membresías, pagos, recibos, morosos, alertas, vencimientos
      clasesService.js    clases, reservas, lista de espera, asistencia
      seguimientoService.js rutinas (versionado), evaluaciones (IMC), nutrición
      catalogosService.js CRUD genérico + planes, profesores, equipos
      reportesService.js  dashboard, KPIs, reportes, export CSV/HTML
      scheduler.js        tareas cada 15 min
  tests/gym.e2e.js                                 npm run test:gym
frontend/src/
  services/gymService.js                           cliente del panel y de la app del socio
  components/gym/GymUI.jsx                         contexto, formato, modal, campos, tabla, KPI, gráficos
  pages/dashboard/GymTab.jsx                       pestaña Gym (navegación según permisos)
  pages/dashboard/gym/                             GymDashboard, GymAcceso, GymSocios, GymCobranzas,
                                                   GymClases, GymRutinas, GymCatalogos, GymReportes, GymConfig
  pages/GymSocioPage.jsx                           app del socio
```

## Modelo de datos (3FN)

Catálogos: `gym_sucursales`, `gym_actividades`, `gym_planes`, `gym_plan_actividades` (puente plan↔actividad),
`gym_profesores` (vínculo opcional a `profesores`), `gym_profesor_horarios`, `gym_roles`, `gym_config` (1:1 complejo).

Socios: `gym_socios` (únicos por complejo: `dni`, `codigo`; único global: `qr_token`), `gym_aptos_medicos`,
`gym_socio_historial` (altas, bajas, renovaciones, pagos, estados, rutinas, evaluaciones).

Hechos: `gym_membresias` (plan asignado con vigencia, precio, descuento, total; `renovacion_de_id`),
`gym_pagos` (recibo único por complejo, medio, anulado, `cash_transaction_id`), `gym_accesos` (cada intento,
permitido/denegado con motivo), `gym_clases`, `gym_reservas` (única por clase+socio), `gym_asistencias`
(ingreso o clase), `gym_auditoria`.

Seguimiento: `gym_rutinas` → `gym_rutina_versiones` → `gym_rutina_ejercicios`; `gym_rutina_comentarios`;
`gym_evaluaciones`; `gym_nutricion_planes` → `gym_nutricion_seguimientos`.

Equipos: `gym_equipos` → `gym_equipo_eventos` (mantenimiento, reparación, garantía, costo).

La cuenta corriente no se guarda: es `SUM(membresías no canceladas) − SUM(pagos no anulados)`.
Planes y actividades usados por membresías o clases tienen FK `RESTRICT`: al "eliminarlos" desde el panel
se desactivan.

Índices: por `complex_id` + columna de filtro habitual (estado, fecha, created_at), `socio_id + fecha`,
`clase_id + socio_id` (único), `complex_id + numero_recibo` (único).

## Reglas de negocio

**Control de acceso** (`POST /acceso` con `metodo` qr|codigo|dni|manual y `dato`). Permite el ingreso solo si:
socio `activo`, membresía vigente hoy, franja horaria del plan, saldo 0 y apto médico vigente (si
`exigir_apto_medico`). Si no cumple: no ingresa, se registra el intento con motivos, se audita y se notifica
al dueño. El ingreso permitido registra una asistencia por día.

**Membresías.** Al asignar un plan, el fin se calcula según el período (diario, semanal, mensual, trimestral,
semestral, anual). Si hay una vigente, la nueva arranca al día siguiente de su vencimiento (renovación
anticipada). El descuento por defecto es el `descuento_pct` del plan.

**Morosos.** El scheduler marca `vencida` cada membresía vencida y pasa a `moroso` al socio activo con deuda
cuyo último vencimiento supera los `dias_gracia`. Un moroso que salda la deuda vuelve a `activo`.

**Estados del socio.** Al congelar se congela la membresía vigente y al descongelar se reactiva. La baja
guarda `fecha_baja`. Cada cambio queda en el historial.

**Clases.** Se pueden repetir de 1 a 26 semanas. No se permite superponer clases del mismo profesor. Con el
cupo lleno la clase pasa a `completa` y las nuevas reservas van a `espera` en orden de llegada. Al cancelar una
reserva, el primero en espera pasa a `reservada`. Las clases terminadas pasan a `finalizada`: las reservas sin
marcar quedan `ausente` y las de espera, `cancelada`. Desde la app, el socio solo reserva actividades
incluidas en su plan vigente (un plan sin actividades incluye todas). La reserva bloquea la fila de la clase
para evitar sobreventa.

**Rutinas.** Guardar cambios crea una versión nueva y las anteriores siguen consultables (`?version=N`). Las
plantillas (`socio_id` nulo) se asignan como copia.

**Evaluación.** El IMC se calcula en el servidor y la altura se acepta en m o en cm.

**Nutrición.** Es opcional (`gym_config.nutricion_habilitada`). Un plan nuevo desactiva el anterior.

**Equipos.** Alertas: mantenimiento vencido o dentro de 7 días (según `frecuencia_mant_dias` y el último
mantenimiento), garantía por vencer en 30 días y equipos fuera de servicio.

## Roles y permisos

Acciones: `ver`, `crear`, `editar`, `eliminar`, `aprobar` (anular pagos, cambiar estado de socios), `exportar`.

Recursos: dashboard, socios, accesos, planes, cobranzas, clases, reservas, profesores, asistencia, rutinas,
evaluaciones, nutricion, equipos, reportes, configuracion, auditoria.

Roles de fábrica, creados por complejo en el primer uso y editables:

| Rol | Resumen |
|---|---|
| Administrador Gym (`admin_gym`) | Todo |
| Recepcionista | Socios (ver/crear/editar), acceso, cobrar, reservas, asistencia, ver planes, clases, profesores, equipos y reportes |
| Profesor | Ver socios; clases, reservas y asistencia; rutinas y evaluaciones (ver/crear/editar) |
| Personal Trainer | Ver socios, clases y asistencia; rutinas y evaluaciones completas |
| Nutricionista | Ver socios; evaluaciones (ver/crear/editar); nutrición completa |

Super Administrador y dueño del complejo tienen todo. El socio usa su app personal.
Solo el dueño o el administrador general pueden editar roles y asignarlos (`PUT /roles…`).

## Endpoints (`/api/gym`)

Panel: `/:complexId/…`, con usuario autenticado, acceso al complejo, módulo habilitado y permiso `recurso:acción`.

| Método y ruta | Permiso |
|---|---|
| `GET /contexto` | permisos del usuario, configuración y sucursales |
| `PUT /config` | configuracion:editar |
| `GET /roles` · `PUT /roles` · `PUT /roles/colaboradores/:colaboradorId` | configuracion:ver · dueño/admin |
| `GET POST /sucursales` · `PUT DELETE /sucursales/:id` | configuracion |
| `GET POST /actividades`, `/planes` · `PUT DELETE …/:id` | planes |
| `GET POST /profesores` · `PUT DELETE /profesores/:id` · `GET /profesores-estadisticas` | profesores |
| `GET POST /equipos` · `PUT DELETE /equipos/:id` · `GET POST /equipos/:id/eventos` | equipos |
| `GET POST /socios` · `GET PUT /socios/:id` | socios |
| `PUT /socios/:id/estado` | socios:aprobar |
| `GET /socios/:id/qr` · `POST /socios/:id/aptos` | socios |
| `POST /socios/:id/membresias` · `POST /socios/:id/pagos` · `DELETE /membresias/:id` | cobranzas |
| `GET /pagos` · `GET /pagos/:id/recibo` · `GET /morosos` | cobranzas:ver |
| `PUT /pagos/:id/anular` | cobranzas:aprobar |
| `POST /acceso` · `GET /accesos` | accesos |
| `GET /alertas` | dashboard:ver |
| `GET POST /clases` · `PUT /clases/:id` · `PUT /clases/:id/cancelar` | clases |
| `GET POST /clases/:id/reservas` · `DELETE /reservas/:id` | reservas |
| `PUT /clases/:id/asistencia` · `GET /asistencia?agrupar=diario\|semanal\|mensual` | asistencia |
| `GET POST /rutinas` · `GET PUT DELETE /rutinas/:id` · `POST /rutinas/:id/asignar` · `POST /rutinas/:id/comentarios` | rutinas |
| `GET POST /socios/:id/evaluaciones` · `PUT DELETE /evaluaciones/:id` | evaluaciones |
| `GET POST /socios/:id/nutricion` · `POST /nutricion/:id/seguimientos` | nutricion |
| `GET /dashboard?desde&hasta&sucursal_id` | dashboard:ver |
| `GET /reportes/:tipo?desde&hasta&formato=json\|csv\|html` | reportes:ver; csv/html requiere reportes:exportar |
| `GET /auditoria` | auditoria:ver |

Reportes disponibles: `socios_activos`, `morosos`, `cobranza`, `asistencia`, `actividades`, `profesores`, `rentabilidad`.

App del socio (`/socio/:token`, sin login): `GET /` (resumen, cuotas, pagos, plan, apto, QR), `GET /reservas`,
`GET /disponibilidad` (14 días), `POST /clases/:claseId/reservar`, `DELETE /reservas/:reservaId`, `GET /rutinas`,
`POST /rutinas/:rutinaId/comentarios`, `GET /evaluaciones`, `GET /asistencia`.

## KPIs del dashboard

- **Retención:** socios del inicio del período que siguen al final ÷ socios al inicio.
- **Churn:** bajas del período ÷ socios al inicio.
- **Ticket promedio:** facturación ÷ cantidad de pagos.
- **Ingreso por socio:** facturación ÷ socios que pagaron.
- **Ocupación de clases:** lugares ocupados ÷ cupos.
- **Morosidad:** morosos ÷ (activos + morosos).
- **Rentabilidad:** facturación − (horas dictadas × valor hora + costo de mantenimiento). El margen es rentabilidad ÷ facturación.

## Auditoría

Toda escritura del panel y de la app del socio, cada intento de acceso y cada exportación quedan en
`gym_auditoria` con: usuario (id y nombre), fecha y hora, acción, entidad e id, detalle (JSON), IP, sucursal y
empresa. La auditoría nunca bloquea la operación: si falla, se registra en el log del servidor.

## Exportación

- **Excel:** CSV separado por `;` con BOM UTF-8, que se abre directo en Excel en español.
- **PDF:** HTML imprimible que abre el diálogo de impresión, donde se elige "Guardar como PDF".

No hace falta agregar dependencias.

## Tareas automáticas

`services/gym/scheduler.js` corre cada 15 minutos para los complejos activos con el módulo habilitado:
vencimiento de membresías, paso a moroso y cierre de clases terminadas.

## Pruebas

`npm run test:gym` corre 55 verificaciones de punta a punta por HTTP. Crea un complejo y usuarios temporales y
los borra al final.

## Despliegue

1. `npm run migrate` (migraciones 055 y 056).
2. Reiniciar el backend: monta `/api/gym` e inicia el scheduler.
3. El administrador general habilita "Módulo Gym / Fitness" en la configuración del complejo.
4. El dueño asigna roles a sus colaboradores en Gym → Configuración → Roles y permisos.
