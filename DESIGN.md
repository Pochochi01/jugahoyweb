# JugaHoy — Sistema de diseño

Guía corta para que cada pantalla nueva se vea y se comporte como el resto.
Fuente de verdad: `frontend/src/index.css` (tokens y componentes) y
`frontend/tailwind.config.js` (escala). Si algo no está acá, no lo inventes en
un componente: agregalo al sistema.

## Principios

1. **Es una herramienta.** Jugadores reservando y administradores operando la
   agenda: claridad y velocidad antes que decoración. La marca vive en los
   detalles (verde de acción, logo, tipografía), no en efectos.
2. **Un mismo vocabulario en toda la app.** Mismo botón, mismo input, mismo
   modal. Si el "Guardar" se ve distinto en dos pantallas, uno está mal.
3. **Dos temas, cero colores sueltos.** Todo color sale de un token; así el
   tema claro y el oscuro funcionan sin tocar el componente.
4. **Movimiento = estado.** Se anima lo que cambia (abrir, seleccionar,
   confirmar), rápido y con curva de salida. Nada de coreografías de carga.

## Tema claro / oscuro

- `<html data-theme="dark|light">`. Por defecto **oscuro** (identidad histórica).
- La preferencia (`dark` | `light` | `system`) se guarda en
  `localStorage.theme`. `index.html` la aplica antes de pintar (sin destello) y
  `src/utils/theme.js` la cambia en caliente. Selector: `<ThemeToggle />`
  (o `<ThemeToggle compact />` en barras).
- **Probá cada pantalla nueva en los dos temas** antes de darla por terminada.

## Tokens de color

Se usan como clases de Tailwind (`bg-card`, `text-muted-foreground`,
`border-border`, `bg-danger/10`…). Cada token es un triplete RGB, así funciona
la opacidad (`/10`, `/40`).

| Token | Uso |
|---|---|
| `background` | lienzo de la página |
| `subtle` | 2.º neutro: sidebar, barras, pie |
| `card` | tarjetas y paneles |
| `elevated` | modales, popovers, menús, toasts |
| `muted` | rellenos de hover, chips, pistas |
| `foreground` / `muted-foreground` | texto principal / secundario (≥4.5:1 en ambos temas) |
| `border`, `input`, `ring` | bordes, fondo de inputs, anillo de foco |
| `primary` (+ `primary-foreground`, `primary-600` hover) | acción principal, selección actual |
| `secondary` | azul del logo: CTA secundarios puntuales |
| `success` · `danger` · `warning` · `info` · `violet` | estados (texto legible tal cual; fondo suave con `/10`–`/15`) |

Reglas:

- **Texto sobre verde:** siempre `text-primary-foreground`, nunca `text-white`
  (en oscuro el verde es brillante y lleva texto oscuro; en claro es profundo y
  lleva blanco). `.btn-primary` ya lo resuelve.
- El verde se reserva para **acción, selección y estado OK**; no para decorar.
- Prohibido en código nuevo: hex (`#22c55e`), `rgba(...)` en `style`, y la
  paleta cruda de Tailwind (`text-green-400`, `bg-red-50`, `text-slate-800`).
  Existe una capa de compatibilidad en `index.css` que traduce esos colores
  viejos a tokens; es un puente para pantallas antiguas, no un permiso.
- Si un color va sobre una foto (hero, panel de login), ahí sí corresponde
  blanco fijo con un velo oscuro debajo.

## Tipografía

- Interfaz: **Plus Jakarta Sans** (variable, self-hosted vía
  `@fontsource-variable/plus-jakarta-sans`). Una sola familia para todo.
- Wordmark "JugaHoy": Poppins 700 itálica, solo dentro de `<BrandLogo />`.
- Escala fija (rem, ratio ~1.2): `text-2xs` 11 · `xs` 12 · `sm` 14 (controles,
  tablas) · `base` 16 (cuerpo) · `lg` 18 · `xl` 20 · `2xl` 24 · `3xl` 30 ·
  `4xl` 36 · `5xl`+ solo en marketing.
- Jerarquía con **peso + tamaño + color**, no solo tamaño: títulos
  `font-bold`/`font-extrabold` con tracking negativo (ya viene en la escala),
  metadatos en `text-muted-foreground`.
- Números que se comparan (horarios, precios, contadores): clase `tabular`.
- Fechas: "Lunes 5 de octubre" (solo la primera letra en mayúscula). Nunca
  `capitalize` de CSS sobre fechas: pone "De" en mayúscula.

## Forma, profundidad y espacio

- Radios: controles `rounded-lg` (10px), tarjetas `rounded-2xl` (16px),
  chips/badges `rounded-full`. No mezclar otros.
- Sombras con desplazamiento y blur, teñidas por tema: `shadow-sm` (controles),
  `shadow-card` (tarjetas), `shadow-pop` (modales/menús). Sin halos de neón.
- Tarjetas solo cuando la elevación significa algo. Para agrupar alcanza con
  espacio, `border-t` o `divide-y`. **Nunca tarjeta dentro de tarjeta.**
- Espaciado: grupos apretados (`gap-2`/`space-y-1.5`), separación generosa
  entre bloques (`space-y-5`/`mb-6`), más aire arriba de un título que abajo.
- Objetivos táctiles ≥ 40px (botones `min-h-[2.5rem]`, slots de horario 44px).

## Componentes base (clases en `index.css`)

| Clase | Para qué |
|---|---|
| `.btn-primary` `.btn-secondary` `.btn-outline` `.btn-ghost` `.btn-danger` | botones (una acción primaria por vista) |
| `.btn-lg` `.btn-sm` `.btn-icon` | tamaños; `.btn-icon` siempre con `aria-label` |
| `.btn-google` | acceso con Google (estilo oficial claro/oscuro) |
| `.input` `.label` `.hint` `.field-error` | formularios: label arriba, ayuda/error abajo |
| `.alert-error` `.alert-success` `.alert-info` | avisos en línea (`role="alert"` en errores) |
| `.badge-green/red/yellow/blue/neutral` | estados cortos |
| `.segmented` + `.segmented-item` (`aria-pressed`) | cambiar de vista / filtro |
| `.skeleton` | carga con la forma del contenido (no spinners en el medio) |
| `.card` | superficie elevada |
| `.glass` | solo barras fijas superiores |

Componentes React reutilizables:

- `AuthLayout` (+ `GoogleIcon`, `Divider`): login, registro, recuperación.
- `ThemeToggle`, `BrandLogo` (`onDark` sobre fotos).
- `SportIcon`, `SportTile`, `SportChip`, `labelDeporte()`: deportes con íconos
  dibujados. **No usar emojis como íconos.**
- Íconos: `lucide-react`, 16–18px en UI, trazo por defecto.

## Patrones

- **Modales:** en celular son paneles que suben desde abajo (`items-end`,
  `rounded-t-2xl`, `animate-sheet-in`, barrita de arrastre); en escritorio,
  modal centrado (`sm:animate-pop-in`). Fondo `bg-elevated border-border
  shadow-pop`, encabezado neutro con título + `btn-icon` de cerrar, pie fijo
  con las acciones. `role="dialog" aria-modal="true" aria-labelledby`. Antes de
  abrir un modal, preguntate si alcanza con algo en línea.
- **Toasts:** `bg-elevated` + ícono de estado de color (no fondos rojos/verdes
  llenos), `role="status"`, abajo centrado en celular.
- **Estados vacíos:** ícono en baldosa `bg-muted`, frase que diga qué pasa y
  una acción para salir ("Ver el día siguiente").
- **Formularios:** `autoComplete` correcto (`email`, `current-password`,
  `new-password`, `tel`, `one-time-code`), `inputMode`, `htmlFor`/`id`, errores
  con `aria-invalid` + `aria-describedby`. El texto del error dice qué pasó y
  cómo seguir.
- **Navegación del panel:** sidebar agrupada (Operación / Actividades /
  Gestión / Plataforma), ítem activo con `aria-current="page"`; en celular,
  drawer con fondo oscurecido que cierra con Escape.
- **Fechas en reservas:** selector rápido de próximos días + la fecha completa
  abre el calendario nativo (`showPicker()`).

## Movimiento

- Curvas: `ease-out` = `cubic-bezier(0.23,1,0.32,1)` (UI), `ease-drawer` para
  paneles. Nunca `ease-in` en UI.
- Duraciones: 160ms (hover/press) · 200–250ms (popovers, modales) · ≤300ms.
- Presión: `active:scale-[0.97]` en lo que se toca (ya en `.btn`).
- Transicioná propiedades concretas (`transition-[background-color,border-color]`),
  no `transition-all`.
- Entradas disponibles: `animate-fade-in`, `animate-pop-in`, `animate-sheet-in`,
  `animate-drawer-in`. Nada de `data-aos` en pantallas de la app.
- `prefers-reduced-motion` ya está cubierto globalmente.

## Accesibilidad (checklist por pantalla)

- [ ] Contraste ≥4.5:1 en texto y placeholders, en **los dos temas**.
- [ ] Todo control alcanzable con teclado y con foco visible (anillo `ring`).
- [ ] Botones de solo ícono con `aria-label`; íconos decorativos `aria-hidden`.
- [ ] Inputs con `<label htmlFor>`; nada de placeholder como label.
- [ ] Selecciones con `aria-pressed` / `aria-current`; modales con `aria-modal`.
- [ ] Errores con `role="alert"`; confirmaciones con `role="status"`.
- [ ] Probado a 390px (celular) y 1440px, sin scroll horizontal.
- [ ] Copy en el idioma del producto (voseo, frases cortas, verbos concretos).

## Cómo agregar una pantalla nueva

1. Partí de los componentes base; si necesitás uno nuevo, agregalo a
   `index.css` (`@layer components`) y documentalo acá.
2. Colores solo con tokens; si falta un rol semántico, sumá el token a ambos
   temas en `index.css` y a `tailwind.config.js`.
3. Revisá en claro y oscuro, celular y escritorio, y corré
   `.claude/skills/impeccable/scripts/impeccable detect <archivos>`.
