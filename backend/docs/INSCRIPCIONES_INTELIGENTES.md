# Inscripciones inteligentes (torneos)

Servicio central: `services/torneos/inscripcionesService.js`. Lo usan:

- el alta de parejas (`torneoService.inscribirPareja`);
- la edición de inscripciones (`torneoInscripcionesController.update`);
- el plantel (`plantelService`);
- el armado de zonas (`prepararSiembra` y `generarZonas`).

Aplica a todos los torneos de pádel: tradicionales y relámpago, únicos y anuales, todas las ligas y categorías y los tres géneros.

## Autocompletado

Al inscribir, cada jugador se completa con lo que ya existe en la base, sin pisar datos cargados:

1. Se busca en el registro del club (`padel_jugadores`):
   - por DNI;
   - si no hay DNI, por nombre exacto (solo si hay un único jugador con ese nombre);
   - o por email o teléfono.
2. Si todavía falta algo, se busca en los usuarios registrados por email o teléfono.

La respuesta del alta trae `autocompletados: [{ jugador, campos }]`. La auditoría también registra qué se completó.

## Búsqueda de jugadores (panel)

`GET /api/torneos/club/:cid/torneos/:tid/jugadores/buscar?q=` busca por nombre, apellido, DNI, email o teléfono, en el registro del club y en los usuarios registrados. Devuelve:

- nombre y apellido;
- DNI, email y teléfono;
- categoría habitual;
- ranking en la liga y la temporada del torneo.

En el formulario del panel se sugieren jugadores mientras se escribe en cualquiera de esos campos, y al elegir uno se completan todos.

La web pública **no** usa esta búsqueda, para no exponer datos personales de terceros.

## Duplicados

El control se hace contra las parejas activas del torneo (pendientes o pagadas) y también entre los dos jugadores de la misma pareja:

| Dato | Comparación | Mensaje |
|---|---|---|
| DNI | exacta | "El DNI … ya pertenece a un participante de este torneo (…)." |
| Email | sin distinguir mayúsculas | "El email … ya se encuentra registrado en una pareja inscripta (…)." |
| Teléfono | últimos 10 dígitos (`3811234567` = `5493811234567`) | "El teléfono … ya pertenece a otro jugador anotado (…)." |
| Jugador | registro del club (`jugador_id`) | "… ya está inscripto en otra pareja de este torneo." |

La respuesta 409 trae `conflictos: [{ campo, mensaje, pareja_id }]` y el formulario los muestra todos.

Al editar una inscripción o el plantel solo se controla lo que cambia, para no trabar inscripciones históricas.

## Datos obligatorios

- **Web pública:** nombre, DNI, email y teléfono. Si falta algo responde 400 con `faltantes`.
- **Panel (alta administrativa):** puede seguir sin email ni teléfono.
- **El DNI sigue siendo obligatorio para todos:** es la identidad del jugador para el ranking, el portal y el control de duplicados.

## Bloqueo al armar zonas

`torneo_categorias.inscripciones_cerradas` se activa al armar las zonas de la categoría y se registra en la auditoría. Mientras está cerrada:

- no se pueden agregar parejas, ni desde el panel ni desde la web;
- en el plantel no se pueden agregar ni eliminar jugadores, ni cambiar el DNI o el nombre de un integrante;
- al editar la inscripción no se puede cambiar el nombre ni la categoría;
- en todos esos casos la respuesta es 409 con el mensaje: "Las zonas ya fueron generadas. Las inscripciones se encuentran cerradas.";
- sí se pueden corregir el email, el teléfono y los horarios.

## Reapertura

- `POST /torneos/:tid/inscripciones/reabrir { categoria_id?, motivo }`.
- Pueden reabrir solo el Administrador General (`general_admin`), el administrador del club (`complex_admin`) y el organizador del torneo. Un colaborador recibe 403.
- El motivo es obligatorio (mínimo 5 caracteres).
- No se puede reabrir con la categoría en fase de llaves.
- Queda registrado el usuario, la fecha y hora y el motivo.
- Con las inscripciones reabiertas, el panel puede agregar o cambiar parejas. La web pública sigue cerrada porque la categoría ya tiene fixture.
- Al volver a armar las zonas, las inscripciones se cierran de nuevo.

`GET /torneos/:tid/inscripciones/estado` devuelve el estado por categoría y `puede_reabrir`; la interfaz lo usa para mostrar u ocultar el botón.

## Controles antes de armar zonas

`inconsistencias(parejas)` revisa:

- DNI, email, teléfono o jugador repetidos;
- parejas incompletas;
- nombre, DNI, categoría o género faltantes.

Si encuentra algo, responde 409 y lista los problemas (`inconsistencias`). Hasta que se corrijan no se pueden armar las zonas.

## Auditoría

Tabla `torneo_inscripcion_eventos`. Cada evento guarda:

- el torneo, la categoría y la pareja;
- la acción;
- el detalle (JSON) y el motivo;
- el usuario (`usuario_id` y nombre) y la fecha y hora.

Acciones registradas:

- `inscripcion_creada`;
- `inscripcion_modificada` (edición y plantel);
- `inscripcion_eliminada` (cancelada o reembolsada);
- `zonas_generadas`;
- `inscripciones_bloqueadas`;
- `inscripciones_reabiertas`.

`GET /torneos/:tid/inscripciones/auditoria` devuelve el historial; en el panel está en **Auditoría** dentro de Inscripciones.

## Migración 072

- `torneo_categorias.inscripciones_cerradas` (default `false`).
  - Backfill: las categorías que ya armaron zonas quedan cerradas.
- `torneo_jugadores.whatsapp` pasa a aceptar NULL (altas administrativas sin teléfono).
- Tabla nueva `torneo_inscripcion_eventos`.
- No se modifica ninguna inscripción existente.

## Pruebas

- `npm run test:inscripciones`: 37 verificaciones por la API real.
- `npm run test:inscripciones:unit`: funciones puras.
- Tests existentes ajustados a las nuevas reglas:
  - `torneos-plantel`: reemplazar un integrante tras armar zonas ahora exige reabrir.
  - `ranking-anual`, `notificaciones-push` y `notificaciones-recarga`: usaban el mismo teléfono para varios jugadores.

## Rollback

1. `npx sequelize-cli db:migrate:undo` (072): quita la tabla y la columna. Los `whatsapp` NULL pasan a `''` y la columna vuelve a NOT NULL.
2. Revertir:
   - `inscripcionesService.js` y sus llamadas en `torneoService`, `plantelService` y `torneoInscripcionesController`;
   - las 4 rutas nuevas en `routes/torneos.js`;
   - en el frontend, `InscripcionForm.jsx`, `EstadoInscripciones.jsx` y la sección Inscripciones de `TorneoManager.jsx`.
