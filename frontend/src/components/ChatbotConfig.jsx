import { useState, useEffect, useCallback } from 'react';
import { Bot, Cloud, Smartphone, Save, QrCode, Unlink, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import api from '../services/api';

const errMsg = (e) => e?.message || 'Ocurrió un error';
const OPCIONES = [
  { value: 'meta', label: 'Meta API (oficial)', Icon: Cloud, hint: 'WhatsApp Cloud API: botones y listas interactivas, plantillas para avisos fuera de 24 h.' },
  { value: 'baileys', label: 'Baileys (WhatsApp Web)', Icon: Smartphone, hint: 'Vinculás un teléfono escaneando un QR. Los menús se muestran como opciones numeradas.' },
];

/**
 * Configuración de Chatbot del complejo: elegir el proveedor (Meta API o Baileys)
 * y completar lo que pide cada uno. Cambiar de proveedor no borra la
 * configuración del otro (volver a Meta deja el número y el token como estaban).
 */
export default function ChatbotConfig({ complexId }) {
  const b = `/settings/${complexId}/chatbot`;
  const [cfg, setCfg] = useState(null);
  const [prov, setProv] = useState('meta');
  const [form, setForm] = useState({ meta_phone_number_id: '', meta_access_token: '' });
  const [msg, setMsg] = useState({});
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(() => api.get(b).then(d => {
    setCfg(d); setProv(p => (cfg ? p : d.chat_provider));
    setForm(f => ({ ...f, meta_phone_number_id: f.meta_phone_number_id || d.meta.phone_number_id || '' }));
  }).catch(e => setMsg({ error: errMsg(e) })), [b]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [cargar]);
  // Esperando escaneo del QR → refrescar
  useEffect(() => {
    if (cfg?.chat_provider !== 'baileys' || !['qr', 'conectando'].includes(cfg?.baileys?.estado)) return undefined;
    const t = setInterval(cargar, 3000);
    return () => clearInterval(t);
  }, [cfg, cargar]);

  const guardar = async () => {
    setOcupado(true); setMsg({});
    try {
      const r = await api.put(b, { chat_provider: prov, ...(prov === 'meta' ? form : {}) });
      setMsg({ ok: r.message }); setForm(f => ({ ...f, meta_access_token: '' }));
      setTimeout(cargar, 1500); cargar();
    } catch (e) { setMsg({ error: errMsg(e) }); } finally { setOcupado(false); }
  };
  const baileys = async (accion) => {
    setOcupado(true); setMsg({});
    try {
      if (accion === 'desconectar') { if (!confirm('¿Desvincular el teléfono del chatbot?')) return; await api.delete(`${b}/baileys`); }
      else await api.post(`${b}/baileys`);
      setTimeout(cargar, 2000); cargar();
    } catch (e) { setMsg({ error: errMsg(e) }); } finally { setOcupado(false); }
  };

  if (!cfg) return <div className="card text-sm text-muted-foreground">{msg.error || 'Cargando configuración del chatbot…'}</div>;
  const bs = cfg.baileys || {};
  const cambio = prov !== cfg.chat_provider;

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <Bot className="w-5 h-5 text-primary" />
        <h3 className="font-semibold mr-auto">Configuración de Chatbot</h3>
        <span className="badge-neutral">Activo: {cfg.chat_provider === 'baileys' ? 'Baileys' : 'Meta API'}</span>
      </div>

      <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Proveedor del chatbot">
        {OPCIONES.map(({ value, label, Icon, hint }) => (
          <button key={value} type="button" role="radio" aria-checked={prov === value} onClick={() => setProv(value)}
            className={`text-left rounded-xl border px-3 py-3 transition-[border-color,background-color] duration-160 ease-out
              ${prov === value ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-card hover:border-foreground/25'}`}>
            <span className="flex items-center gap-2 text-sm font-semibold"><Icon className="w-4 h-4 text-primary" /> {label}</span>
            <span className="block mt-1 text-xs text-muted-foreground">{hint}</span>
          </button>
        ))}
      </div>

      {prov === 'meta' && (
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Phone Number ID</span>
            <input className="input tabular" inputMode="numeric" placeholder="Ej: 123456789012345" value={form.meta_phone_number_id}
              onChange={e => setForm(f => ({ ...f, meta_phone_number_id: e.target.value }))} />
          </label>
          <label className="block">
            <span className="label">Access Token</span>
            <input className="input" type="password" autoComplete="off"
              placeholder={cfg.meta.access_token ? `Guardado (${cfg.meta.access_token}) — dejalo vacío para mantenerlo` : cfg.meta.token_plataforma ? 'Se usa el token de la plataforma' : 'Pegá el token de Meta'}
              value={form.meta_access_token} onChange={e => setForm(f => ({ ...f, meta_access_token: e.target.value }))} />
          </label>
          {cfg.meta.vencido && <p className="sm:col-span-2 alert-error"><AlertTriangle className="w-4 h-4" /> El token de Meta está vencido: cargá uno nuevo.</p>}
        </div>
      )}

      {prov === 'baileys' && cfg.chat_provider === 'baileys' && (
        <div className="rounded-xl border border-border p-3 space-y-3">
          {bs.disponible === false ? (
            <p className="alert-error">Baileys no está instalado en el servidor.</p>
          ) : bs.estado === 'conectado' ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="badge-green"><CheckCircle2 className="w-3.5 h-3.5" /> Teléfono vinculado</span>
              <button className="btn-ghost btn-sm !text-danger" disabled={ocupado} onClick={() => baileys('desconectar')}><Unlink className="w-4 h-4" /> Desvincular</button>
            </div>
          ) : bs.qr ? (
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <img src={bs.qr} alt="QR para vincular WhatsApp" className="w-52 h-52 rounded-lg bg-white p-2" />
              <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
                <li>Abrí WhatsApp en el teléfono del complejo.</li>
                <li>Tocá <b className="text-foreground">⋮ → Dispositivos vinculados → Vincular un dispositivo</b>.</li>
                <li>Escaneá el código. La pantalla se actualiza sola.</li>
              </ol>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {bs.estado === 'conectando' && <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" /> Conectando…</span>}
              <button className="btn-primary btn-sm" disabled={ocupado} onClick={() => baileys('conectar')}><QrCode className="w-4 h-4" /> Generar QR</button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">WhatsApp Web no es la API oficial: usá un número del complejo y evitá envíos masivos no esperados para no arriesgar el bloqueo del número.</p>
        </div>
      )}
      {prov === 'baileys' && cfg.chat_provider !== 'baileys' && (
        <p className="hint">Guardá para activar Baileys; después aparece el QR para vincular el teléfono. La configuración de Meta no se borra.</p>
      )}
      {prov === 'meta' && cfg.chat_provider !== 'meta' && (
        <p className="hint">Al guardar, el chatbot vuelve a la API de Meta con estos datos.</p>
      )}

      {msg.error && <p className="text-sm text-danger" role="alert">{msg.error}</p>}
      {msg.ok && <p className="text-sm text-success" role="status">{msg.ok}</p>}
      {(cambio || prov === 'meta') && (
        <button className="btn-primary" disabled={ocupado} onClick={guardar}>
          {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar configuración
        </button>
      )}
    </div>
  );
}
