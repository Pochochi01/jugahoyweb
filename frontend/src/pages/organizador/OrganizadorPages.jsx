import { useState, useMemo } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Trophy, LogOut, QrCode } from 'lucide-react';
import { orgApi, organizadorAuth, torneosStaff } from '../../services/torneosService';
import TorneoManager from '../../components/torneos/TorneoManager';
import { ListaTorneos, ValidarTicket } from '../dashboard/TorneosTab';
import { errMsg } from '../../utils/torneos';

// Sesión del organizador: token en 'org_token', datos en 'org_session'
function leerSesion() {
  try { return JSON.parse(localStorage.getItem('org_session')); } catch { return null; }
}

export function OrganizadorLogin() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const r = await organizadorAuth.login(usuario, password);
      localStorage.setItem('org_token', r.token);
      localStorage.setItem('org_session', JSON.stringify({ organizador: r.organizador, club: r.club }));
      navigate('/organizador');
    } catch (err) { setError(errMsg(err, 'No se pudo ingresar')); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2 font-bold text-lg"><Trophy className="w-5 h-5 text-primary" /> Organizadores</div>
        <input className="input" placeholder="Usuario" autoComplete="username" value={usuario} onChange={e => setUsuario(e.target.value)} />
        <input className="input" type="password" placeholder="Contraseña" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>{loading ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </div>
  );
}

export function OrganizadorPanel() {
  const navigate = useNavigate();
  const sesion = leerSesion();
  const cid = sesion?.organizador?.id_tenant;
  const svc = useMemo(() => (cid ? torneosStaff(orgApi, cid) : null), [cid]);
  const [abierto, setAbierto] = useState(null);
  const [tickets, setTickets] = useState(false);

  if (!svc || !localStorage.getItem('org_token')) return <Navigate to="/organizador/login" replace />;
  const salir = () => { localStorage.removeItem('org_token'); localStorage.removeItem('org_session'); navigate('/organizador/login'); };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Trophy className="w-5 h-5 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate">{sesion.club?.nombre}</div>
          <div className="text-xs text-muted-foreground">Organizador: {sesion.organizador.nombre || sesion.organizador.usuario}</div>
        </div>
        <button className="p-2 rounded-lg hover:bg-muted" title="Validar ticket" onClick={() => setTickets(t => !t)}><QrCode className="w-5 h-5" /></button>
        <button className="p-2 rounded-lg hover:bg-muted text-red-400" title="Salir" onClick={salir}><LogOut className="w-5 h-5" /></button>
      </header>
      <main className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
        {tickets && <ValidarTicket svc={svc} />}
        {abierto
          ? <TorneoManager svc={svc} torneoId={abierto} onBack={() => setAbierto(null)} />
          : <ListaTorneos svc={svc} onOpen={setAbierto} />}
      </main>
    </div>
  );
}
