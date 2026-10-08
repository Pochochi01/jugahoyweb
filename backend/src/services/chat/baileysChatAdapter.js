'use strict';
/**
 * services/chat/baileysChatAdapter.js — Adaptador del chatbot para Baileys (WhatsApp Web).
 *
 * El chatbot arma sus mensajes con el formato de la Cloud API de Meta (texto,
 * listas, botones, links). WhatsApp Web no muestra listas/botones interactivos,
 * así que este adaptador los convierte en un MENÚ NUMERADO de texto y recuerda
 * qué número corresponde a cada opción (por club + teléfono). Cuando la persona
 * responde con ese número, `entrante()` lo traduce de vuelta a la respuesta
 * interactiva que el chatbot espera. Así el mismo flujo (turnos por WhatsApp,
 * turnos por la web, etc.) funciona igual con ambos proveedores.
 */
const baileys = require('../baileysService');

const OPCIONES_TTL_MS = 30 * 60 * 1000;
const opciones = new Map();   // `${clubId}:${tel}` → { items: [{id,title,kind}], t }
const jids = new Map();       // `${clubId}:${tel}` → jid real (puede ser @lid)

const digitos = (t) => String(t || '').replace(/\D/g, '');
const clave = (clubId, tel) => `${clubId}:${digitos(tel)}`;

/** Convierte un payload estilo Meta en texto plano + opciones numeradas. */
function renderizar(payload) {
  if (payload.type === 'text') return { texto: payload.text?.body || '', items: [] };
  if (payload.type === 'image') return { texto: payload.image?.caption || '', imagen: payload.image?.link, items: [] };
  if (payload.type === 'template') {
    const params = payload.template?.components?.flatMap(c => c.parameters || []).map(p => p.text).filter(Boolean) || [];
    return { texto: params.join('\n'), items: [] };
  }
  const it = payload.interactive || {};
  const partes = [];
  if (it.header?.text) partes.push(`*${it.header.text}*`);
  if (it.body?.text) partes.push(it.body.text);
  const items = [];
  if (it.type === 'list') {
    for (const sec of it.action?.sections || []) {
      if (sec.title && (it.action.sections.length > 1)) partes.push(`\n_${sec.title}_`);
      for (const r of sec.rows || []) items.push({ id: r.id, title: r.title, desc: r.description, kind: 'list_reply' });
    }
  } else if (it.type === 'button') {
    for (const b of it.action?.buttons || []) items.push({ id: b.reply?.id, title: b.reply?.title, kind: 'button_reply' });
  } else if (it.type === 'cta_url') {
    const p = it.action?.parameters || {};
    partes.push(`${p.display_text ? `${p.display_text}: ` : ''}${p.url || ''}`);
  }
  if (items.length) {
    partes.push('');
    items.forEach((o, i) => partes.push(`*${i + 1}.* ${o.title.replace(/^\d+\.\s*/, '')}${o.desc ? ` — _${o.desc}_` : ''}`));
    partes.push('\n_Respondé con el número de la opción._');
  }
  if (it.footer?.text) partes.push(`\n${it.footer.text}`);
  return { texto: partes.join('\n').trim(), items };
}

/**
 * Envía un payload del chatbot por la sesión de Baileys del club.
 * @param {object} payload  formato Meta ({ to, type, text|interactive|image|template })
 * @param {{clubId:number}} creds
 */
async function send(payload, creds) {
  const { clubId } = creds;
  const tel = digitos(payload.to);
  const { texto, imagen, items } = renderizar(payload);
  const k = clave(clubId, tel);
  if (items.length) opciones.set(k, { items, t: Date.now() });
  const jid = jids.get(k);
  const r = imagen
    ? await baileys.enviarImagen(clubId, jid || tel, imagen, texto)
    : await baileys.enviarTexto(clubId, jid || tel, texto);
  console.log(`[WhatsApp][baileys] → enviado a ****${tel.slice(-4)} · complejo ${clubId}`);
  return { ok: true, via: 'baileys', id: r?.key?.id };
}

/**
 * Normaliza un mensaje entrante de Baileys al formato de Meta que entiende el
 * chatbot. Si el texto es el número de una opción del último menú enviado, se
 * devuelve como respuesta interactiva (list_reply / button_reply).
 * @returns {object|null} msg estilo Meta, o null si no es un mensaje de texto útil
 */
function entrante(clubId, m) {
  if (!m?.message || m.key?.fromMe) return null;
  const jid = m.key.remoteJid || '';
  if (jid.endsWith('@g.us') || jid === 'status@broadcast') return null;   // grupos / estados
  // Número real (en chats con @lid, Baileys lo informa aparte)
  const tel = digitos((m.key.senderPn || m.key.participantPn || jid).split('@')[0].split(':')[0]);
  const k = clave(clubId, tel);
  jids.set(k, jid);
  const c = m.message.ephemeralMessage?.message || m.message;
  const texto = (c.conversation || c.extendedTextMessage?.text || c.imageMessage?.caption || '').trim();
  if (!texto) return null;

  const op = opciones.get(k);
  const n = /^\d{1,2}$/.test(texto) ? Number(texto) : null;
  if (op && n && Date.now() - op.t < OPCIONES_TTL_MS && op.items[n - 1]) {
    const o = op.items[n - 1];
    return { from: tel, id: m.key.id, type: 'interactive', interactive: { type: o.kind, [o.kind]: { id: o.id, title: o.title } } };
  }
  return { from: tel, id: m.key.id, type: 'text', text: { body: texto } };
}

module.exports = { send, entrante, renderizar };
