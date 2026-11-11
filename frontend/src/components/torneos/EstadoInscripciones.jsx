import { useState, useEffect, useCallback } from 'react';
import { Lock, Unlock, History } from 'lucide-react';
import { ModalTorneo } from './ReprogramarModal';
import { catNombre, errMsg } from '../../utils/torneos';

const ACCION = {
  inscripcion_creada: 'Inscripción creada',
  inscripcion_modificada: 'Inscripción modificada',
  inscripcion_eliminada: 'Inscripción dada de baja',
  zonas_generadas: 'Zonas generadas',
  inscripciones_bloqueadas: 'Inscripciones bloqueadas',
  inscripciones_reabiertas: 'Inscripciones reabiertas',
};
const fechaHora = (f) => new Date(f).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Estado de las inscripciones de la categoría: tras armar zonas quedan CERRADAS.
 * "Reabrir inscripciones" solo para Administrador General / administrador del club / organizador
 * (el backend lo vuelve a verificar), con confirmación y motivo obligatorio. Incluye la auditoría.
 * `onEstado(cerrada)` avisa al padre para deshabilitar el alta.
 */
export default function EstadoInscripciones({ svc, torneo, categoria, onEstado }) {
  const [estado, setEstado] = useState(null);
  const [reabrir, setReabrir] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [historial, setHistorial] = useState(null);

  const cargar = useCallback(() => svc.estadoInscripciones(torneo.id).then((e) => {
    setEstado(e);
    const c = e.categorias.find(x => x.categoria_id === Number(categoria)) || (e.categorias.length === 1 ? e.categorias[0] : null);
    onEstado?.(Boolean(c?.inscripciones_cerradas));
  }).catch(() => setEstado(null)), [svc, torneo.id, categoria, onEstado]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!estado) return null;
  const cat = estado.categorias.find(x => x.categoria_id === Number(categoria)) || (estado.categorias.length === 1 ? estado.categorias[0] : null);
  const cerrada = Boolean(cat?.inscripciones_cerradas);

  const confirmar = async () => {
    if (motivo.trim().length < 5) { setError('Escribí el motivo (mínimo 5 caracteres).'); return; }
    setEnviando(true); setError('');
    try {
      await svc.reabrirInscripciones(torneo.id, { categoria_id: cat?.categoria_id, motivo: motivo.trim() });
      setReabrir(false); setMotivo(''); cargar();
    } catch (e) { setError(errMsg(e)); } finally { setEnviando(false); }
  };
  const verHistorial = () => svc.auditoriaInscripciones(torneo.id, cat ? { categoria_id: cat.categoria_id } : {}).then(setHistorial).catch(e => alert(errMsg(e)));

  return (
    <>
      <div className={`card py-3 flex flex-wrap items-center gap-3 ${cerrada ? 'border-amber-500/40 bg-amber-500/5' : ''}`}>
        {cerrada ? <Lock className="w-5 h-5 text-amber-400 shrink-0" /> : <Unlock className="w-5 h-5 text-emerald-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{cerrada ? 'INSCRIPCIONES CERRADAS' : 'Inscripciones abiertas'}{cat && (torneo.categorias || []).length > 1 && ` · ${catNombre(cat.categoria_id)}`}</div>
          <div className="text-xs text-muted-foreground">
            {cerrada
              ? 'Las zonas ya fueron generadas: no se agregan parejas ni se cambian integrantes. Se pueden corregir datos de contacto.'
              : cat?.estado && cat.estado !== 'pendiente'
                ? 'Reabiertas por un administrador: al volver a armar las zonas se cierran de nuevo.'
                : 'Se cierran automáticamente al armar las zonas.'}
          </div>
        </div>
        <button className="btn-ghost text-xs" onClick={verHistorial}><History className="w-4 h-4" /> Auditoría</button>
        {cerrada && estado.puede_reabrir && (
          <button className="btn-outline text-sm !text-amber-400 !border-amber-500/40" onClick={() => { setReabrir(true); setError(''); }}><Unlock className="w-4 h-4" /> Reabrir inscripciones</button>
        )}
      </div>

      {reabrir && (
        <ModalTorneo titulo="Reabrir inscripciones" icon={Unlock} onClose={() => setReabrir(false)}>
          <div className="space-y-3">
            <p className="text-sm">Las zonas ya están armadas. Si reabrís, vas a poder agregar parejas o cambiar integrantes; después tenés que <strong>volver a armar las zonas</strong> (y se vuelven a cerrar).</p>
            <label className="block">
              <span className="text-xs text-muted-foreground mb-1 block">Motivo *</span>
              <textarea className="input min-h-[80px]" value={motivo} maxLength={500} autoFocus onChange={e => setMotivo(e.target.value)} placeholder="Ej.: Se agregó pareja faltante por error administrativo." />
            </label>
            <p className="text-[11px] text-muted-foreground">Queda registrado con tu usuario, la fecha y la hora.</p>
            {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost text-sm" onClick={() => setReabrir(false)}>Cancelar</button>
              <button className="btn-primary text-sm" disabled={enviando} onClick={confirmar}>{enviando ? 'Reabriendo…' : 'Confirmar reapertura'}</button>
            </div>
          </div>
        </ModalTorneo>
      )}

      {historial && (
        <ModalTorneo titulo="Auditoría de inscripciones" icon={History} onClose={() => setHistorial(null)} ancho="sm:max-w-2xl">
          {historial.length === 0 ? <p className="text-sm text-muted-foreground">Sin eventos registrados.</p> : (
            <ul className="divide-y divide-border text-sm max-h-[60vh] overflow-y-auto">
              {historial.map(h => (
                <li key={h.id} className="py-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{ACCION[h.accion] || h.accion}{h.pareja_id ? ` · pareja #${h.pareja_id}` : ''}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{fechaHora(h.createdAt || h.created_at)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {h.usuario || 'Sistema / web pública'}
                    {h.detalle?.jugadores && ` · ${h.detalle.jugadores.map(j => j.nombre).join(' / ')}`}
                    {h.detalle?.autocompletados?.length > 0 && ' · con datos autocompletados'}
                    {h.detalle?.zonas && ` · ${h.detalle.zonas} zonas, ${h.detalle.parejas} parejas`}
                  </div>
                  {h.motivo && <div className="text-xs mt-0.5">Motivo: “{h.motivo}”</div>}
                </li>
              ))}
            </ul>
          )}
        </ModalTorneo>
      )}
    </>
  );
}
