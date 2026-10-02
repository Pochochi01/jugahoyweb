import { useState } from 'react';
import { X, Copy, Check, MessageCircle, ExternalLink } from 'lucide-react';
import { copiarTexto } from '../../utils/pedidoWhatsapp';

/**
 * Link de pago de MercadoPago generado desde la agenda (seña o total).
 * El admin se lo manda al cliente: copiar o abrir WhatsApp con el mensaje armado.
 * La reserva se confirma sola cuando MercadoPago aprueba el pago.
 */
export default function LinkPagoModal({ pago, booking, onClose }) {
  const [copiado, setCopiado] = useState(false);
  const tipo = pago.tipo_pago === 'seña' ? 'la seña' : 'el total';
  const monto = `$${Number(pago.amount).toLocaleString('es-AR')}`;
  const fecha = new Date(`${booking.fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const mensaje = `Hola ${booking.nombre_cliente.split(' ')[0]}! Te reservamos el turno del ${fecha} a las ${booking.hora_inicio} hs.\n\n` +
    `💳 Para confirmarlo, pagá ${tipo} (${monto}) con MercadoPago desde este link:\n${pago.init_point}\n\n¡Gracias!`;
  const tel = String(booking.telefono_cliente || '').replace(/\D/g, '');

  const copiar = async () => { if (await copiarTexto(mensaje)) { setCopiado(true); setTimeout(() => setCopiado(false), 2000); } };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md card space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold">Turno reservado · link de pago listo</h3>
            <p className="text-sm text-muted-foreground">{booking.nombre_cliente} · {booking.fecha} {booking.hora_inicio} · {tipo} {monto}</p>
          </div>
          <button className="p-1 rounded hover:bg-muted" onClick={onClose} aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          El turno queda <strong>pendiente de pago</strong> y se confirma solo cuando MercadoPago aprueba el cobro (ahí también entra a la caja).
        </div>
        <pre className="text-xs whitespace-pre-wrap font-sans bg-background/60 rounded-md p-2.5 select-all">{mensaje}</pre>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline text-sm flex-1 flex items-center justify-center gap-1.5" onClick={copiar}>
            {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copiado ? 'Copiado' : 'Copiar mensaje'}
          </button>
          <a className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700"
            href={`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noreferrer">
            <MessageCircle className="w-4 h-4" /> Enviar por WhatsApp
          </a>
        </div>
        <a href={pago.init_point} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          <ExternalLink className="w-3 h-3" /> Abrir el link de pago
        </a>
      </div>
    </div>
  );
}
