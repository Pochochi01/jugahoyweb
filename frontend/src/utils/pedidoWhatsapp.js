/**
 * utils/pedidoWhatsapp.js — texto de los pedidos de Cantina para WhatsApp.
 *
 * No se usa Meta ni Baileys: el usuario copia el pedido o abre WhatsApp en SU
 * dispositivo con el mensaje ya cargado (https://wa.me/<numero>?text=<mensaje>)
 * y lo envía a mano. El texto cambia según el estado del pedido:
 *   generado · confirmado parcial · confirmado total / entregado · cancelado
 */

const cant = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
const fecha = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const linea = (i, conPrecio) =>
  `• ${cant(i.cantidad)} × ${i.producto?.nombre}${conPrecio ? ` — ${money(Number(i.cantidad) * Number(i.precio_unitario))}` : ''}`;

/**
 * Mensaje del pedido según su tipo y estado.
 * @param {object} pedido  respuesta de la API (items con producto, proveedor | cliente)
 * @param {string} club    nombre del complejo (firma)
 */
export function mensajePedido(pedido, club = '') {
  const n = `Pedido #${pedido.id}`;
  const firma = club ? `\n\n— ${club}` : '';
  const notas = pedido.notas ? `\n\n📝 ${pedido.notas}` : '';
  const items = pedido.items || [];

  if (pedido.tipo === 'proveedor') {
    const saludo = pedido.proveedor?.contacto ? `Hola ${pedido.proveedor.contacto}! ` : 'Hola! ';
    switch (pedido.estado) {
      case 'pendiente':
        return `🛒 *${n}* · ${fecha(pedido.fecha)}\n\n${saludo}Te paso el pedido:\n\n${items.map(i => linea(i)).join('\n')}${notas}\n\n¡Gracias!${firma}`;
      case 'confirmado_parcial': {
        const rec = items.filter(i => i.estado === 'recibido');
        const pend = items.filter(i => i.estado === 'pendiente');
        return `📦 *${n} — recibido parcialmente*\n\n✅ Recibido:\n${rec.map(i => {
          const r = Number(i.cantidad_recibida ?? i.cantidad);
          return `• ${cant(r)} × ${i.producto?.nombre}${r !== Number(i.cantidad) ? ` (de ${cant(i.cantidad)})` : ''}`;
        }).join('\n')}\n\n⏳ Pendiente (no recibido):\n${pend.map(i => linea(i)).join('\n')}\n\nQuedamos a la espera de lo pendiente. ¡Gracias!${firma}`;
      }
      case 'confirmado_total':
        return `✅ *${n} — recibido completo*\n\n${items.map(i => {
          const r = Number(i.cantidad_recibida ?? i.cantidad);
          return `• ${cant(r)} × ${i.producto?.nombre}${r !== Number(i.cantidad) ? ` (pedido ${cant(i.cantidad)})` : ''}`;
        }).join('\n')}\n\n¡Gracias!${firma}`;
      case 'cancelado':
        return `❌ *${n} cancelado*\n\n${saludo}Te aviso que cancelamos el pedido del ${fecha(pedido.fecha)}:\n\n${items.map(i => linea(i)).join('\n')}\n\nDisculpá las molestias.${firma}`;
      default: return '';
    }
  }

  // Cliente
  // Nombre completo: los clientes suelen ser comercios o equipos ("Club Veteranos")
  const saludo = pedido.cliente?.nombre ? `Hola ${pedido.cliente.nombre}!` : 'Hola!';
  const total = `\n\n💰 *Total: ${money(pedido.total)}*`;
  switch (pedido.estado) {
    case 'pendiente':
      return `🧾 *${n}* · ${fecha(pedido.fecha)}\n\n${saludo} Registramos tu pedido:\n\n${items.map(i => linea(i, true)).join('\n')}${total}${notas}\n\nTe avisamos cuando esté listo.${firma}`;
    case 'entregado':
      return `✅ *${n} entregado*\n\n${saludo} Te entregamos:\n\n${items.map(i => linea(i, true)).join('\n')}${total}\n\n¡Gracias por tu compra!${firma}`;
    case 'cancelado':
      return `❌ *${n} cancelado*\n\n${saludo} Tu pedido del ${fecha(pedido.fecha)} fue cancelado. Cualquier consulta, escribinos.${firma}`;
    default: return '';
  }
}

/** Número del contacto del pedido (solo dígitos) o '' si no tiene. */
export const telefonoPedido = (p) => String((p.tipo === 'proveedor' ? p.proveedor : p.cliente)?.whatsapp || '').replace(/\D/g, '');

/**
 * Link que abre WhatsApp (app en el celular, Web/Desktop en la PC) con el mensaje
 * cargado en el chat del contacto. Sin número → WhatsApp pide elegir el chat.
 */
export function waPedidoLink(telefono, mensaje) {
  const tel = String(telefono || '').replace(/\D/g, '');
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Copia al portapapeles. navigator.clipboard exige contexto seguro (https);
 * si no está disponible (http en la red local) usa el método clásico.
 */
export async function copiarTexto(texto) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch { /* cae al método clásico */ }
  const ta = document.createElement('textarea');
  ta.value = texto;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.body.removeChild(ta);
  return ok;
}
