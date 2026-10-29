import { useState } from 'react';
import { Copy, Check, Share2, MessageCircle } from 'lucide-react';
import { copiarTexto, compartirTexto, puedeCompartir, whatsappSendUrl } from '../utils/compartir';

/**
 * Mensaje listo para enviar en MODO MANUAL: el usuario lo copia, lo abre en su
 * WhatsApp o lo comparte con la hoja nativa. El sistema no envía nada.
 *
 * @param {string}  props.texto
 * @param {boolean} [props.editable]       permite retocar el texto antes de compartir
 * @param {string}  [props.titulo]         título para la hoja de compartir
 * @param {Array}   [props.destinatarios]  [{numero, nombre, texto?}] → abrir el chat de cada uno
 * @param {string}  [props.ayuda]          línea de ayuda bajo los botones
 */
export default function CompartirMensaje({ texto: inicial, editable = true, titulo, destinatarios = [], ayuda }) {
  const [texto, setTexto] = useState(inicial || '');
  const [estado, setEstado] = useState(null);   // { ok } | { error }
  const [abiertos, setAbiertos] = useState(() => new Set());

  const copiar = async () => setEstado((await copiarTexto(texto)) ? { ok: 'Copiado. Pegalo en el grupo o la lista de difusión.' } : { error: 'No se pudo copiar: seleccioná el texto y copialo a mano.' });
  const compartir = async () => {
    const r = await compartirTexto(texto, titulo);
    if (r === 'copiado') setEstado({ ok: 'Tu navegador no tiene "Compartir": el texto quedó copiado.' });
    else if (r === 'error') setEstado({ error: 'No se pudo compartir ni copiar.' });
  };

  return (
    <div className="space-y-2">
      <textarea className="input font-sans text-sm" rows={Math.min(12, Math.max(4, texto.split('\n').length + 1))}
        value={texto} readOnly={!editable} onChange={e => setTexto(e.target.value)} aria-label="Mensaje para compartir" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary btn-sm" onClick={copiar}><Copy className="w-4 h-4" aria-hidden="true" /> Copiar</button>
        <a className="btn-outline btn-sm" href={whatsappSendUrl(texto)}><MessageCircle className="w-4 h-4" aria-hidden="true" /> Abrir en WhatsApp</a>
        {puedeCompartir() && <button type="button" className="btn-outline btn-sm" onClick={compartir}><Share2 className="w-4 h-4" aria-hidden="true" /> Compartir</button>}
      </div>
      <p className="text-xs text-muted-foreground">
        {ayuda || 'Se abre WhatsApp en este dispositivo: elegí el grupo, la lista de difusión o el contacto. El sistema no envía mensajes automáticamente.'}
      </p>
      {estado?.ok && <p className="text-xs text-success" role="status">{estado.ok}</p>}
      {estado?.error && <p className="text-xs text-danger" role="alert">{estado.error}</p>}

      {destinatarios.length > 0 && (
        <details className="rounded-lg border border-border">
          <summary className="px-3 py-2 text-sm cursor-pointer select-none">
            Enviar uno por uno ({abiertos.size}/{destinatarios.length} abiertos)
          </summary>
          <ul className="max-h-64 overflow-y-auto divide-y divide-border border-t border-border">
            {destinatarios.map(d => (
              <li key={`${d.numero}-${d.nombre}`} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                {abiertos.has(d.numero) ? <Check className="w-4 h-4 text-success shrink-0" aria-label="Abierto" /> : <span className="w-4 shrink-0" />}
                <span className="truncate">{d.nombre}</span>
                <span className="text-xs text-muted-foreground tabular-nums">+{d.numero}</span>
                <a className="ml-auto text-xs text-primary hover:underline shrink-0" href={whatsappSendUrl(d.texto ?? texto, d.numero)}
                  onClick={() => setAbiertos(s => new Set(s).add(d.numero))}>Abrir chat</a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
