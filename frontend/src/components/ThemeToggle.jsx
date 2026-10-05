import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { preferenciaTema, guardarTema } from '../utils/theme';

const OPCIONES = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'system', label: 'Sistema', Icon: Monitor },
];

/**
 * Selector de tema. `compact` → un solo botón que rota claro/oscuro/sistema
 * (para barras con poco espacio); si no, control segmentado de 3 opciones.
 */
export default function ThemeToggle({ compact = false, className = '' }) {
  const [pref, setPref] = useState(preferenciaTema);
  useEffect(() => {
    const on = (e) => setPref(e.detail);
    window.addEventListener('themechange', on);
    return () => window.removeEventListener('themechange', on);
  }, []);
  const elegir = (v) => { setPref(v); guardarTema(v); };

  if (compact) {
    const i = OPCIONES.findIndex(o => o.value === pref);
    const actual = OPCIONES[i] || OPCIONES[1];
    const siguiente = OPCIONES[(i + 1) % OPCIONES.length];
    return (
      <button type="button" onClick={() => elegir(siguiente.value)} className={`btn-icon ${className}`}
        aria-label={`Tema: ${actual.label}. Cambiar a ${siguiente.label.toLowerCase()}`} title={`Tema: ${actual.label}`}>
        <actual.Icon className="w-[18px] h-[18px]" />
      </button>
    );
  }
  return (
    <div className={`segmented ${className}`} role="group" aria-label="Tema de la interfaz">
      {OPCIONES.map(({ value, label, Icon }) => (
        <button key={value} type="button" aria-pressed={pref === value} onClick={() => elegir(value)} className="segmented-item !px-2.5" title={label}>
          <Icon className="w-4 h-4" /><span className="sr-only sm:not-sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
