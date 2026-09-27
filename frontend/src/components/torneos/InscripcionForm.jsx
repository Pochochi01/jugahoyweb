import { useState } from 'react';
import HorariosEditor from './HorariosEditor';
import { CATEGORIAS, catLabel, errMsg } from '../../utils/torneos';

const JUGADOR = { nombre: '', dni: '', whatsapp: '', email: '', categoria: '', genero: '' };

/**
 * Formulario de inscripción de una pareja (datos personales, categoría, género
 * y horarios preferidos). `onSubmit(data)` debe devolver una promesa.
 * `extra` permite agregar campos del organizador (p. ej. "ya pagó").
 */
export default function InscripcionForm({ torneo, onSubmit, submitLabel = 'Inscribir pareja', extra }) {
  const generoFijo = torneo.genero === 'mixto' ? ['masculino', 'femenino'] : [torneo.genero, torneo.genero];
  const [jugadores, setJugadores] = useState(generoFijo.map(g => ({ ...JUGADOR, genero: g })));
  const [horarios, setHorarios] = useState([{ fecha: null, desde: '18:00', hasta: '23:00' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setJ = (i, k, v) => setJugadores(js => js.map((j, x) => (x === i ? { ...j, [k]: v } : j)));
  const categoriasValidas = CATEGORIAS.filter(c => c >= torneo.categoria);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    for (const [i, j] of jugadores.entries()) {
      if (!j.nombre.trim() || !j.dni || !j.whatsapp || !j.categoria) return setError(`Completá los datos del jugador ${i + 1}.`);
    }
    if (!horarios.length) return setError('Indicá al menos un horario en el que puedan jugar.');
    setSaving(true);
    try {
      await onSubmit({ jugadores: jugadores.map(j => ({ ...j, categoria: Number(j.categoria) })), horarios_preferidos: horarios });
    } catch (err) {
      setError(errMsg(err));
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid md:grid-cols-2 gap-4">
        {jugadores.map((j, i) => (
          <fieldset key={i} className="card space-y-3">
            <legend className="font-semibold text-sm px-1">Jugador {i + 1}</legend>
            <input className="input" placeholder="Nombre y apellido" value={j.nombre} onChange={e => setJ(i, 'nombre', e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input className="input" inputMode="numeric" placeholder="DNI" value={j.dni} onChange={e => setJ(i, 'dni', e.target.value)} />
              <select className="input" value={j.categoria} onChange={e => setJ(i, 'categoria', e.target.value)}>
                <option value="">Categoría</option>
                {categoriasValidas.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
              </select>
            </div>
            <input className="input" inputMode="tel" placeholder="WhatsApp (ej. 5493811234567)" value={j.whatsapp} onChange={e => setJ(i, 'whatsapp', e.target.value)} />
            <input className="input" type="email" placeholder="Email (opcional)" value={j.email} onChange={e => setJ(i, 'email', e.target.value)} />
            <select className="input" value={j.genero} disabled={torneo.genero !== 'mixto'} onChange={e => setJ(i, 'genero', e.target.value)}>
              <option value="masculino">Masculino</option>
              <option value="femenino">Femenino</option>
            </select>
          </fieldset>
        ))}
      </div>

      <div className="card space-y-2">
        <div className="font-semibold text-sm">¿Cuándo pueden jugar?</div>
        <p className="text-xs text-muted-foreground">
          Armamos los partidos dentro de estas franjas siempre que haya cancha libre. Cuanto más amplias, más fácil programar.
        </p>
        <HorariosEditor value={horarios} onChange={setHorarios} fechaInicio={torneo.fecha_inicio} fechaFin={torneo.fecha_fin} compact />
      </div>

      {extra}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={saving} className="btn-primary w-full md:w-auto">
        {saving ? 'Enviando…' : submitLabel}
      </button>
    </form>
  );
}
