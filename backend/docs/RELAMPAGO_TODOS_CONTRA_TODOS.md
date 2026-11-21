# Modalidades relámpago: "Zonas y Llaves APA" y "Todos contra Todos por Zonas"

## Modalidades

El catálogo único está en `formatoPartido.FORMATOS`. Hay una copia idéntica en `frontend/src/utils/formatoPartido.js`.

| Código (`torneos.formato`) | Nombre | Zonas |
|---|---|---|
| `tradicional` | Tradicional | según `parejas_por_zona`; las zonas de 4 juegan con cruces APA |
| `relampago` | **Relámpago con Zonas y Llaves APA** (antes "Relámpago") | igual que el tradicional, con la regla de partido configurable por fase |
| `relampago_rr` | **Relámpago Todos contra Todos por Zonas** (nueva) | zonas de 4, y de 5 con el sobrante; todos contra todos equilibrado |

Sobre el renombre:

- El renombre es **solo de nombre**: el código interno `relampago` se conserva. Los torneos existentes no se tocan y no hubo que migrar datos.
- Selectores, insignias, resumen del formato, página pública, vista previa (`modalidad`) y auditoría (`detalle.modalidad`) toman el nombre de `nombreFormato()`.
- Las dos modalidades relámpago comparten la regla de partido por fase (`formato_partidos`): games, tie-break y final.

## Armado de zonas (todos contra todos)

Algoritmo: `fx.cantidadZonasTodosContraTodos(n)` y después la serpiente existente (`generateSnakeSeedingZones`, con cabezas de serie por ranking).

- Se arman `k = ⌊n/4⌋` zonas. El resto `r = n mod 4` hace que `r` zonas queden de 5; la serpiente reparte esas parejas de más.
- Si `r > k`, no alcanza con zonas de 4 y 5. Pasa con n = 6, 7 y 11: ahí `k = ⌈n/4⌉` y quedan zonas de 3.
  - Es un caso límite: en esas zonas cada pareja juega 2 partidos.
  - La vista previa lo avisa en `todos_contra_todos.aviso`.
- Con menos de 4 parejas se arma 1 zona.

| Parejas | 4 | 5 | 8 | 9 | 12 | 13 | 17 | 21 |
|---|---|---|---|---|---|---|---|---|
| Zonas | 4 | 5 | 4+4 | 5+4 | 4+4+4 | 5+4+4 | 5+4+4+4 | 5+4+4+4+4 |

`parejas_por_zona` queda fijo en 4. Lo usa la llave para calcular `K = min(clasifican, parejas_por_zona)`.

## Fixture: `fx.fixtureZonaEquilibrada(ids, rng)`

- **Zonas de 2, 3 o 4:** todos contra todos (método del círculo existente). Todos los partidos puntúan.
- **Zonas de 5:** cada pareja computa **exactamente 3** partidos.
  1. Un sorteo reproducible elige, en este orden:
     - **S**, la "Pareja sorteada";
     - **R**, su rival compensatorio;
     - **X**, otra pareja.
     - **Y** y **Z** son las dos que quedan.
  2. Se juegan los 10 cruces posibles menos R–X e Y–Z: son 7 partidos normales.
  3. Se agrega **S–R, el partido compensatorio**, que va último. Puntúa para R y no para S.
  4. Resultado:
     - S juega 4 partidos y computa 3;
     - R juega 2 normales más el compensatorio, y computa 3;
     - X, Y y Z juegan 3 cada una.

**Sobre el ejemplo del requerimiento:** el ejemplo (E sorteada, 8 partidos) no cumple la regla pedida. E queda con 2 partidos puntuables y C con 4. El algoritmo cumple la regla ("ninguna pareja con más partidos puntuables que otra"): mantiene 8 partidos y 1 compensatorio, pero la sorteada juega sus 3 partidos normales más el compensatorio.

**Sorteo transparente:**

- Se usa `crypto.randomInt` para la semilla y `mulberry32(semilla)` para el sorteo.
- Con la semilla guardada, el sorteo se puede reproducir y verificar.

## Datos (migración 073)

| Dónde | Campo | Uso |
|---|---|---|
| `torneos.formato` | ENUM + `relampago_rr` | modalidad nueva |
| `torneo_partidos` | `compensatorio` (bool, default false) | marca el partido especial |
| | `puntua_pareja1` / `puntua_pareja2` (bool, default true) | puntúa para cada lado. En el compensatorio: rival `true`, sorteada `false` |
| `torneo_zonas` | `pareja_sorteada_id` (FK a `torneo_parejas`, SET NULL) | qué pareja fue sorteada |
| | `sorteo` (JSON) | auditoría del sorteo (ver abajo) |

El JSON `sorteo` guarda:

- `semilla` y `algoritmo`;
- `candidatos`;
- `pareja_sorteada_id` y `rival_id`;
- `cruces_excluidos`;
- `fecha`, `usuario` y `usuario_id`.

Por qué esta estrategia:

- Marcar por lado (`puntua_parejaN`) es más general que guardar solo "pareja sorteada". La tabla no necesita saber de sorteos.
- Los partidos existentes quedan con los valores por defecto, así que se comportan igual que antes.
- La auditoría del armado (`torneo_inscripcion_eventos`, acción `zonas_generadas`) incluye los sorteos de cada zona.
- La página pública muestra fecha, semilla y rival, pero no el usuario.

## Resultados y tabla (`fx.tablaZona`)

- **El resultado real del compensatorio se guarda y se muestra** en el fixture, el historial y la impresión, con la misma validación de la fase.
- **A la sorteada no le cuenta nada:** ni PJ, ni PG/PP, ni sets, ni games, ni puntos. Se eligió esto en lugar de excluir solo los puntos, por dos razones:
  - Excluir solo los puntos le dejaría 4 PJ y un partido extra de diferencia de sets y games, y eso puede desempatar a su favor. La consigna pide que nunca se beneficie.
  - Así todas las parejas comparan las mismas 3 estadísticas.
- **Al rival le cuenta todo, como un partido normal.**
- **El enfrentamiento directo** solo considera partidos que puntúan para las dos parejas, así que el compensatorio no desempata.
- La tabla informa `no_puntuables` (en memoria) y `pareja_sorteada` (al leerla).
- **Clasificación a la llave:** no cambia. Se usan las posiciones de la tabla con el orden de siempre (puntos, dif. sets, dif. games, enfrentamiento directo, id) y la llave por plantilla, o la genérica si no hay plantilla para esa cantidad de zonas.

## Interfaz

- **Tabla de zona:** etiqueta "Pareja sorteada" con explicación al pasar el mouse, y una nota al pie en las zonas de 5.
- **Grilla de zona, partidos y cronograma:** etiqueta "Partido compensatorio · Puntúa solo para el rival", con el texto pedido en el tooltip. El lado de la sorteada muestra "(no suma en este partido)".
- **Carga de resultados:** aviso del partido compensatorio.
- **Formulario:**
  - selector "Modalidad" con las tres opciones;
  - en Todos contra Todos, "Parejas por zona" queda fijo en 4, con una explicación.

## Pruebas

- `npm run test:relampago:rr`: 8 tests unitarios. Cubren:
  - tamaños de zona de 4 a 40 parejas;
  - serpiente;
  - zona de 4;
  - zona de 5 con 1000 sorteos (exactamente 3 puntuables cada una, las 5 parejas pueden salir sorteadas);
  - reproducibilidad del sorteo;
  - tabla y desempate;
  - catálogo de modalidades.
- `npm run test:relampago:rr:e2e`: 47 verificaciones por la API real.
  - Para 4, 5, 8, 9, 12, 13, 17 y 21 parejas: zonas, partidos, equilibrio y sorteo auditado.
  - Con 13 parejas se juega todo y se verifica la tabla y el paso a la llave.
  - La modalidad APA queda igual que antes.
- Regresiones de torneos, llaves, resultados, ranking, portal, notificaciones e inscripciones: todas en verde.

## Riesgos y casos límite

- **6, 7 y 11 parejas:** necesariamente hay zonas de 3, con 2 partidos por pareja. Se avisa en la vista previa. Alternativa a futuro: zonas de 3 con partido compensatorio, o pedir un mínimo de parejas.
- **Plantillas oficiales de llave:** están pensadas para zonas de 3. Con zonas de 4 o 5, la plantilla se busca por cantidad de zonas y clasificados; si no hay, se usa el armado genérico por siembra. Conviene cargar plantillas específicas desde administración si se usa mucho esta modalidad.
- **W.O. en el compensatorio:** se registra igual que siempre. Si la sorteada no se presenta, el rival gana y suma 2 puntos; la sorteada no pierde nada.
- **Rearmar zonas:** genera un sorteo nuevo con otra semilla y queda auditado. Solo se puede si no hay resultados cargados.

## Rollback

1. `npx sequelize-cli db:migrate:undo` (073): quita las columnas y pasa los torneos `relampago_rr` a `relampago`. Hay que hacerlo antes de que tengan zonas, o aceptar que sus partidos compensatorios vuelvan a puntuar.
2. Revertir:
   - `FORMATOS` y los helpers en las dos copias de `formatoPartido.js`;
   - `cantidadZonasTodosContraTodos`, `fixtureZonaEquilibrada` y los cambios de `tablaZona` en `fixtureService`;
   - `cantidadZonasDe` y el bloque `rr` en `torneoService.generarZonas`;
   - los cambios en `torneosController`;
   - en el frontend, las marcas de `FixtureViews`, `TorneoForm`, `TorneoManager`, `FormatoRelampago`, `ResultadoModal` y `TorneoPublicPages`.

## Orden de horarios en torneos relámpago (ambas modalidades)

**Problema.** `fx.programar` ordenaba los partidos "más restringidos primero" (por horarios preferidos) y le daba a cada uno el primer hueco libre. Por eso un P3 podía quedar antes que un P2 de la misma zona. El número de partido (`torneo_partidos.orden`, P1…Pn) ya se guardaba, pero la programación no lo respetaba.

**Solución.** No hace falta migración: el campo `orden` ya existía.

- `fx.ordenSecuencial(cruces)`: ordena por número de partido intercalando zonas (A·P1, B·P1, C·P1, A·P2…), para que todas las zonas avancen en paralelo.
- `fx.programar(..., { secuencial: true })`:
  - respeta el orden recibido;
  - cada partido recibe un horario igual o posterior al del partido anterior de su zona;
  - con el mismo horario en dos canchas, el de menor número toma la primera cancha;
  - si un horario preferido rompería el orden, el partido queda "fuera de preferencia".
- `torneoService.generarZonas`: en los relámpago se programa en una sola pasada secuencial. Los cruces APA (G1vP2 / G2vP1) siguen esperando a P1 y P2 con descanso.
- **Reprogramación manual** (`validarOrdenZona`): un partido de zona no puede quedar antes del anterior ni después del siguiente de su zona. Si pasa, responde 409 con el detalle. Desprogramar sigue permitido.
- **Visualización:** el cronograma del panel, el del portal de jugador, la impresión y el listado de partidos del portal ordenan por día y horario y, a igual horario, por P1…Pn de la zona.
- **Otras modalidades** (tradicional y llaves): sin cambios. El modo normal sigue priorizando los partidos más restringidos.

**Pruebas.**

- `npm run test:relampago:orden` (6 tests):
  - 1 zona con horarios consecutivos (09:00, 09:30, 10:00);
  - preferencias que antes adelantaban a P3;
  - 3 zonas en paralelo;
  - empate de horario en dos canchas;
  - zona APA;
  - el orden de programación.
- `npm run test:relampago:rr:e2e`:
  - orden por zona en todos los torneos de 4 a 21 parejas;
  - reprogramación que rompe el orden → 409;
  - reprogramación válida → 200, y la secuencia se mantiene;
  - el portal de jugador muestra el mismo orden.
