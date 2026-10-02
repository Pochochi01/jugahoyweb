import { useState, useEffect, useCallback } from 'react';
import { CreditCard, CheckCircle2, AlertTriangle, RefreshCw, Unplug, ExternalLink } from 'lucide-react';
import { mercadopagoService } from '../services/mercadopagoService';
import { generarPkce, guardarVerifier } from '../utils/pkce';
import ModalidadPagoConfig from './ModalidadPagoConfig';

const fecha = (f) => (f ? new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

/**
 * Conexión del complejo con SU cuenta de MercadoPago (OAuth oficial).
 * "Conectar" lleva a MercadoPago, el usuario autoriza y vuelve al panel; los
 * tokens se guardan cifrados en el servidor y se renuevan solos.
 * @param {{ complexId:number, resultado?: {tipo:'ok'|'error', msg:string} }} props
 *        resultado: lo que trajo la vuelta desde MercadoPago (?mp=...)
 */
export default function MercadoPagoConexion({ complexId, resultado }) {
  const [e, setE] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState(resultado || null);

  const cargar = useCallback(() => mercadopagoService.estado(complexId).then(setE).catch(err => setMsg({ tipo: 'error', msg: err?.message || 'No se pudo leer el estado.' })), [complexId]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (resultado) setMsg(resultado); }, [resultado]);

  const conectar = async () => {
    setCargando(true); setMsg(null);
    try {
      // PKCE: el verifier queda en este navegador; a MercadoPago solo viaja el challenge
      const { verifier, challenge } = await generarPkce();
      const { url } = await mercadopagoService.urlConexion(complexId, challenge);
      guardarVerifier(verifier, complexId);
      window.location.href = url;   // a MercadoPago → backend → /mercadopago/callback → /dashboard?mp=...
    } catch (err) { setMsg({ tipo: 'error', msg: err?.message || 'No se pudo iniciar la conexión.' }); setCargando(false); }
  };
  const accion = async (fn, ok) => {
    setCargando(true); setMsg(null);
    try { await fn(); await cargar(); setMsg({ tipo: 'ok', msg: ok }); }
    catch (err) { setMsg({ tipo: 'error', msg: err?.message || 'Error' }); await cargar(); }
    finally { setCargando(false); }
  };

  const conectado = e?.conectado;
  const revocado = e?.estado === 'revocado';

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <CreditCard className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">Cobros con MercadoPago</h3>
        {e && (conectado
          ? <span className="badge-green">Conectado</span>
          : revocado ? <span className="badge-red">Hay que reconectar</span> : <span className="badge-yellow">Sin conectar</span>)}
        {conectado && e.live_mode === false && <span className="badge-blue">Modo prueba</span>}
      </div>

      {msg && (
        <div role="status" className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${msg.tipo === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.tipo === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{msg.msg}</span>
        </div>
      )}

      {!e ? <p className="text-sm text-muted-foreground">Cargando…</p> : !e.oauth_configurado ? (
        <div className="text-sm text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>La plataforma todavía no tiene configurada la app de MercadoPago (MP_CLIENT_ID / MP_CLIENT_SECRET / MP_REDIRECT_URI). Avisale al administrador.</span>
        </div>
      ) : conectado ? (
        <>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div><span className="text-muted-foreground">Cuenta vinculada: </span><strong>{e.correo_vinculado || `Usuario #${e.mp_user_id}`}</strong></div>
            <div><span className="text-muted-foreground">Conectada desde: </span>{fecha(e.conectado_desde)}</div>
            <div><span className="text-muted-foreground">Token vigente hasta: </span>{fecha(e.expires_at)} <span className="text-xs text-muted-foreground">(se renueva solo)</span></div>
            <div><span className="text-muted-foreground">Última renovación: </span>{fecha(e.renovado_at)}</div>
          </div>
          <p className="text-xs text-muted-foreground">Los pagos online de reservas y torneos se acreditan en esta cuenta.</p>
          {/* Conectado → se habilitan seña / total en todas las canchas */}
          <ModalidadPagoConfig complexId={complexId} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline text-sm flex items-center gap-1.5" disabled={cargando}
              onClick={() => accion(() => mercadopagoService.renovar(complexId), 'Conexión verificada: el token se renovó correctamente.')}>
              <RefreshCw className="w-4 h-4" /> Verificar / renovar ahora
            </button>
            <button className="btn-outline text-sm flex items-center gap-1.5" disabled={cargando} onClick={conectar}>Cambiar de cuenta</button>
            <button className="text-sm text-red-400 hover:underline flex items-center gap-1.5 px-2" disabled={cargando}
              onClick={() => confirm('¿Desconectar la cuenta de MercadoPago? Se dejan de ofrecer los pagos online hasta volver a conectar.') &&
                accion(() => mercadopagoService.desconectar(complexId), 'Cuenta de MercadoPago desconectada.')}>
              <Unplug className="w-4 h-4" /> Desconectar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {revocado
              ? <>La autorización se perdió (se quitó el permiso en MercadoPago o venció). {e.correo_vinculado && <>Cuenta anterior: <strong>{e.correo_vinculado}</strong>. </>}Volvé a conectar para seguir cobrando online.</>
              : 'Conectá la cuenta de MercadoPago del complejo para cobrar online señas, turnos e inscripciones a torneos. Vas a ingresar a MercadoPago y autorizar a JugaHoy: no se comparte tu contraseña.'}
          </p>
          <button onClick={conectar} disabled={cargando}
            className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white bg-[#009ee3] hover:bg-[#0089c7] disabled:opacity-60">
            <ExternalLink className="w-4 h-4" /> {cargando ? 'Abriendo MercadoPago…' : revocado ? 'Reconectar con MercadoPago' : 'Conectar con MercadoPago'}
          </button>
        </>
      )}
    </div>
  );
}
