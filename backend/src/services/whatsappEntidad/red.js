'use strict';
/**
 * services/whatsappEntidad/red.js — diagnóstico de salida a WhatsApp Web.
 *
 * Un firewall o proxy que corta la conexión a web.whatsapp.com hace que
 * Baileys se desconecte en bucle (o genere QR tras QR). diagnosticar() prueba,
 * en orden, lo que necesita Baileys y dice dónde falla:
 *   1. DNS de web.whatsapp.com, g.whatsapp.net y mmg.whatsapp.net (medios)
 *   2. TLS a web.whatsapp.com:443
 *   3. WebSocket a wss://web.whatsapp.com/ws/chat (el canal de Baileys)
 *
 * Proxy: WA_PROXY_URL (o HTTPS_PROXY) → se usa en el WebSocket de Baileys y acá.
 */
const dns = require('dns').promises;
const tls = require('tls');

const HOSTS = ['web.whatsapp.com', 'g.whatsapp.net', 'mmg.whatsapp.net'];
const WS_URL = 'wss://web.whatsapp.com/ws/chat';
const proxyUrl = () => process.env.WA_PROXY_URL || process.env.HTTPS_PROXY || process.env.https_proxy || null;

let agenteCache = null;
/** Agente HTTP(S) para el proxy configurado (o undefined). */
function agenteProxy() {
  const url = proxyUrl();
  if (!url) return undefined;
  if (!agenteCache || agenteCache.url !== url) {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    agenteCache = { url, agent: new HttpsProxyAgent(url) };
  }
  return agenteCache.agent;
}

const conTiempo = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

async function paso(nombre, fn) {
  const t0 = Date.now();
  try { const detalle = await fn(); return { paso: nombre, ok: true, ms: Date.now() - t0, ...(detalle ? { detalle } : {}) }; } catch (err) {
    return { paso: nombre, ok: false, ms: Date.now() - t0, error: err.code ? `${err.code}: ${err.message}` : err.message };
  }
}

function probarTls() {
  return conTiempo(new Promise((resolve, reject) => {
    const s = tls.connect({ host: 'web.whatsapp.com', port: 443, servername: 'web.whatsapp.com' }, () => {
      const cert = s.getPeerCertificate();
      s.end();
      resolve(`certificado de ${cert?.subject?.CN || '?'}`);
    });
    s.on('error', reject);
  }), 8000, 'TLS sin respuesta en 8 s');
}

function probarWebSocket() {
  const WebSocket = require('ws');
  return conTiempo(new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, { origin: 'https://web.whatsapp.com', agent: agenteProxy(), handshakeTimeout: 8000 });
    ws.on('open', () => { ws.terminate(); resolve('handshake OK'); });
    ws.on('unexpected-response', (_req, res) => { ws.terminate(); reject(new Error(`HTTP ${res.statusCode} (¿proxy o firewall?)`)); });
    ws.on('error', reject);
  }), 10000, 'WebSocket sin respuesta en 10 s');
}

let cache = null;
/** @returns {Promise<{ok:boolean, proxy:string|null, pasos:Array, sugerencia:string|null, fecha:string}>} */
async function diagnosticar({ usarCache = true } = {}) {
  if (usarCache && cache && Date.now() - cache.t < 60000) return cache.r;
  const pasos = [];
  for (const h of HOSTS) pasos.push(await paso(`DNS ${h}`, async () => (await conTiempo(dns.lookup(h), 5000, 'DNS sin respuesta en 5 s')).address));
  // Con proxy, el TLS directo puede estar bloqueado a propósito: lo que importa es el WebSocket por el proxy
  if (!proxyUrl()) pasos.push(await paso('TLS web.whatsapp.com:443', probarTls));
  pasos.push(await paso(`WebSocket ${WS_URL}${proxyUrl() ? ' (vía proxy)' : ''}`, probarWebSocket));
  const ok = pasos.every(p => p.ok);
  const falla = pasos.find(p => !p.ok);
  let sugerencia = null;
  if (falla) {
    if (falla.paso.startsWith('DNS')) sugerencia = 'El servidor no resuelve los dominios de WhatsApp: revisá el DNS del VPS (/etc/resolv.conf).';
    else if (falla.paso.startsWith('TLS')) sugerencia = 'Hay un firewall bloqueando la salida al puerto 443 de web.whatsapp.com. Permití la salida (o configurá WA_PROXY_URL).';
    else sugerencia = 'El WebSocket de WhatsApp Web está bloqueado (firewall, proxy o inspección TLS). Sin este canal Baileys corta la sesión o pide QR en bucle. Permití wss://web.whatsapp.com o configurá WA_PROXY_URL.';
  }
  const r = { ok, proxy: proxyUrl() ? proxyUrl().replace(/\/\/[^@]*@/, '//***@') : null, pasos, sugerencia, fecha: new Date().toISOString() };
  cache = { t: Date.now(), r };
  return r;
}

/** ¿El error de desconexión parece de red (DNS, firewall, proxy)? */
function esErrorDeRed(err) {
  const txt = `${err?.code || ''} ${err?.message || ''} ${err?.cause?.code || ''}`;
  return /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ECONNABORTED|EPROTO|socket hang up|getaddrinfo|Proxy|tunneling/i.test(txt);
}

module.exports = { diagnosticar, agenteProxy, esErrorDeRed, proxyUrl };
