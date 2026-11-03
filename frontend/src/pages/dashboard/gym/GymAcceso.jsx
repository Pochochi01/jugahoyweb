import { useState, useRef, useEffect } from 'react';
import { ScanLine, CheckCircle2, XCircle, Search, UserCheck } from 'lucide-react';
import { useGym, puede, useCarga, Tabla, Campo, Cargando, errMsg, nombre, money, fechaCorta } from '../../../components/gym/GymUI';

const METODOS_ACCESO = [['qr', 'QR'], ['codigo', 'Código'], ['dni', 'DNI']];

/**
 * Recepción: ingreso de socios por QR (lector que tipea "GYM:<token>" + Enter),
 * código o DNI, con resultado grande y la lista de ingresos del día.
 */
export default function GymAcceso() {
  const { api, permisos, sucursales, avisar } = useGym();
  const [metodo, setMetodo] = useState('qr');
  const [dato, setDato] = useState('');
  const [sucursal, setSucursal] = useState(sucursales[0]?.id || '');
  const [resultado, setResultado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [manual, setManual] = useState('');
  const [encontrados, setEncontrados] = useState([]);
  const input = useRef(null);
  const puedeIngresar = puede(permisos, 'accesos', 'crear');
  const lista = useCarga(() => api.accesos(filtro ? { resultado: filtro } : {}), [api, filtro]);

  useEffect(() => { input.current?.focus(); }, [metodo]);

  const registrar = async (m, d) => {
    setEnviando(true);
    try {
      setResultado(await api.acceso({ metodo: m, dato: d, sucursal_id: sucursal || undefined }));
      lista.recargar();
    } catch (e) { avisar('err', errMsg(e)); } finally { setEnviando(false); setDato(''); input.current?.focus(); }
  };
  const enviar = (e) => {
    e.preventDefault();
    const v = dato.trim();
    if (!v) return;
    registrar(v.startsWith('GYM:') ? 'qr' : metodo, v);
  };
  const buscar = async (e) => {
    e.preventDefault();
    if (manual.trim().length < 2) return;
    try { setEncontrados((await api.socios({ q: manual.trim(), limite: 10 })).socios); } catch (err) { avisar('err', errMsg(err)); }
  };

  return (
    <div className="space-y-4">
      {puedeIngresar && (
        <div className="grid lg:grid-cols-2 gap-4">
          <form onSubmit={enviar} className="card space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><ScanLine className="w-4 h-4 text-primary" /> Registrar ingreso</h3>
            <div className="flex flex-wrap gap-2">
              {METODOS_ACCESO.map(([v, l]) => (
                <button key={v} type="button" onClick={() => setMetodo(v)} aria-pressed={metodo === v}
                  className={`px-3 py-1.5 rounded-full text-sm border ${metodo === v ? 'border-primary bg-primary/15 text-primary font-medium' : 'border-border text-muted-foreground'}`}>{l}</button>
              ))}
              {sucursales.length > 1 && (
                <select className="input text-sm !w-auto ml-auto" value={sucursal} onChange={e => setSucursal(e.target.value)} aria-label="Sucursal">
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              )}
            </div>
            <input ref={input} className="input text-lg py-3" value={dato} onChange={e => setDato(e.target.value)} autoComplete="off"
              placeholder={metodo === 'qr' ? 'Escaneá el QR del socio…' : metodo === 'dni' ? 'DNI del socio' : 'Código de socio'} aria-label="Dato de ingreso" />
            <button className="btn-primary w-full" disabled={enviando || !dato.trim()}>Validar ingreso</button>
            <p className="hint">El lector de QR escribe el código y presiona Enter solo: no hace falta tocar el botón.</p>
          </form>
          <Resultado r={resultado} />
        </div>
      )}

      {puedeIngresar && (
        <form onSubmit={buscar} className="card space-y-2">
          <h3 className="font-semibold text-sm flex items-center gap-2"><UserCheck className="w-4 h-4 text-primary" /> Ingreso manual</h3>
          <div className="flex gap-2">
            <input className="input text-sm" placeholder="Nombre, apellido o DNI" value={manual} onChange={e => setManual(e.target.value)} />
            <button className="btn-outline btn-sm"><Search className="w-4 h-4" /> Buscar</button>
          </div>
          {encontrados.length > 0 && (
            <ul className="divide-y divide-border">
              {encontrados.map(s => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate">{nombre(s)} <span className="text-muted-foreground">· DNI {s.dni}</span></span>
                  <button type="button" className="btn-primary btn-sm" onClick={() => { registrar('manual', String(s.id)); setEncontrados([]); setManual(''); }}>Registrar</button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold mr-auto">Ingresos de hoy</h3>
          <Campo label="" tipo="select" value={filtro} onChange={setFiltro} opciones={[['', 'Todos'], ['permitido', 'Permitidos'], ['denegado', 'Denegados']]} />
        </div>
        {lista.cargando && !lista.data ? <Cargando /> : (
          <Tabla filas={lista.data || []} vacio="Todavía no hubo ingresos hoy." columnas={[
            { k: 'hora', l: 'Hora', r: a => new Date(a.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }) },
            { k: 'socio', l: 'Socio', r: a => (a.socio ? nombre(a.socio) : <span className="text-muted-foreground">No encontrado ({a.dato})</span>) },
            { k: 'metodo', l: 'Método', r: a => a.metodo.toUpperCase() },
            { k: 'resultado', l: 'Resultado', r: a => <span className={a.resultado === 'permitido' ? 'badge-green' : 'badge-red'}>{a.resultado === 'permitido' ? 'Permitido' : 'Denegado'}</span> },
            { k: 'motivo', l: 'Motivo', r: a => a.motivo || '—' },
          ]} />
        )}
      </div>
    </div>
  );
}

function Resultado({ r }) {
  if (!r) return <div className="card flex items-center justify-center text-sm text-muted-foreground min-h-[12rem]">El resultado del ingreso aparece acá.</div>;
  const ok = r.permitido;
  return (
    <div className={`card min-h-[12rem] flex flex-col items-center justify-center text-center gap-2 border-2 ${ok ? 'border-success bg-success/10' : 'border-danger bg-danger/10'}`} role="status" aria-live="assertive">
      {ok ? <CheckCircle2 className="w-14 h-14 text-success" /> : <XCircle className="w-14 h-14 text-danger" />}
      <div className={`text-2xl font-extrabold ${ok ? 'text-success' : 'text-danger'}`}>{ok ? 'INGRESO PERMITIDO' : 'INGRESO DENEGADO'}</div>
      {r.socio && (
        <div className="flex items-center gap-3">
          {r.socio.foto_url && <img src={r.socio.foto_url} alt="" className="w-12 h-12 rounded-full object-cover" />}
          <div className="text-left"><div className="font-semibold">{nombre(r.socio)}</div><div className="text-xs text-muted-foreground">DNI {r.socio.dni}</div></div>
        </div>
      )}
      {ok && <p className="text-sm">{r.plan} · vence {fechaCorta(r.vence)}</p>}
      {!ok && <ul className="text-sm space-y-0.5">{r.motivos.map(m => <li key={m}>• {m}</li>)}</ul>}
      {r.saldo > 0 && <p className="text-xs text-muted-foreground">Saldo adeudado: {money(r.saldo)}</p>}
    </div>
  );
}
