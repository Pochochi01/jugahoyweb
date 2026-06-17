import { useState, useEffect } from 'react';
import { collaboratorsService } from '../../services/collaboratorsService';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, X,
  Power, PowerOff, Users, Check, Lock,
} from 'lucide-react';

const PERMISOS_DEF = {
  agenda: false, caja: false, operaciones: false,
  configuracion: false, colaboradores: false, estadisticas: false,
};
const PERMISOS_LABELS = {
  agenda: 'Agenda', caja: 'Caja', operaciones: 'Operaciones',
  configuracion: 'Configuración', colaboradores: 'Colaboradores', estadisticas: 'Estadísticas',
};

const FORM_INICIAL = {
  nombre: '', apellido: '', email: '', telefono: '',
  password: '', permisos: { ...PERMISOS_DEF },
};

// ── formulario crear/editar ───────────────────────────────────────────────────
function CollaboratorForm({ initial, onSave, onCancel, saving, isEdit = false }) {
  const [form, setForm] = useState(initial || FORM_INICIAL);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setPerm = (k, v) => setForm(f => ({ ...f, permisos: { ...f.permisos, [k]: v } }));
  const setAllPerms = (val) => setForm(f => ({
    ...f, permisos: Object.fromEntries(Object.keys(PERMISOS_DEF).map(k => [k, val])),
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.apellido.trim()) return setError('Nombre y apellido son obligatorios.');
    if (!form.email.trim()) return setError('El email es obligatorio.');
    if (!isEdit && !form.password) return setError('La contraseña es obligatoria para nuevos colaboradores.');
    setError('');
    await onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label text-xs">Nombre <span className="text-red-500">*</span></label>
          <input className="input text-sm" required value={form.nombre}
            onChange={e => set('nombre', e.target.value)} />
        </div>
        <div>
          <label className="label text-xs">Apellido <span className="text-red-500">*</span></label>
          <input className="input text-sm" required value={form.apellido}
            onChange={e => set('apellido', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label text-xs">Email <span className="text-red-500">*</span></label>
          <input type="email" className="input text-sm" required disabled={isEdit}
            value={form.email} onChange={e => set('email', e.target.value)} />
          {isEdit && <p className="text-xs text-muted-foreground mt-0.5">El email no se puede modificar</p>}
        </div>
        <div>
          <label className="label text-xs">Teléfono</label>
          <input className="input text-sm" placeholder="+54 11 ..."
            value={form.telefono || ''} onChange={e => set('telefono', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="label text-xs flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" />
          {isEdit ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
          {!isEdit && <span className="text-red-500">*</span>}
        </label>
        <div className="relative">
          <input
            type={showPass ? 'text' : 'password'}
            className="input text-sm pr-10"
            placeholder={isEdit ? '••••••••' : 'Mínimo 6 caracteres'}
            required={!isEdit}
            minLength={6}
            value={form.password || ''}
            onChange={e => set('password', e.target.value)}
          />
          <button type="button" onClick={() => setShowPass(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label text-xs mb-0">Permisos</label>
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={() => setAllPerms(true)}
              className="text-primary hover:underline">Todos</button>
            <span className="text-border">·</span>
            <button type="button" onClick={() => setAllPerms(false)}
              className="text-muted-foreground hover:underline">Ninguno</button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(PERMISOS_LABELS).map(([key, label]) => (
            <label key={key}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm
                ${form.permisos[key] ? 'bg-primary/5 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${form.permisos[key] ? 'bg-primary border-primary' : 'border-gray-300'}`}>
                {form.permisos[key] && <Check className="w-3 h-3 text-white" />}
              </span>
              <input type="checkbox" className="hidden" checked={form.permisos[key]}
                onChange={e => setPerm(key, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-outline flex-1 text-sm py-2">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1 text-sm py-2">
          {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear colaborador'}
        </button>
      </div>
    </form>
  );
}

// ── panel de detalle ─────────────────────────────────────────────────────────
function CollaboratorDetail({ col, onClose }) {
  const permisosActivos = Object.entries(col.permisos || {}).filter(([, v]) => v).map(([k]) => k);

  return (
    <div className="mt-2 bg-gray-50 border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Detalle del colaborador</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        <Row label="Nombre"   value={`${col.nombre} ${col.apellido}`} />
        <Row label="Email"    value={col.user?.email || '—'} />
        {col.user?.telefono && <Row label="Teléfono" value={col.user.telefono} />}
        <Row label="Estado"   value={col.activo ? '🟢 Habilitado' : '🔴 Inhabilitado'} />
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Permisos</p>
        {permisosActivos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin permisos asignados.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {permisosActivos.map(k => (
              <span key={k} className="badge-blue text-xs">{PERMISOS_LABELS[k]}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-20 shrink-0">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

// ── fila de colaborador ──────────────────────────────────────────────────────
function CollaboratorRow({ col, complexId, onUpdated, onDeleted }) {
  const [mode,    setMode]    = useState(null); // null | 'view' | 'edit'
  const [saving,  setSaving]  = useState(false);
  const [confirm, setConfirm] = useState(false);

  const initials = `${col.nombre?.[0] || ''}${col.apellido?.[0] || ''}`.toUpperCase();

  const handleSave = async (data) => {
    setSaving(true);
    try {
      const updated = await collaboratorsService.update(complexId, col.id, data);
      onUpdated(updated);
      setMode(null);
    } catch (err) {
      alert(err.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    setSaving(true);
    try {
      const updated = await collaboratorsService.toggle(complexId, col.id);
      onUpdated(updated);
    } catch (err) {
      alert(err.message || 'Error al cambiar estado.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await collaboratorsService.remove(complexId, col.id);
      onDeleted(col.id);
    } catch (err) {
      alert(err.message || 'Error al eliminar.');
      setSaving(false);
      setConfirm(false);
    }
  };

  const permisosActivos = Object.entries(col.permisos || {}).filter(([, v]) => v).map(([k]) => k);

  return (
    <div className={`border-b border-border last:border-0 ${!col.activo ? 'opacity-60' : ''}`}>
      {/* fila principal */}
      <div className="flex items-center gap-3 py-3">
        {/* avatar */}
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0
          ${col.activo ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'}`}>
          {initials || '?'}
        </div>

        {/* info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{col.nombre} {col.apellido}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${col.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
              {col.activo ? 'Habilitado' : 'Inhabilitado'}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{col.user?.email}</div>
          {permisosActivos.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {permisosActivos.map(k => (
                <span key={k} className="badge-blue text-xs">{PERMISOS_LABELS[k]}</span>
              ))}
            </div>
          )}
        </div>

        {/* acciones */}
        {confirm ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-red-600">¿Eliminar definitivamente?</span>
            <button onClick={handleDelete} disabled={saving}
              className="text-xs bg-red-500 text-white px-2 py-1 rounded-lg hover:bg-red-600">
              {saving ? '...' : 'Sí, eliminar'}
            </button>
            <button onClick={() => setConfirm(false)}
              className="text-xs border border-border px-2 py-1 rounded-lg hover:bg-muted">
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex gap-1 shrink-0">
            {/* Ver */}
            <button onClick={() => setMode(m => m === 'view' ? null : 'view')}
              title={mode === 'view' ? 'Cerrar detalle' : 'Ver detalle'}
              className={`p-1.5 rounded-lg transition-colors ${mode === 'view' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}>
              {mode === 'view' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>

            {/* Editar */}
            <button onClick={() => setMode(m => m === 'edit' ? null : 'edit')}
              title="Editar colaborador"
              className={`p-1.5 rounded-lg transition-colors ${mode === 'edit' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}>
              <Pencil className="w-4 h-4" />
            </button>

            {/* Toggle estado */}
            <button onClick={handleToggle} disabled={saving}
              title={col.activo ? 'Inhabilitar' : 'Habilitar'}
              className={`p-1.5 rounded-lg transition-colors ${col.activo
                ? 'text-green-500 hover:text-red-500 hover:bg-red-50'
                : 'text-red-400 hover:text-green-600 hover:bg-green-50'}`}>
              {col.activo ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
            </button>

            {/* Eliminar */}
            <button onClick={() => setConfirm(true)}
              title="Eliminar colaborador"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* panel Ver */}
      {mode === 'view' && <CollaboratorDetail col={col} onClose={() => setMode(null)} />}

      {/* panel Editar */}
      {mode === 'edit' && (
        <div className="border border-primary/30 rounded-xl bg-primary/5 p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-primary">Editando: {col.nombre} {col.apellido}</span>
            <button onClick={() => setMode(null)} className="p-1 hover:bg-muted rounded text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <CollaboratorForm
            initial={{
              nombre:    col.nombre    || '',
              apellido:  col.apellido  || '',
              email:     col.user?.email || '',
              telefono:  col.user?.telefono || '',
              password:  '',
              permisos:  col.permisos  || { ...PERMISOS_DEF },
            }}
            onSave={handleSave}
            onCancel={() => setMode(null)}
            saving={saving}
            isEdit
          />
        </div>
      )}
    </div>
  );
}

// ── tab principal ─────────────────────────────────────────────────────────────
export default function CollaboratorsTab({ complexId }) {
  const [list,      setList]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  const load = () => {
    setLoading(true);
    collaboratorsService.getAll(complexId)
      .then(setList)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [complexId]);

  const handleCreate = async (data) => {
    setSaving(true);
    setError('');
    try {
      const created = await collaboratorsService.create(complexId, data);
      setList(l => [created, ...l.filter(x => x.id !== created.id)]);
      setShowForm(false);
    } catch (err) {
      setError(err.message || 'Error al crear el colaborador.');
    } finally {
      setSaving(false);
    }
  };

  const activos   = list.filter(c => c.activo).length;
  const inactivos = list.filter(c => !c.activo).length;

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
    </div>
  );

  return (
    <div>
      {/* cabecera */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Colaboradores</h2>
          {list.length > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {activos} habilitado{activos !== 1 ? 's' : ''}
              {inactivos > 0 && ` · ${inactivos} inhabilitado${inactivos !== 1 ? 's' : ''}`}
            </p>
          )}
        </div>
        <button onClick={() => { setShowForm(s => !s); setError(''); }}
          className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
          <Plus className="w-4 h-4" /> Agregar colaborador
        </button>
      </div>

      {/* formulario nuevo */}
      {showForm && (
        <div className="card mb-5 border-primary/30 bg-primary/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm text-primary">Nuevo colaborador</h3>
            <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-muted text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm mb-4">{error}</div>
          )}
          <CollaboratorForm
            onSave={handleCreate}
            onCancel={() => { setShowForm(false); setError(''); }}
            saving={saving}
          />
        </div>
      )}

      {/* lista */}
      {list.length === 0 ? (
        <div className="card text-center py-14 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium mb-1">Sin colaboradores registrados</p>
          <p className="text-sm">Agregá el primero para gestionar el acceso al complejo.</p>
        </div>
      ) : (
        <div className="card divide-y-0 p-0 overflow-hidden">
          <div className="divide-y divide-border px-4">
            {list.map(col => (
              <CollaboratorRow
                key={col.id}
                col={col}
                complexId={complexId}
                onUpdated={updated => setList(l => l.map(x => x.id === updated.id ? updated : x))}
                onDeleted={id => setList(l => l.filter(x => x.id !== id))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
