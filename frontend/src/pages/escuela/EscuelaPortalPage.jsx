import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Goal, CalendarDays, Wallet, Megaphone, MessageCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { escuelaPortal } from '../../services/escuelaService';
import { periodoLabel } from '../../utils/escuelaWhatsapp';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
const fechaLarga = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const ESTADO_CUOTA = {
  pagado:       { label: 'Pagada',              cls: 'badge-green' },
  pendiente:    { label: 'Pendiente',           cls: 'badge-yellow' },
  sin_registro: { label: 'Sin pago registrado', cls: 'badge-red' },
};

/**
 * Portal del alumno / padre: horarios, estado de cuotas y avisos de actividad.
 * Se entra con el link personal que llega por WhatsApp (sin usuario ni contraseña).
 */
export default function EscuelaPortalPage() {
  const { token } = useParams();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { escuelaPortal(token).then(setD).catch(e => setError(e?.message || 'No se pudo cargar.')); }, [token]);

  if (error) return <div className="min-h-screen bg-background flex items-center justify-center p-4"><div className="card text-center max-w-sm"><p className="text-red-400">{error}</p><p className="text-xs text-muted-foreground mt-2">Pedile a la escuela un link nuevo.</p></div></div>;
  if (!d) return <div className="min-h-screen bg-background flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>;

  const cuota = ESTADO_CUOTA[d.pago_estado];
  const aviso = d.aviso_hoy;
  const wa = d.escuela.whatsapp_oficial;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
        <div className="card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Goal className="w-4 h-4 text-primary" /> {d.escuela.nombre}</div>
          <h1 className="text-2xl font-bold mt-1">{d.alumno.nombre}</h1>
          <div className="text-sm text-muted-foreground">{d.categoria?.nombre} · {d.alumno.edad} años{d.entrenadores.length ? ` · Prof. ${d.entrenadores.join(', ')}` : ''}</div>
        </div>

        {aviso && (
          <div className={`card flex items-start gap-3 ${aviso.estado === 'suspendida' ? 'border-red-500/50 bg-red-500/5' : 'border-green-500/40 bg-green-500/5'}`} role="status">
            {aviso.estado === 'suspendida' ? <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" /> : <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />}
            <div>
              <div className="font-semibold">{aviso.estado === 'suspendida' ? 'Hoy se suspende la actividad' : 'Hoy la actividad es normal'}</div>
              {aviso.mensaje && <div className="text-sm text-muted-foreground">{aviso.mensaje}</div>}
            </div>
          </div>
        )}

        <section className="card space-y-2">
          <h2 className="font-semibold flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" /> Horarios</h2>
          {d.horarios.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay horarios cargados.</p> : d.horarios.map((h, i) => (
            <div key={i} className="flex justify-between text-sm border-t border-border pt-2 first:border-0 first:pt-0">
              <span className="capitalize">{h.dia}</span><span className="font-mono">{h.hora_inicio}–{h.hora_fin}</span><span className="text-muted-foreground">{h.cancha}</span>
            </div>
          ))}
        </section>

        <section className="card space-y-2">
          <h2 className="font-semibold flex items-center gap-2"><Wallet className="w-4 h-4 text-primary" /> Cuotas</h2>
          <div className="flex items-center justify-between text-sm">
            <span>Cuota de {periodoLabel(d.periodo)} · vence {new Date(`${d.vencimiento}T12:00:00`).toLocaleDateString('es-AR')}</span>
            <span className={cuota.cls}>{cuota.label}</span>
          </div>
          {d.pago?.estado === 'pagado' && <div className="text-xs text-muted-foreground">Pagada el {new Date(`${d.pago.fecha_pago}T12:00:00`).toLocaleDateString('es-AR')} · comprobante {d.pago.comprobante}</div>}
          {d.pagos.length > 0 && (
            <div className="pt-2 space-y-1">
              {d.pagos.map(p => (
                <div key={p.periodo} className="flex justify-between text-xs text-muted-foreground">
                  <span className="capitalize">{periodoLabel(p.periodo)}</span><span>{money(p.monto)}</span><span className={ESTADO_CUOTA[p.estado].cls}>{ESTADO_CUOTA[p.estado].label}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card space-y-2">
          <h2 className="font-semibold flex items-center gap-2"><Megaphone className="w-4 h-4 text-primary" /> Avisos</h2>
          {d.avisos.length === 0 ? <p className="text-sm text-muted-foreground">Sin avisos.</p> : d.avisos.map((a, i) => (
            <div key={i} className="text-sm border-t border-border pt-2 first:border-0 first:pt-0">
              <span className={a.estado === 'suspendida' ? 'text-red-400' : 'text-green-400'}>{a.estado === 'suspendida' ? 'Suspendida' : 'Normal'}</span>
              <span className="text-muted-foreground"> · {fechaLarga(a.fecha)}{a.general ? ' · toda la escuela' : ''}</span>
              {a.mensaje && <div className="text-xs text-muted-foreground">{a.mensaje}</div>}
            </div>
          ))}
        </section>

        {wa && (
          <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hola! Soy responsable de ${d.alumno.nombre} (${d.categoria?.nombre}).`)}`} target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl py-3 font-semibold text-white bg-green-700 hover:bg-green-800">
            <MessageCircle className="w-5 h-5" /> Escribir a la escuela
          </a>
        )}
      </div>
    </div>
  );
}
