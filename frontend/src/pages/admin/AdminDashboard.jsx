import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, DollarSign, Power, PowerOff, Pencil,
  Trash2, Plus, X, CheckCircle, XCircle, LayoutDashboard,
  TrendingUp, AlertCircle, Filter, LogOut,
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useAuth } from '../../context/AuthContext';

// ── Modal de suscripción ──────────────────────────────────────────────────────
function SubscriptionModal({ complex, onSave, onClose }) {
  const existing = complex.subscription;
  const [form, setForm] = useState({
    precio_mensual:    existing?.precio_mensual ?? '',
    fecha_inicio:      existing?.fecha_inicio ?? new Date().toISOString().split('T')[0],
    fecha_pago:        existing?.fecha_pago ?? '',
    fecha_vencimiento: existing?.fecha_vencimiento ?? '',
    notas:             existing?.notas ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.precio_mensual && form.precio_mensual !== 0) return setError('El precio es obligatorio.');
    setSaving(true);
    setError('');
    try {
      await onSave({ ...form, complex_id: complex.id, precio_mensual: parseFloat(form.precio_mensual) });
      onClose();
    } catch (err) {
      setError(err.message || 'Error al guardar.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* header */}
        <div className="bg-primary px-6 py-4 text-white flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">
              {existing ? 'Editar suscripción' : 'Nueva suscripción'}
            </h2>
            <p className="text-sm text-white/80 mt-0.5">{complex.nombre}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* info del complejo */}
        <div className="px-6 pt-5 pb-3 bg-muted/50 border-b border-border">
          <div className="flex gap-6 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Canchas activas</div>
              <div className="text-2xl font-bold text-primary">{complex.canchas_activas}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total canchas</div>
              <div className="text-2xl font-bold">{complex.total_canchas}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Ciudad</div>
              <div className="font-medium">{complex.ciudad || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Titular</div>
              <div className="font-medium">{complex.owner?.nombre} {complex.owner?.apellido}</div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm">{error}</div>}

          <div>
            <label className="label">Precio mensual ($) <span className="text-red-500">*</span></label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="number" min="0" step="0.01" className="input pl-9 text-lg font-semibold"
                placeholder="0.00" required
                value={form.precio_mensual}
                onChange={e => setForm(f => ({ ...f, precio_mensual: e.target.value }))} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Sugerencia según {complex.canchas_activas} cancha{complex.canchas_activas !== 1 ? 's' : ''} activa{complex.canchas_activas !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha inicio</label>
              <input type="date" className="input text-sm" value={form.fecha_inicio}
                onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} />
            </div>
            <div>
              <label className="label">Próximo vencimiento</label>
              <input type="date" className="input text-sm" value={form.fecha_vencimiento}
                onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">Fecha último pago</label>
            <input type="date" className="input text-sm" value={form.fecha_pago}
              onChange={e => setForm(f => ({ ...f, fecha_pago: e.target.value }))} />
          </div>

          <div>
            <label className="label">Notas</label>
            <textarea className="input h-16 resize-none text-sm" placeholder="Observaciones de pago..."
              value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-outline flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Guardando...' : existing ? 'Actualizar' : 'Crear suscripción'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Fila de complejo ──────────────────────────────────────────────────────────
function ComplexRow({ complex, onEdit, onToggle, onDelete, toggling, deleting }) {
  const [confirm, setConfirm] = useState(false);
  const sub = complex.subscription;
  const isActivo = complex.activo && sub?.estado === 'activo';
  const hasSub = !!sub;

  const vence = sub?.fecha_vencimiento;
  const diasVencimiento = vence
    ? Math.ceil((new Date(vence) - new Date()) / (1000 * 60 * 60 * 24))
    : null;
  const venceProximo = diasVencimiento !== null && diasVencimiento <= 7 && diasVencimiento >= 0;
  const vencido      = diasVencimiento !== null && diasVencimiento < 0;

  return (
    <tr className={`border-b border-border transition-colors ${!isActivo ? 'bg-red-50/30' : 'hover:bg-muted/30'}`}>
      {/* Complejo */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0
            ${isActivo ? 'bg-primary/10 text-primary' : 'bg-red-100 text-red-500'}`}>
            {complex.nombre?.[0]}
          </div>
          <div>
            <div className="text-sm font-semibold">{complex.nombre}</div>
            <div className="text-xs text-muted-foreground">{complex.ciudad}{complex.provincia ? `, ${complex.provincia}` : ''}</div>
          </div>
        </div>
      </td>

      {/* Titular */}
      <td className="px-4 py-3">
        <div className="text-sm">{complex.owner?.nombre} {complex.owner?.apellido}</div>
        <div className="text-xs text-muted-foreground">{complex.owner?.email}</div>
      </td>

      {/* Canchas */}
      <td className="px-4 py-3 text-center">
        <div className="text-lg font-bold text-primary">{complex.canchas_activas}</div>
        {complex.total_canchas !== complex.canchas_activas && (
          <div className="text-xs text-muted-foreground">{complex.total_canchas} total</div>
        )}
      </td>

      {/* Precio */}
      <td className="px-4 py-3">
        {hasSub ? (
          <div>
            <div className="text-sm font-bold text-green-600">
              ${parseFloat(sub.precio_mensual).toLocaleString('es-AR')}/mes
            </div>
            {sub.notas && <div className="text-xs text-muted-foreground truncate max-w-24">{sub.notas}</div>}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">Sin suscripción</span>
        )}
      </td>

      {/* Vencimiento */}
      <td className="px-4 py-3">
        {vence ? (
          <div>
            <div className={`text-xs font-medium ${vencido ? 'text-red-600' : venceProximo ? 'text-amber-600' : 'text-muted-foreground'}`}>
              {new Date(vence + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
            {(vencido || venceProximo) && (
              <div className={`text-xs flex items-center gap-0.5 ${vencido ? 'text-red-500' : 'text-amber-500'}`}>
                <AlertCircle className="w-3 h-3" />
                {vencido ? `Vencido hace ${Math.abs(diasVencimiento)}d` : `Vence en ${diasVencimiento}d`}
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* Estado */}
      <td className="px-4 py-3">
        {hasSub ? (
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full
            ${sub.estado === 'activo' && complex.activo
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-600'}`}>
            {sub.estado === 'activo' && complex.activo
              ? <><CheckCircle className="w-3 h-3" /> Activo</>
              : <><XCircle className="w-3 h-3" /> Inactivo</>}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground bg-gray-100 px-2.5 py-1 rounded-full">Sin suscripción</span>
        )}
      </td>

      {/* Acciones */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {/* Editar/Crear suscripción */}
          <button onClick={() => onEdit(complex)}
            title={hasSub ? 'Editar suscripción' : 'Crear suscripción'}
            className={`p-1.5 rounded-lg transition-colors ${hasSub
              ? 'text-muted-foreground hover:text-primary hover:bg-primary/10'
              : 'text-primary bg-primary/10 hover:bg-primary/20'}`}>
            {hasSub ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>

          {/* Toggle activo/inactivo */}
          {hasSub && (
            <button onClick={() => onToggle(complex)} disabled={toggling}
              title={sub.estado === 'activo' ? 'Inhabilitar complejo' : 'Habilitar complejo'}
              className={`p-1.5 rounded-lg transition-colors ${sub.estado === 'activo'
                ? 'text-green-500 hover:text-red-500 hover:bg-red-50'
                : 'text-red-400 hover:text-green-600 hover:bg-green-50'}`}>
              {sub.estado === 'activo' ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
            </button>
          )}

          {/* Eliminar suscripción */}
          {hasSub && (
            confirm ? (
              <div className="flex items-center gap-1">
                <button onClick={() => onDelete(complex)} disabled={deleting}
                  className="text-xs bg-red-500 text-white px-2 py-1 rounded-lg hover:bg-red-600">
                  {deleting ? '...' : 'Sí'}
                </button>
                <button onClick={() => setConfirm(false)}
                  className="text-xs border border-border px-2 py-1 rounded-lg hover:bg-muted">
                  No
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirm(true)}
                title="Eliminar suscripción"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            )
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Dashboard principal ───────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [complexes, setComplexes] = useState([]);
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(null); // complex seleccionado para modal
  const [toggling,  setToggling]  = useState(null);
  const [deleting,  setDeleting]  = useState(null);
  const [toast,     setToast]     = useState(null);
  const [filtro,    setFiltro]    = useState('todos'); // todos | activos | inactivos | sin_sub

  const load = async () => {
    setLoading(true);
    try {
      const [comps, st] = await Promise.all([adminService.getComplexes(), adminService.getStats()]);
      setComplexes(comps);
      setStats(st);
    } catch {
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    const existing = complexes.find(c => c.id === data.complex_id)?.subscription;
    if (existing) {
      await adminService.updateSubscription(existing.id, data);
    } else {
      await adminService.createSubscription(data);
    }
    showToast('success', 'Suscripción guardada.');
    await load();
  };

  const handleToggle = async (complex) => {
    setToggling(complex.id);
    try {
      await adminService.toggleSubscription(complex.subscription.id);
      showToast('success', `Complejo ${complex.subscription?.estado === 'activo' ? 'inhabilitado' : 'habilitado'}.`);
      await load();
    } catch (err) {
      showToast('error', err.message || 'Error al cambiar estado.');
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async (complex) => {
    setDeleting(complex.id);
    try {
      await adminService.deleteSubscription(complex.subscription.id);
      showToast('success', 'Suscripción eliminada.');
      await load();
    } catch (err) {
      showToast('error', err.message || 'Error al eliminar.');
    } finally {
      setDeleting(null);
    }
  };

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const filtered = useMemo(() => complexes.filter(c => {
    if (filtro === 'activos')   return c.activo && c.subscription?.estado === 'activo';
    if (filtro === 'inactivos') return !c.activo || c.subscription?.estado === 'inactivo';
    if (filtro === 'sin_sub')   return !c.subscription;
    return true;
  }), [complexes, filtro]);

  const FILTROS = [
    { key: 'todos',     label: 'Todos',          count: complexes.length },
    { key: 'activos',   label: 'Activos',         count: complexes.filter(c => c.activo && c.subscription?.estado === 'activo').length },
    { key: 'inactivos', label: 'Inhabilitados',   count: complexes.filter(c => !c.activo || c.subscription?.estado === 'inactivo').length },
    { key: 'sin_sub',   label: 'Sin suscripción', count: complexes.filter(c => !c.subscription).length },
  ];

  return (
    <div className="min-h-screen bg-muted">
      {/* ── Header ── */}
      <header className="bg-white border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="font-bold text-primary text-lg">JugaHoy</div>
            <span className="text-border">·</span>
            <span className="text-sm font-semibold text-muted-foreground">Panel de administración</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/dashboard"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
              <LayoutDashboard className="w-4 h-4" /> Dashboard
            </Link>
            <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full font-medium">
              {user?.nombre} · Admin General
            </span>
            <button onClick={logout}
              className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Gestión de complejos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Control de suscripciones y habilitaciones de la plataforma</p>
        </div>

        {/* ── Stats ── */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total complejos',    value: stats.totalComplejos,        icon: Building2,    color: 'text-blue-600',   bg: 'bg-blue-50' },
              { label: 'Activos',            value: stats.suscripcionesActivas,  icon: CheckCircle,  color: 'text-green-600',  bg: 'bg-green-50' },
              { label: 'Inhabilitados',      value: stats.suscripcionesInactivas, icon: XCircle,     color: 'text-red-500',    bg: 'bg-red-50' },
              { label: 'Ingresos estimados', value: `$${stats.ingresosEstimados.toLocaleString('es-AR')}/mes`, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className={`card ${bg} border-0`} data-aos="zoom-in">
                <Icon className={`w-5 h-5 ${color} mb-2`} />
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Filtros ── */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {FILTROS.map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-all
                ${filtro === f.key ? 'bg-primary text-white border-primary' : 'bg-white border-border text-muted-foreground hover:border-primary hover:text-primary'}`}>
              {f.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold
                ${filtro === f.key ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Tabla ── */}
        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No hay complejos en esta categoría.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {['Complejo', 'Titular', 'Canchas', 'Precio/mes', 'Vencimiento', 'Estado', 'Acciones'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <ComplexRow
                      key={c.id}
                      complex={c}
                      onEdit={setModal}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                      toggling={toggling === c.id}
                      deleting={deleting === c.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal ── */}
      {modal && (
        <SubscriptionModal
          complex={modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3.5 rounded-xl shadow-lg text-sm font-medium text-white
          ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
