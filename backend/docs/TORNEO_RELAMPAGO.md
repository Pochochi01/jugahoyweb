# Torneo Relámpago: formato de partido configurable por fase

Un torneo ahora tiene **Formato de partidos**: `tradicional` (el de siempre) o `relampago`.
En un relámpago el organizador define, para cada fase, cuántos games se juegan, a cuántos puntos va el tie-break y, en la final, el modo (set único, 2 sets + súper tie-break o 2 sets con 3º completo).
El formato es independiente del **tipo** (`unico` / `anual`, que define siembra y ranking): un relámpago puede ser único o anual.

## Modelo de datos (migración 071)

| Columna | Tipo | Default | Uso |
|---|---|---|---|
| `torneos.formato` | ENUM('tradicional','relampago') | `tradicional` | Todos los torneos existentes quedan tradicionales: mismas reglas que antes |
| `torneos.formato_partidos` | JSON, nullable | NULL | Solo relámpago: `{ zonas, cuartos, semifinal, final }` |

Cada fase es una **regla de partido**:

```json
{ "tipo": "un_set | dos_sets_super_tb | mejor_de_3", "games": 4, "tiebreak": 7, "super_tiebreak": 10, "ventaja": true }
```

- `games` va de 2 a 15, `tiebreak` de 3 a 21 y `super_tiebreak` de 5 a 25 (solo en `dos_sets_super_tb`).
- 16avos y octavos usan la regla de **cuartos**.
- `ventaja: true` (clásico, con G games):
  - se gana G-0 a G-(G-2) o (G+1)-(G-1);
  - en G-G va tie-break y el set termina (G+1)-G.
- `ventaja: false` (sin ventaja):
  - se gana G-0 a G-(G-2);
  - en (G-1)-(G-1) va tie-break y el set termina G-(G-1). Ejemplo: 4-3 en sets a 4.
- El tie-break y el súper tie-break se ganan llegando a N con 2 de diferencia. Pasado N, la diferencia tiene que ser exactamente 2.

Con `{ tipo: mejor_de_3, games: 6, tiebreak: 7, ventaja: true }` las reglas coinciden con las tradicionales; está cubierto por un test.

## Motor (`services/torneos/formatoPartido.js`)

Funciones puras, sin acceso a la base:

- `normalizarFormato`, `normalizarRegla`: validan y completan la configuración (responden 400 con un mensaje claro).
- `reglaPartido(torneo, ronda)`: devuelve la regla del partido según su fase. En un torneo tradicional devuelve la regla histórica.
- `validarSet`, `validarTieBreak`, `validarResultado`: validación dinámica según la regla.
- `setsWalkover`: resultado de un W.O. según la fase (G-0 en cada set necesario: 4-0 en un set a 4, 6-0 6-0 en dos sets a 6).
- `describirRegla`, `resumenFormato`: textos para las pantallas.

Para agregar un formato nuevo se agrega una entrada en `TIPOS` y su regla.

**Copia en el frontend:** `frontend/src/utils/formatoPartido.js` es una copia idéntica. Se usa para validar en vivo y para las pantallas. Hay que mantener las dos iguales; un chequeo de 1476 casos no encontró diferencias.

## Puntos de integración

| Archivo | Cambio |
|---|---|
| `models/Torneo.js` | campos `formato`, `formato_partidos` |
| `controllers/torneosController.js` | Valida y normaliza el formato. Ignora `formato_partidos` en los tradicionales. Con el fixture armado no deja cambiar el formato. Una fase solo se puede reconfigurar si no tiene resultados (si tiene, responde 409) |
| `services/torneos/resultValidation.js` | `validateResult(data, tercerSet, regla)` y `validateWalkover(data, regla)`. Sin `regla` se aplica la validación histórica |
| `services/torneos/torneoService.js` | `registrarResultado` toma la regla de la fase del partido. `recalcularTablaZona` le pasa a la tabla el índice del súper tie-break |
| `services/torneos/fixtureService.js` | `tablaZona(..., { superTb })` y `resumenSets(sets, superTb)`. En relámpago el súper tie-break cuenta como set, pero sus puntos no suman como games. En los tradicionales todo sigue igual |
| `services/playerPortalService.js` | El portal (solo lectura) devuelve `formato` y `formato_partidos` |

Lo que no cambió:

- zonas, round robin y armado de llaves (16avos a final), y cruces oficiales;
- programación y reprogramación;
- notificaciones (el texto del resultado ya es genérico);
- ranking anual (asigna puntos por instancia alcanzada; no depende de games).

La tabla de posiciones (PJ, PG, PP, sets y games a favor y en contra, diferencias) se calcula desde los sets guardados, sin asumir 6 games ni 3 sets.

## Frontend

- **Formulario del torneo:** selector *Formato de partidos*.
  - En relámpago se oculta el *3er set* y aparecen las tarjetas **Zonas · Cuartos · Semifinales · Final** (`components/torneos/FormatoRelampago.jsx`).
  - Cada tarjeta tiene games, tie-break, súper tie-break, "sin ventaja" y los resultados válidos.
  - En la Final se elige el modo.
- **Carga de resultados** (`ResultadoModal.jsx`), según la regla de la fase:
  - "Set único" muestra un solo set;
  - los casilleros admiten hasta el máximo de games de la fase (con 2 dígitos si pasa de 9);
  - el tie-break aparece en el marcador que corresponde;
  - el súper tie-break se carga a N;
  - el W.O. muestra el resultado de la fase;
  - la ayuda indica los resultados válidos.
  - En los tradicionales sigue con los validadores de siempre.
- **Pantallas:** tarjeta *Formato Relámpago* (Zona: 1 set a 4 games · tie-break a 7 …) en:
  - el panel del torneo (Partidos, Llave y Posiciones), junto con la insignia "Relámpago";
  - la página pública;
  - el portal de jugador.

## Pruebas

- `npm run test:relampago`: 10 tests unitarios del motor, con 99 % de cobertura de líneas. Cubren:
  - set a 4 con y sin ventaja;
  - tie-break a 10;
  - los tres modos de final;
  - equivalencia con el formato tradicional;
  - límites;
  - W.O.;
  - tabla de posiciones.
- `npm run test:relampago:e2e`: 22 verificaciones por la API real. Cubren:
  - configuración inválida;
  - inválidos en zona (6-2, 6-4, 4-3, 5-4 sin tie-break, 2 sets);
  - W.O. 4-0;
  - tabla de posiciones;
  - semifinal con tie-break a 10;
  - final con 2 sets + súper tie-break;
  - reconfiguración bloqueada en una fase con resultados y permitida en una sin resultados;
  - torneo tradicional sin cambios.
- Regresiones en verde: `test:resultados`, `test:resultados:e2e`, `test:torneos`, `test:torneos:llave`, `test:llaves`, `test:llaves:e2e`, `test:torneos:puntajes`, `test:ranking`, `test:portal-jugador` y `test:torneos:siembra`.

## Rollback

1. Si hay torneos relámpago en curso, terminarlos o cancelarlos. Al revertir, sus resultados quedan guardados, pero no se podrían corregir con las reglas tradicionales.
2. `npx sequelize-cli db:migrate:undo` (071): quita `formato` y `formato_partidos`. No toca resultados, tablas ni llaves.
3. Revertir el código: borrar `formatoPartido.js` (backend y frontend) y `FormatoRelampago.jsx`, y deshacer los cambios de la tabla de integración. Todo está detrás de `formato === 'relampago'`: sin la columna, todos los torneos funcionan como tradicionales.
