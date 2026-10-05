import { useState, useEffect, useMemo, useCallback } from 'react';
import { Trophy, Plus, UserCog, QrCode, Pencil, Trash2, X, ListOrdered } from 'lucide-react';
import RankingAnual from '../../components/torneos/RankingAnual';
import api from '../../services/api';
import { torneosStaff } from '../../services/torneosService';
import TorneoManager from '../../components/torneos/TorneoManager';
import TorneoForm from '../../components/torneos/TorneoForm';
import { ESTADO_TORNEO, GENEROS, DEPORTES_TORNEO, catLabel, fechaCorta, errMsg } from '../../utils/torneos';

/**
 * Tab "Torneos" del panel del club (cualquier deporte; cada torneo usa las canchas de su deporte).
 * Los admins además gestionan organizadores (login propio en /organizador/login).
 */
export default function TorneosTab({ complexId }) {
  const svc = useMemo(() => torneosStaff(api, complexId), [complexId]);
  const [vista, setVista] = useState('torneos');   // torneos | organizadores | tickets
  const [abierto, setAbierto] = useState(null);

  if (abierto) return <TorneoManager svc={svc} torneoId={abierto} onBack={() => setAbierto(null)} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold flex items-center gap-2 mr-auto"><Trophy className="w-5 h-5 text-primary" /> Torneos</h2>
        {[['torneos', 'Torneos', Trophy], ['ranking', 'Ranking anual', ListOrdered], ['organizadores', 'Organizadores', UserCog], ['tickets', 'Validar ticket', QrCode]].map(([k, l, Icon]) => (
          <button key={k} onClick={() => setVista(k)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${vista === k ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
            <Icon className="w-4 h-4" /> {l}
          </button>
        ))}
      </div>
      {vista === 'torneos' && <ListaTorneos svc={svc} onOpen={setAbierto} />}
      {vista === 'ranking' && <RankingAnual svc={svc} />}
      {vista === 'organizadores' && <Organizadores svc={svc} />}
      {vista === 'tickets' && <ValidarTicket svc={svc} />}
    </div>
  );
}

export function ListaTorneos({ svc, onOpen }) {
  const [data, setData] = useState(null);
  const [creando, setCreando] = useState(false);
  const cargar = useCallback(() => svc.list().then(setData).catch(() => setData({ torneos: [], habilitado: false })), [svc]);
  useEffect(() => { cargar(); }, [cargar]);
  if (!data) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-4">
      {!data.habilitado && (
        <div className="alert-error" role="alert">El complejo no tiene canchas habilitadas: agregalas en Configuración para organizar torneos.</div>
      )}
      {data.habilitado && !creando && (
        <button className="btn-primary text-sm flex items-center gap-1" onClick={() => setCreando(true)}><Plus className="w-4 h-4" /> Nuevo torneo</button>
      )}
      {creando && (
        <TorneoForm deportes={data.deportes_disponibles || []} onCancel={() => setCreando(false)} onSave={async (d) => {
          const t = await svc.create(d); setCreando(false); onOpen(t.id);
        }} />
      )}
      {data.torneos.length === 0 && !creando && <div className="card text-sm text-muted-foreground text-center py-8">Todavía no hay torneos.</div>}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {data.torneos.map(t => (
          <button key={t.id} onClick={() => onOpen(t.id)} className="card text-left hover:border-primary/50 transition-colors space-y-1">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold">{t.nombre}</span>
              <span className={ESTADO_TORNEO[t.estado].cls}>{ESTADO_TORNEO[t.estado].label}</span>
            </div>
            <div className="text-xs text-muted-foreground">{DEPORTES_TORNEO[t.deporte] || 'Pádel'} · {t.tipo === 'anual' ? 'Anual · ' : ''}{catLabel(t.categoria)} {GENEROS[t.genero]} · {fechaCorta(t.fecha_inicio)} → {fechaCorta(t.fecha_fin)}</div>
            <div className="text-xs">{t.inscriptas}/{t.cupo_parejas} parejas · {t.pagadas} pagadas</div>
          </button>
        ))}
      </div>
    </div>
  );
}

const ORG_VACIO = { nombre: '', usuario: '', password: '', whatsapp: '' };

function Organizadores({ svc }) {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);   // null | { ...campos, id? }
  const [error, setError] = useState('');
  const cargar = useCallback(() => svc.listOrganizadores().then(setRows).catch(e => setError(errMsg(e))), [svc]);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (e) => {
    e.preventDefault(); setError('');
    try {
      const { id, ...d } = form;
      if (id) await svc.updateOrganizador(id, d); else await svc.createOrganizador(d);
      setForm(null); cargar();
    } catch (err) { setError(errMsg(err)); }
  };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-muted-foreground">
        Los organizadores ingresan en <a href="/organizador/login" className="text-primary hover:underline">/organizador/login</a> y
        gestionan inscripciones, pagos, canchas, resultados y comunicación de los torneos de este club.
      </p>
      {!form && <button className="btn-primary text-sm flex items-center gap-1" onClick={() => setForm(ORG_VACIO)}><Plus className="w-4 h-4" /> Nuevo organizador</button>}
      {form && (
        <form onSubmit={guardar} className="card grid sm:grid-cols-2 gap-3">
          <input className="input" placeholder="Nombre" value={form.nombre || ''} onChange={e => set('nombre', e.target.value)} />
          <input className="input" placeholder="Usuario" value={form.usuario} onChange={e => set('usuario', e.target.value)} required />
          <input className="input" type="password" autoComplete="new-password" placeholder={form.id ? 'Nueva contraseña (opcional)' : 'Contraseña'} value={form.password || ''} onChange={e => set('password', e.target.value)} />
          <input className="input" placeholder="WhatsApp" value={form.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} />
          <div className="sm:col-span-2 flex gap-2">
            <button className="btn-primary text-sm">Guardar</button>
            <button type="button" className="btn-outline text-sm" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="space-y-2">
        {rows?.map(o => (
          <div key={o.id} className="card py-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="font-medium">{o.nombre || o.usuario}</div>
              <div className="text-xs text-muted-foreground">@{o.usuario}{o.whatsapp ? ` · ${o.whatsapp}` : ''}</div>
            </div>
            <button className={o.activo ? 'badge-green' : 'badge-red'} onClick={async () => { await svc.updateOrganizador(o.id, { activo: !o.activo }); cargar(); }}>
              {o.activo ? 'Activo' : 'Inactivo'}
            </button>
            <button className="p-1.5 rounded hover:bg-muted" aria-label="Editar" onClick={() => setForm({ ...o, password: '' })}><Pencil className="w-4 h-4" /></button>
            <button className="p-1.5 rounded hover:bg-red-500/10 text-red-400" aria-label="Eliminar"
              onClick={async () => { if (confirm(`¿Eliminar a ${o.usuario}?`)) { await svc.deleteOrganizador(o.id); cargar(); } }}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {rows?.length === 0 && <div className="card text-sm text-muted-foreground text-center py-6">Sin organizadores.</div>}
      </div>
    </div>
  );
}

export function ValidarTicket({ svc }) {
  const [codigo, setCodigo] = useState('');
  const [res, setRes] = useState(null);
  const validar = async (e) => {
    e.preventDefault();
    // Acepta el código solo o la URL completa que codifica el QR
    const c = codigo.trim().split('/').pop();
    try { setRes(await svc.validarTicket(c)); } catch (err) { setRes({ error: errMsg(err) }); }
  };
  return (
    <form onSubmit={validar} className="card space-y-3 max-w-lg">
      <p className="text-sm text-muted-foreground">Escaneá el QR con un lector (o pegá el link / código) para registrar el ingreso del jugador.</p>
      <div className="flex gap-2">
        <input className="input" autoFocus placeholder="Código o link del ticket" value={codigo} onChange={e => setCodigo(e.target.value)} />
        <button className="btn-primary">Validar</button>
      </div>
      {res?.error && <p className="text-sm text-red-400 flex items-center gap-1"><X className="w-4 h-4" /> {res.error}</p>}
      {res?.ok && (
        <p className={`text-sm ${res.ya_usado ? 'text-amber-400' : 'text-green-400'}`}>
          {res.ya_usado ? '⚠️ Ticket ya utilizado' : '✅ Ingreso registrado'} — {res.jugador} · {res.torneo}
        </p>
      )}
    </form>
  );
}
