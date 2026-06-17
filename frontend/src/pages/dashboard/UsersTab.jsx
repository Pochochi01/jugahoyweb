import { useState, useEffect } from 'react';
import { usersService } from '../../services/usersService';
import { Plus, Pencil, UserX, UserCheck, X, Shield } from 'lucide-react';

const ROLES = [
  { value: 'player',        label: 'Jugador',           color: 'badge-blue' },
  { value: 'collaborator',  label: 'Colaborador',       color: 'badge-yellow' },
  { value: 'complex_admin', label: 'Admin de Complejo', color: 'badge-green' },
  { value: 'general_admin', label: 'Admin General',     color: 'bg-purple-100 text-purple-700 text-xs font-medium px-2.5 py-0.5 rounded-full' },
];

const getRoleBadge = (rol) => ROLES.find(r => r.value === rol) || ROLES[0];

function UserFormModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState({
    nombre: '', apellido: '', email: '', password: '',
    telefono: '', rol: 'player', activo: true,
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const isEdit = !!initial?.id;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isEdit && !form.password) return setError('La contraseña es obligatoria.');
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message || 'Error al guardar el usuario.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold">{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Nombre</label>
              <input className="input" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
            <div><label className="label">Apellido</label>
              <input className="input" required value={form.apellido} onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))} /></div>
          </div>
          <div><label className="label">Email</label>
            <input type="email" className="input" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div><label className="label">{isEdit ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}</label>
            <input type="password" className="input" required={!isEdit} value={form.password || ''}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Teléfono</label>
              <input className="input" value={form.telefono || ''} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} /></div>
            <div><label className="label">Rol</label>
              <select className="input" value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          {isEdit && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-primary" checked={form.activo}
                onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
              <span className="text-sm">Usuario activo</span>
            </label>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-outline flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersTab() {
  const [users,  setUsers]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,  setModal]  = useState(null); // null | { initial }
  const [filter, setFilter] = useState('');
  const [rolFilter, setRolFilter] = useState('');

  const load = () => {
    setLoading(true);
    usersService.getAll().then(setUsers).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    if (form.id) {
      await usersService.update(form.id, form);
    } else {
      await usersService.create(form);
    }
    setModal(null);
    load();
  };

  const toggleActive = async (user) => {
    await usersService.update(user.id, { activo: !user.activo });
    load();
  };

  const filtered = users.filter(u => {
    const q = filter.toLowerCase();
    const matchText = !q || `${u.nombre} ${u.apellido} ${u.email}`.toLowerCase().includes(q);
    const matchRol  = !rolFilter || u.rol === rolFilter;
    return matchText && matchRol;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Usuarios</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{users.length} usuarios registrados</p>
        </div>
        <button onClick={() => setModal({ initial: null })} className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
          <Plus className="w-4 h-4" /> Nuevo usuario
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <input className="input flex-1" placeholder="Buscar por nombre o email..."
          value={filter} onChange={e => setFilter(e.target.value)} />
        <select className="input w-48" value={rolFilter} onChange={e => setRolFilter(e.target.value)}>
          <option value="">Todos los roles</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(u => {
            const rolInfo = getRoleBadge(u.rol);
            return (
              <div key={u.id} className={`card py-3 flex items-center gap-4 ${!u.activo ? 'opacity-50' : ''}`}>
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                  {u.nombre?.[0]}{u.apellido?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{u.nombre} {u.apellido}</div>
                  <div className="text-xs text-muted-foreground">{u.email}{u.telefono && ` · ${u.telefono}`}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={rolInfo.color}>{rolInfo.label}</span>
                  <span className={u.activo ? 'badge-green' : 'badge-red'}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                  <button onClick={() => setModal({ initial: u })}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleActive(u)}
                    title={u.activo ? 'Desactivar' : 'Activar'}
                    className={`p-1.5 rounded-lg transition-colors ${u.activo
                      ? 'text-muted-foreground hover:text-red-500 hover:bg-red-50'
                      : 'text-muted-foreground hover:text-green-600 hover:bg-green-50'}`}>
                    {u.activo ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="card text-center py-10 text-muted-foreground">
              <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
              No se encontraron usuarios.
            </div>
          )}
        </div>
      )}

      {modal && (
        <UserFormModal
          initial={modal.initial}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
