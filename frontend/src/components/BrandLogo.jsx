/**
 * BrandLogo — emblema recortado + wordmark "JugaHoy" como texto real.
 *
 * Por qué texto en vez de imagen: el logo original es un lockup vertical con el
 * texto muy chico; al achicarlo se volvía ilegible. Acá el emblema se muestra
 * grande y el nombre se reconstruye con tipografía (Poppins, similar al logo) y
 * el color de cada palabra.
 *
 * Colores: "Juga" verde y "Hoy" azul (los del logo), como variables por tema
 * (--brand-juga / --brand-hoy en index.css): en tema claro se usa el marino
 * original del logo (#07254c); en oscuro, el azul de marca #3b82f6 (el marino
 * es invisible sobre fondo oscuro). La prop onDark fuerza la versión clara del texto (sobre fotos).
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
  onDark = false,
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${onDark ? 'brand-on-dark' : ''} ${className}`}>
      <img src="/emblem.png" alt="" aria-hidden="true" className={`${emblem} w-auto shrink-0`} />
      <span className="flex flex-col leading-none">
        <span className={`font-brand font-bold italic ${text} leading-none whitespace-nowrap`}>
          {/* #439238 = verde exacto del logo | #3b82f6 = azul legible (el marino
              original #07254c es invisible sobre el fondo oscuro) */}
          <span style={{ color: 'rgb(var(--brand-juga))' }}>Juga</span>
          <span style={{ color: 'rgb(var(--brand-hoy))' }}>Hoy</span>
        </span>
        {tagline && (
          <span className={`font-brand font-semibold uppercase tracking-[0.18em] text-muted-foreground whitespace-nowrap ${tagClass}`}>
            Reserva tu cancha
          </span>
        )}
      </span>
    </span>
  );
}
