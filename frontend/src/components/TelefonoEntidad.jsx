import { useState, useEffect, useCallback, useMemo } from 'react';
import { Smartphone, QrCode, Unlink, Send, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';

const errMsg = (e) => e?.message || 'Ocurrió un error';
const fechaHora = (f) => (f ? new Date(f).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

/**
 * WhatsApp propio de una entidad (torneo / escuela / profesor) vinculado por QR (Baileys).
 * Muestra el estado, el QR para vincular, la lista de destinatarios permitidos
 * (inscriptos o alumnos) y el formulario de envío con el historial.
 *
 * @param {object}   props.svc       telefonoApi(...) de services/telefonoEntidadService
 * @param {string[]} [props.acciones] 'conectar' | 'desconectar' | 'enviar' (por defecto todas)
 * @param {string}   [props.quienes]  texto: "inscriptos", "alumnos"…
 * @param {Array}    [props.categorias] escuelas: [{id, nombre}] para filtrar destinatarios
 */
export default function TelefonoEntidad({ svc, acciones = ['conectar', 'desconectar', 'enviar'], quienes = 'destinatarios', categorias = [] }) {
  const [st, setSt] = useState(null);
  const [dest, setDest] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [categoria, setCategoria] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [msg, setMsg] = useState({});
  const [ocupado, setOcupado] = useState(false);
  const puede = (a) => acciones.includes(a);

  const cargar = useCallback(() => svc.estado().then(setSt).catch(e => setMsg({ error: errMsg(e) })), [svc]);
  useEffect(() => { cargar(); }, [cargar]);
  // Mientras se espera el escaneo o hay un envío en curso, refrescar
  useEffect(() => {
    if (!st || !(st.estado === 'esperando_qr' || st.estado === 'conectando' || st.envio_en_curso)) return undefined;
    const t = setInterval(cargar, 2500);
    return () => clearInterval(t);
  }, [st, cargar]);

  useEffect(() => {
    if (!puede('enviar')) return;
    setDest(null);
    svc.destinatarios(categoria ? { categoria_id: categoria } : {})
      .then(r => { setDest(r.destinatarios); setSel(new Set(r.destinatarios.map(d => d.numero))); })
      .catch(() => setDest([]));
  }, [svc, categoria]); // eslint-disable-line react-hooks/exhaustive-deps

  const conectar = async () => {
    setOcupado(true); setMsg({});
    try { setSt(await svc.conectar()); } catch (e) { setMsg({ error: errMsg(e) }); } finally { setOcupado(false); }
  };
  const desconectar = async () => {
    if (!confirm('¿Desvincular este teléfono? Los mensajes dejarán de salir desde ese número.')) return;
    setOcupado(true);
    try { setSt(await svc.desconectar()); setMsg({ ok: 'Teléfono desvinculado.' }); } catch (e) { setMsg({ error: errMsg(e) }); } finally { setOcupado(false); }
  };
  const enviar = async () => {
    if (!sel.size) return setMsg({ error: 'Elegí al menos un destinatario.' });
    if (!confirm(`¿Enviar el mensaje a ${sel.size} ${quienes}?`)) return;
    setOcupado(true); setMsg({});
    try {
      const todos = dest && sel.size === dest.length;
      const r = await svc.enviar({ mensaje, categoria_id: categoria || undefined, numeros: todos ? undefined : [...sel] });
      setMsg({ ok: r.message }); setMensaje(''); cargar();
    } catch (e) { setMsg({ error: errMsg(e) }); } finally { setOcupado(false); }
  };
  const toggle = (n) => setSel(s => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const vista = useMemo(() => (mensaje ? `📣 *${st?.entidad?.nombre || ''}*\n\n${mensaje.replace(/\{nombre\}/gi, (dest?.[0]?.nombre || 'Juan').split(' ')[0])}` : ''), [mensaje, st, dest]);

  if (!st) return <div className="card text-sm text-muted-foreground">{msg.error || 'Cargando…'}</div>;
  const conectado = st.estado === 'conectado';

  return (
    <div className="space-y-3 max-w-3xl">
      {/* Estado del teléfono */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary" />
          <h3 className="font-semibold mr-auto">WhatsApp de {st.entidad?.nombre}</h3>
          {conectado
            ? <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-500/15 text-green-300"><CheckCircle2 className="w-3.5 h-3.5" /> Conectado · +{st.numero}</span>
            : st.estado === 'esperando_qr'
              ? <span className="text-xs px-2 py-1 rounded-full bg-amber-500/15 text-amber-300">Esperando escaneo</span>
              : <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/70">No conectado</span>}
        </div>
        {st.error && <p className="text-xs text-amber-400 flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {st.error}</p>}

        {!conectado && st.estado !== 'esperando_qr' && (puede('conectar')
          ? <button className="btn-primary text-sm flex items-center gap-1.5" disabled={ocupado} onClick={conectar}><QrCode className="w-4 h-4" /> {ocupado ? 'Generando QR…' : 'Conectar teléfono'}</button>
          : <p className="text-xs text-muted-foreground">El teléfono todavía no está vinculado.</p>)}

        {st.estado === 'esperando_qr' && (
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {st.qr ? <img src={st.qr} alt="QR para vincular WhatsApp" className="w-56 h-56 rounded-lg bg-white p-2 shrink-0" />
              : <div className="w-56 h-56 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground shrink-0">Generando QR…</div>}
            <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
              <li>Abrí <strong className="text-foreground">WhatsApp</strong> en el teléfono que querés usar.</li>
              <li>Tocá <strong className="text-foreground">⋮ → Dispositivos vinculados → Vincular un dispositivo</strong>.</li>
              <li>Escaneá este código. La pantalla se actualiza sola.</li>
              <li className="list-none -ml-5 pt-2 text-[11px]">Un número solo puede estar vinculado a una entidad. Usá un número del club u organizador: WhatsApp puede bloquear números que envían muchos mensajes no esperados.</li>
              {puede('conectar') && <li className="list-none -ml-5"><button className="text-xs text-primary hover:underline flex items-center gap-1" onClick={conectar}><RefreshCw className="w-3 h-3" /> Generar otro QR</button></li>}
            </ol>
          </div>
        )}

        {conectado && puede('desconectar') && (
          <button className="text-xs text-red-400 hover:underline flex items-center gap-1" disabled={ocupado} onClick={desconectar}><Unlink className="w-3.5 h-3.5" /> Desvincular teléfono</button>
        )}
      </div>

      {/* Destinatarios + mensaje */}
      {puede('enviar') && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold mr-auto">{quienes.charAt(0).toUpperCase() + quienes.slice(1)} {dest && <span className="text-xs text-muted-foreground font-normal">({sel.size}/{dest.length} elegidos)</span>}</h3>
            {categorias.length > 0 && (
              <select className="input !w-auto text-sm" value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Categoría">
                <option value="">Todas las categorías</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            )}
            {dest?.length > 0 && (
              <button className="text-xs text-primary hover:underline" onClick={() => setSel(sel.size === dest.length ? new Set() : new Set(dest.map(d => d.numero)))}>
                {sel.size === dest.length ? 'Ninguno' : 'Todos'}
              </button>
            )}
          </div>
          {!dest ? <p className="text-sm text-muted-foreground">Cargando…</p> : dest.length === 0
            ? <p className="text-sm text-muted-foreground">No hay {quienes} con WhatsApp cargado.</p>
            : (
              <div className="max-h-64 overflow-y-auto divide-y divide-border rounded-lg border border-border">
                {dest.map(d => (
                  <label key={d.numero} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40">
                    <input type="checkbox" checked={sel.has(d.numero)} onChange={() => toggle(d.numero)} />
                    <span className="font-medium truncate">{d.nombre}</span>
                    <span className="text-xs text-muted-foreground truncate">{d.detalle}</span>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">+{d.numero}</span>
                  </label>
                ))}
              </div>
            )}
          <textarea className="input" rows={4} maxLength={2000} placeholder="Escribí el mensaje. Podés usar {nombre} para saludar a cada uno." value={mensaje} onChange={e => setMensaje(e.target.value)} />
          {vista && <pre className="text-xs whitespace-pre-wrap rounded-lg bg-muted/40 p-2 text-muted-foreground font-sans">{vista}{'\n\n'}<i>{'(con el nombre del club al pie)'}</i></pre>}
          <button className="btn-primary text-sm flex items-center gap-1.5" disabled={!conectado || ocupado || !mensaje.trim() || st.envio_en_curso} onClick={enviar}>
            <Send className="w-4 h-4" /> {!conectado ? 'Conectá el teléfono para enviar' : st.envio_en_curso ? 'Envío en curso…' : `Enviar a ${sel.size}`}
          </button>
        </div>
      )}

      {msg.error && <p className="text-sm text-red-400">{msg.error}</p>}
      {msg.ok && <p className="text-sm text-green-400">{msg.ok}</p>}

      {st.envios?.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-sm mb-2">Últimos envíos</h3>
          <div className="space-y-1.5">
            {st.envios.map(e => (
              <div key={e.envio_id} className="text-xs flex flex-wrap gap-x-3 gap-y-0.5 border-b border-border/50 pb-1.5 last:border-0">
                <span className="text-muted-foreground">{fechaHora(e.fecha)}</span>
                <span className="truncate max-w-[45ch]">{e.mensaje}</span>
                <span className="ml-auto text-green-400">{e.enviados}/{e.total} enviados</span>
                {e.pendientes > 0 && <span className="text-amber-300">{e.pendientes} en cola</span>}
                {e.errores > 0 && <span className="text-red-400">{e.errores} con error</span>}
                {e.enviado_por && <span className="text-muted-foreground">· {e.enviado_por} · desde +{e.desde}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
