/**
 * utils/escuelaWhatsapp.js — mensajes de la Escuela de Fútbol para WhatsApp.
 *
 * Se envían desde el dispositivo en uso (wa.me), con el número oficial de la
 * escuela abierto en ese WhatsApp. El texto se arma solo con los datos del
 * alumno, su categoría y el estado de la cuota (ver `contexto` del backend):
 *
 *   actividad      → "hoy hay entrenamiento" / "hoy se suspende"
 *   recordatorio   → cuota PENDIENTE del período (con vencimiento)
 *   comprobante    → cuota PAGADA (monto, fecha, n° de comprobante)
 *   sin_registro   → no hay ninguna cuota registrada para el período
 *
 * Todos incluyen el link al portal del alumno (horarios, cuotas y avisos).
 */
export { copiarTexto } from './pedidoWhatsapp.js';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
const fecha = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const periodoLabel = (p) => { const [y, m] = String(p).split('-').map(Number); return `${MESES[m - 1]} ${y}`; };
const primerNombre = (n) => String(n || '').split(' ')[0];

export const TIPOS_MENSAJE = {
  automatico:   'Automático (según la cuota)',
  actividad:    'Actividad de hoy',
  recordatorio: 'Recordatorio de cuota',
  comprobante:  'Comprobante de pago',
  sin_registro: 'Sin pago registrado',
};

const horariosTxt = (ctx) => (ctx.horarios || []).map(h => `• ${h.dia} ${h.hora_inicio} a ${h.hora_fin}${h.cancha ? ` (${h.cancha})` : ''}`).join('\n');
const pie = (ctx) => `\n\n📲 Horarios, cuotas y avisos: ${ctx.portal_url}\n— ${ctx.escuela?.nombre || 'Escuela de fútbol'}`;

/**
 * Mensaje para el responsable del alumno.
 * @param {object} ctx  respuesta de /alumnos/:id/contexto
 * @param {keyof TIPOS_MENSAJE} tipo  'automatico' elige según el estado de la cuota
 * @param {{estado:'normal'|'suspendida', mensaje?:string, fecha?:string}} [aviso]  para 'actividad'
 */
export function mensajeEscuela(ctx, tipo = 'automatico', aviso = null) {
  const hola = `Hola ${primerNombre(ctx.alumno?.responsable_nombre)}!`;
  const quien = `*${ctx.alumno?.nombre}* (${ctx.categoria?.nombre})`;
  const t = tipo === 'automatico' ? ({ pagado: 'comprobante', pendiente: 'recordatorio', sin_registro: 'sin_registro' }[ctx.pago_estado] || 'recordatorio') : tipo;
  const per = periodoLabel(ctx.periodo);

  switch (t) {
    case 'actividad': {
      const av = aviso || ctx.aviso_hoy || { estado: 'normal' };
      const cuando = av.fecha ? `el ${fecha(av.fecha)}` : 'hoy';
      return av.estado === 'suspendida'
        ? `⚠️ ${hola} Te avisamos que ${cuando} *se suspende* el entrenamiento de ${quien}.${av.mensaje ? `\n📝 ${av.mensaje}` : ''}\n\nTe avisamos cuando se retome.${pie(ctx)}`
        : `✅ ${hola} ${cuando[0].toUpperCase() + cuando.slice(1)} la actividad de ${quien} es *normal*.${av.mensaje ? `\n📝 ${av.mensaje}` : ''}\n\nHorarios:\n${horariosTxt(ctx)}${pie(ctx)}`;
    }
    case 'comprobante': {
      const p = ctx.pago;
      if (!p || p.estado !== 'pagado') return mensajeEscuela(ctx, 'recordatorio');
      return `🧾 *Comprobante de pago*\n\n${hola} Registramos el pago de la cuota de ${per} de ${quien}.\n\n` +
        `💰 Monto: ${money(p.monto)}\n📅 Fecha: ${fecha(p.fecha_pago)}\n🔖 Comprobante: ${p.comprobante}${p.metodo_pago ? `\n💳 Medio: ${p.metodo_pago}` : ''}\n\n¡Gracias!${pie(ctx)}`;
    }
    case 'sin_registro':
      return `📌 ${hola} No tenemos registrado ningún pago de la cuota de ${per} de ${quien}.\n\n` +
        `La cuota es de ${money(ctx.categoria?.cuota_mensual)} y vence el ${fecha(ctx.vencimiento)}. Si ya pagaste, respondenos este mensaje con el comprobante así lo cargamos.${pie(ctx)}`;
    case 'recordatorio':
    default: {
      const monto = ctx.pago?.monto ?? ctx.categoria?.cuota_mensual;
      return `🔔 *Recordatorio de cuota*\n\n${hola} Te recordamos que la cuota de ${per} de ${quien} está *pendiente*.\n\n` +
        `💰 Monto: ${money(monto)}\n📅 Vence: ${fecha(ctx.vencimiento)}\n\nSi ya la pagaste, ignorá este mensaje. ¡Gracias!${pie(ctx)}`;
    }
  }
}

/** Link wa.me al responsable con el mensaje cargado (se abre en el dispositivo en uso). */
export const waLinkEscuela = (telefono, texto) =>
  `https://wa.me/${String(telefono || '').replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;
