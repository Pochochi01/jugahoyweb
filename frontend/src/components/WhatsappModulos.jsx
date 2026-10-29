import { useState, useEffect } from 'react';
import { ShieldCheck, Loader2, Smartphone } from 'lucide-react';
import api from '../services/api';

/**
 * Configuración → WhatsApp → "Módulos autorizados".
 * Define para qué módulos puede usarse el número de WhatsApp del club. Por
 * defecto solo Agenda, Reservas y Recordatorios. Los módulos de canal manual
 * (torneos, escuelas, profesores, comunicaciones, marketing) no se pueden
 * encender: usan solo el WhatsApp del dispositivo. El catálogo viene del servidor
 * (tabla whatsapp_modulos), así que los módulos futuros aparecen solos.
 */
export default function WhatsappModulos({ complexId }) {
  const [modulos, setModulos] = useState(null);
  const [guardando, setGuardando] = useState(null);   // clave del módulo en curso
  const [error, setError] = useState('');
  const base = `/settings/${complexId}/whatsapp-modulos`;

  useEffect(() => {
    api.get(base).then(d => setModulos(d.modulos)).catch(() => setError('No se pudieron cargar los módulos.'));
  }, [base]);

  const cambiar = async (m) => {
    const valor = !m.habilitado;
    setGuardando(m.clave); setError('');
    setModulos(list => list.map(x => (x.clave === m.clave ? { ...x, habilitado: valor } : x)));   // optimista
    try {
      const d = await api.put(base, { modulos: { [m.clave]: valor } });
      setModulos(d.modulos);
    } catch (e) {
      setModulos(list => list.map(x => (x.clave === m.clave ? { ...x, habilitado: !valor } : x)));
      setError(e?.response?.data?.message || e?.message || 'No se pudo guardar el cambio.');
    } finally { setGuardando(null); }
  };

  return (
    <div className="card space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Módulos autorizados</h3>
        <p className="text-sm text-muted-foreground mt-1">
          El número de WhatsApp del club solo envía y responde mensajes de los módulos habilitados. Un módulo apagado no manda mensajes, no responde consultas ni ejecuta recordatorios.
          Los módulos marcados como <strong>solo WhatsApp del dispositivo</strong> nunca usan el número del club ni el chatbot: se comunican desde el WhatsApp del celular o la PC en la que se usa el sistema.
        </p>
      </div>
      {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
      {!modulos ? (
        !error && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <ul className="divide-y divide-border">
          {modulos.map(m => (
            <li key={m.clave} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{m.nombre}</div>
                {m.descripcion && <div className="text-xs text-muted-foreground">{m.descripcion}</div>}
              </div>
              {m.canal === 'manual' ? (
                <span className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded-full px-2.5 py-1" title="Se comunica desde el WhatsApp del dispositivo">
                  <Smartphone className="w-3.5 h-3.5" /> Solo WhatsApp del dispositivo
                </span>
              ) : (
              <button type="button" role="switch" aria-checked={m.habilitado} aria-label={`${m.nombre}: ${m.habilitado ? 'habilitado' : 'deshabilitado'}`}
                disabled={guardando === m.clave} onClick={() => cambiar(m)}
                className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${m.habilitado ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${m.habilitado ? 'translate-x-5' : ''}`} />
              </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
