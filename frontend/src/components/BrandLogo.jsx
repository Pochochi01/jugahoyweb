/**
 * BrandLogo — emblema recortado + wordmark "JugaHoy" como texto real.
 *
 * Por qué texto en vez de imagen: el logo original es un lockup vertical con el
 * texto muy chico; al achicarlo se volvía ilegible. Acá el emblema se muestra
 * grande y el nombre se reconstruye con tipografía (Poppins, similar al logo) y
 * el color de cada palabra.
 *
 * Colores: "Juga" verde y "Hoy" azul (los del logo). El azul del logo es marino
 * (#07254c) e ilegible sobre el fondo oscuro del sitio, así que se usa el azul de
 * marca #3b82f6 (mismo tono, legible). El verde usa el de marca #22c55e.
 *
 * Props:
 *   emblem   clases de alto del emblema (ej. 'h-12')
 *   text     clases de tamaño del wordmark (ej. 'text-3xl')
 *   tagline  muestra "RESERVA TU CANCHA" debajo
 *   className / tagClass  clases extra
 */
export default function BrandLogo({
  emblem   = 'h-12',
  text     = 'text-3xl',
  tagline  = false,
  tagClass = 'text-[0.5rem] mt-1',
  className = '',
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img src="/emblem.png" alt="" aria-hidden="true" className={`${emblem} w-auto shrink-0`} />
      <span className="flex flex-col leading-none">
        <span className={`font-brand font-bold italic ${text} leading-none whitespace-nowrap`}>
          {/* #439238 = verde exacto del logo | #3b82f6 = azul legible (el marino
              original #07254c es invisible sobre el fondo oscuro) */}
          <span style={{ color: '#439238' }}>Juga</span>
          <span style={{ color: '#3b82f6' }}>Hoy</span>
        </span>
        {tagline && (
          <span className={`font-brand font-semibold uppercase tracking-[0.18em] text-white/55 whitespace-nowrap ${tagClass}`}>
            Reserva tu cancha
          </span>
        )}
      </span>
    </span>
  );
}
