import { hoyAR } from './fecha';
import { whatsappSendUrl } from './compartir';
/**
 * utils/escuelaWhatsapp.js — mensajes de la Escuela de Fútbol para WhatsApp.
 *
 * Se comparten desde el dispositivo en uso (whatsapp://send, copiar o compartir):
 * el sistema no envía nada. Los de ACTIVIDAD son generales (difusión), sin datos
 * del alumno; los de cuota son personales. El texto se arma solo con los datos del
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
      // Mensaje de DIFUSIÓN: igual para todas las familias (sin nombre del alumno ni del responsable)
      const av = aviso || ctx.aviso_hoy || { estado: 'normal' };
      return av.texto_difusion || textoActividad(av, { escuela: ctx.escuela?.nombre, categoria: ctx.categoria?.nombre });
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

/**
 * Texto general de una actividad normal / suspendida (respaldo cuando el aviso no trae
 * `texto_difusion` del servidor, que usa la plantilla configurada de la escuela).
 */
export function textoActividad(av, { escuela, categoria } = {}) {
  const cuando = !av.fecha || av.fecha === hoyAR() ? 'hoy' : `el ${fecha(av.fecha)}`;
  const cabecera = [escuela && `*${escuela}*`, categoria || 'Todas las categorías'].filter(Boolean).join(' — ');
  const detalle = av.mensaje ? `\n\n${av.mensaje}` : '';
  return av.estado === 'suspendida'
    ? `⛔ ${cabecera}\n\nInformamos que la actividad prevista para ${cuando} ha sido suspendida. Ante cualquier novedad se comunicará oportunamente.${detalle}`
    : `✅ ${cabecera}\n\nInformamos que la actividad programada para ${cuando} se realizará normalmente en el horario establecido.${detalle}`;
}

/** Abre WhatsApp EN ESTE DISPOSITIVO (whatsapp://send) con el chat del responsable y el mensaje cargado. */
export const waLinkEscuela = (telefono, texto) => whatsappSendUrl(texto, telefono);
