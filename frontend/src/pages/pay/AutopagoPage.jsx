import { useState, useEffect, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Maximize, QrCode } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { complexService } from '../../services/complexService';
import { payClub, pesos } from '../../services/payService';
import { FormCobro } from '../dashboard/PayTab';
import QrOrden from '../../components/pay/QrOrden';

/**
 * /autopago — Modo kiosco (TV o tablet) del club: el operador carga concepto e importe, el QR
 * gigante queda en pantalla y el cliente paga solo. Al aprobarse muestra la confirmación y vuelve
 * a quedar listo para el siguiente cobro.
 */
export default function AutopagoPage() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const [clubes, setClubes] = useState(null);
  const [clubId, setClubId] = useState(Number(params.get('club')) || null);
  const [orden, setOrden] = useState(null);
  const [aprobado, setAprobado] = useState(false);
  useEffect(() => { if (user) complexService.getAll().then(c => { setClubes(c); if (!clubId && c[0]) setClubId(c[0].id); }).catch(() => setClubes([])); }, [user]);   // eslint-disable-line react-hooks/exhaustive-deps
  const svc = useMemo(() => (clubId ? payClub(clubId) : null), [clubId]);
  useEffect(() => {
    if (!aprobado) return undefined;
    const t = setTimeout(() => { setOrden(null); setAprobado(false); }, 6000);
    return () => clearTimeout(t);
  }, [aprobado]);

  if (loading) return null;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent('/autopago')}`} replace />;
  const club = clubes?.find(c => c.id === clubId);
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <QrCode className="w-6 h-6 text-primary" />
        <div className="font-bold text-lg truncate">{club?.nombre || 'Jugahoy Pay'} · Autopago</div>
        {clubes?.length > 1 && <select className="input !w-auto text-sm ml-auto" value={clubId || ''} onChange={e => { setClubId(Number(e.target.value)); setOrden(null); }}>{clubes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>}
        <button className={`btn-ghost text-sm ${clubes?.length > 1 ? '' : 'ml-auto'}`} onClick={() => document.documentElement.requestFullscreen?.()}><Maximize className="w-4 h-4" /> Pantalla completa</button>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        {!svc ? null : aprobado ? (
          <div className="text-center space-y-4">
            <CheckCircle2 className="w-40 h-40 text-emerald-500 mx-auto" />
            <div className="text-4xl font-black">¡Pago aprobado!</div>
            <div className="text-2xl text-muted-foreground">{orden?.concepto} · {pesos(orden?.importe)}</div>
          </div>
        ) : orden ? (
          <div className="text-center space-y-4 w-full max-w-xl">
            <div className="text-3xl font-black">{orden.concepto}</div>
            <QrOrden orden={orden} tamano="lg" compacto onEstado={(ev) => ev.estado === 'aprobado' && setAprobado(true)} />
            <div className="text-xl text-muted-foreground">Escaneá el código con la cámara o la app de Mercado Pago</div>
            <button className="btn-ghost text-sm" onClick={() => setOrden(null)}>Cancelar y volver</button>
          </div>
        ) : (
          <div className="w-full max-w-lg"><FormCobro svc={svc} compacto onCreada={(o) => setOrden(o)} /></div>
        )}
      </main>
    </div>
  );
}
