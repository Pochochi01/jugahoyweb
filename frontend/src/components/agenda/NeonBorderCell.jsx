/**
 * NeonBorderCell
 * Wrapper reutilizable que muestra un punto neón verde
 * recorriendo el borde del contenedor mientras el cursor
 * está sobre él.
 *
 * Props:
 *  active      — boolean: habilita el efecto (default: true)
 *  radius      — number:  border-radius en px (default: 12 = rounded-xl)
 *  speed       — string:  duración CSS de la animación (default: '1.8s')
 *  trail       — boolean: muestra estela detrás del punto (default: true)
 *  className   — string:  clases extra para el div contenedor
 *  style       — object:  estilos extra para el div contenedor
 *  onHoverChange — fn:    callback (hovered: boolean) para hover externo
 *  children    — ReactNode
 *
 * Uso básico:
 *   <NeonBorderCell active={isLibre && !isPast}>
 *     <MiTarjeta />
 *   </NeonBorderCell>
 *
 * Nota: el div contenedor tiene position:relative y overflow:visible
 * para que el punto neón pueda sobresalir levemente del borde.
 */
import { useState } from 'react';
import styles from './NeonBorderCell.module.css';

export default function NeonBorderCell({
  children,
  active       = true,
  radius       = 12,
  speed        = '1.8s',
  trail        = true,
  className    = '',
  style        = {},
  onHoverChange,
  ...rest
}) {
  const [hovered, setHovered] = useState(false);

  const handleEnter = (e) => {
    if (!active) return;
    setHovered(true);
    onHoverChange?.(true);
    rest.onMouseEnter?.(e);
  };

  const handleLeave = (e) => {
    setHovered(false);
    onHoverChange?.(false);
    rest.onMouseLeave?.(e);
  };

  // Extraemos los handlers para no pasarlos dos veces al div
  const { onMouseEnter: _e, onMouseLeave: _l, ...divRest } = rest;

  const cssVars = {
    '--neon-radius': `${radius}px`,
    '--neon-speed':  speed,
  };

  return (
    <div
      className={`${styles.cell} ${className}`}
      style={{ ...style, ...cssVars }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      {...divRest}
    >
      {children}

      {/* Overlay + punto neón — solo cuando está activo y hovereado */}
      {active && hovered && (
        <span className={styles.overlay} aria-hidden="true">
          {trail && <span className={styles.dotTrail} />}
          <span className={styles.dot} />
        </span>
      )}
    </div>
  );
}
