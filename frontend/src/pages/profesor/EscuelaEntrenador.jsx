import { useState, useEffect, useMemo, useCallback } from 'react';
import { MessageCircle, Megaphone, Users, CalendarDays } from 'lucide-react';
import { escuelaProfesor } from '../../services/escuelaService';
import {
  WhatsAppAlumno, EnvioMasivo, HorariosEditor, AvisoForm, PAGO_BADGE, hoyISO,
} from '../../components/escuela/EscuelaShared';

/**
 * Escuela de fútbol — pantalla del ENTRENADOR (dentro del panel de profesor).
 * Solo sus categorías asignadas: alumnos (con WhatsApp al responsable),
 * horarios de entrenamiento y avisos de actividad normal / suspendida.
 */
export default function EscuelaEntrenador({ complexId }) {
  const svc = useMemo(() => escuelaProfesor(complexId), [complexId]);
  const [r, setR] = useState(null);
  const [vista, setVista] = useState('alumnos');
  const [wa, setWa] = useState(null);
  const [masivo, setMasivo] = useState(null);
  const [nuevoAviso, setNuevoAviso] = useState(false);

  const cargar = useCallback(() => svc.resumen().then(setR).catch(() => setR({ categorias: [], avisos: [], canchas: [] })), [svc]);
  useEffect(() => { cargar(); }, [cargar]);
  if (!r) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const horarios = r.categorias.flatMap(c => c.horarios.map(h => ({ ...h, categoria: { id: c.id, nombre: c.nombre } })));
  const conRecarga = (fn) => async (...a) => { const x = await fn(...a); cargar(); return x; };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {[['alumnos', 'Alumnos', Users], ['horarios', 'Horarios', CalendarDays], ['avisos', 'Avisos', Megaphone]].map(([k, l, Icon]) => (
          <button key={k} onClick={() => setVista(k)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px ${vista === k ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground'}`}>
            <Icon className="w-4 h-4" /> {l}
          </button>
        ))}
      </div>

      {vista === 'alumnos' && r.categorias.map(c => (
        <section key={c.id} className="space-y-1.5">
          <h3 className="font-semibold">{c.nombre} <span className="text-xs text-muted-foreground font-normal">· {c.alumnos.length} alumnos</span></h3>
          {c.alumnos.length === 0 && <div className="card text-sm text-muted-foreground py-4 text-center">Sin alumnos.</div>}
          {c.alumnos.map(a => (
            <div key={a.id} className="card py-2 flex items-center gap-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="truncate">{a.nombre} <span className="text-xs text-muted-foreground">· {a.edad} años</span></div>
                <div className="text-[11px] text-muted-foreground truncate">{a.responsable_nombre} · {a.responsable_whatsapp}</div>
              </div>
              <span className={PAGO_BADGE[a.pago_estado].cls}>{PAGO_BADGE[a.pago_estado].label}</span>
              <button className="p-1.5 rounded bg-green-600 text-white" aria-label={`WhatsApp a ${a.responsable_nombre}`} onClick={() => setWa(a)}><MessageCircle className="w-4 h-4" /></button>
            </div>
          ))}
        </section>
      ))}

      {vista === 'horarios' && (
        <HorariosEditor horarios={horarios} categorias={r.categorias} canchas={r.canchas}
          onCrear={conRecarga(svc.crearHorario)} onEditar={conRecarga(svc.editarHorario)} onBorrar={conRecarga(svc.borrarHorario)} />
      )}

      {vista === 'avisos' && (
        <div className="space-y-3">
          {!nuevoAviso && <button className="btn-primary text-sm" onClick={() => setNuevoAviso(true)}>Avisar actividad normal / suspendida</button>}
          {nuevoAviso && (
            <AvisoForm categorias={r.categorias} permitirGeneral={false} onCancel={() => setNuevoAviso(false)}
              onGuardar={async (d) => {
                const av = await svc.crearAviso(d);
                setNuevoAviso(false); cargar();
                const cat = r.categorias.find(c => c.id === av.categoria_id);
                const cuando = av.fecha === hoyISO() ? 'hoy' : `el ${new Date(`${av.fecha}T12:00:00`).toLocaleDateString('es-AR')}`;
                setMasivo({
                  titulo: `Aviso a padres · ${cat.nombre}`, alumnos: cat.alumnos, aviso: av,
                  textoGrupo: av.estado === 'suspendida' ? `⚠️ Se suspende el entrenamiento de ${cat.nombre} ${cuando}.${av.mensaje ? ` ${av.mensaje}` : ''}` : `✅ La actividad de ${cat.nombre} ${cuando} es normal.${av.mensaje ? ` ${av.mensaje}` : ''}`,
                });
              }} />
          )}
          {r.avisos.map(a => (
            <div key={a.id} className="card py-2 text-sm flex gap-2">
              <span className={a.estado === 'suspendida' ? 'badge-red' : 'badge-green'}>{a.estado}</span>
              <span>{new Date(`${a.fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span className="text-muted-foreground truncate">{r.categorias.find(c => c.id === a.categoria_id)?.nombre || 'Toda la escuela'}{a.mensaje && ` · ${a.mensaje}`}</span>
            </div>
          ))}
        </div>
      )}

      {wa && <WhatsAppAlumno alumno={wa} cargarContexto={() => svc.contexto(wa.id)} onClose={() => setWa(null)} />}
      {masivo && <EnvioMasivo titulo={masivo.titulo} alumnos={masivo.alumnos} tipo="actividad" aviso={masivo.aviso} textoGrupo={masivo.textoGrupo}
        cargarContexto={(id) => svc.contexto(id)} onClose={() => setMasivo(null)} />}
    </div>
  );
}
