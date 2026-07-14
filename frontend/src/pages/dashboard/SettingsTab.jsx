import { useState, useEffect } from 'react';
import { settingsService } from '../../services/settingsService';
import {
  Save, Plus, X, Wind, Home, Pencil, Trash2, Check,
  Eye, EyeOff, Power, PowerOff, Clock, ChevronDown, ChevronUp,
  CreditCard, ShieldCheck, ExternalLink,
} from 'lucide-react';

// Detecta el ambiente del token de MercadoPago por su prefijo
function mpEnv(t) {
  if (!t) return null;
  if (t.startsWith('TEST-'))    return { label: 'Modo prueba (sandbox)', cls: 'bg-amber-100 text-amber-700' };
  if (t.startsWith('APP_USR-')) return { label: 'Producción',           cls: 'bg-green-100 text-green-700' };
  return { label: 'Token no reconocido', cls: 'bg-red-100 text-red-600' };
}

// ── Tarjeta de configuración de MercadoPago (por complejo) ────────────────────
function MercadoPagoCard({ complexId, initialToken }) {
  const [token,  setToken]  = useState(initialToken || '');
  const [show,   setShow]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [ok,     setOk]     = useState(false);
  const [err,    setErr]    = useState('');

  const trimmed = token.trim();
  const env = mpEnv(trimmed);

  const save = async () => {
    setSaving(true); setErr('');
    try {
      await settingsService.update(complexId, { mercadopago_token: trimmed || null });
      setOk(true); setTimeout(() => setOk(false), 2500);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Error al guardar el token.');
    } finally { setSaving(false); }
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">Cobros con MercadoPago</h3>
        {initialToken
          ? <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">Configurado</span>
          : <span className="text-xs bg-gray-100 text-gray-500 font-medium px-2 py-0.5 rounded-full">Sin configurar</span>}
      </div>

      <p className="text-sm text-muted-foreground">
        Pegá el <strong>Access Token</strong> de la cuenta de MercadoPago de este complejo. Los pagos de
        seña y turnos de tus jugadores entran directo a <strong>tu cuenta</strong>.
      </p>

      <div>
        <label className="label">Access Token</label>
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            className="input pr-24 font-mono text-sm"
            placeholder="APP_USR-... o TEST-..."
            value={token}
            onChange={e => setToken(e.target.value)}
            autoComplete="off"
          />
          <button type="button" onClick={() => setShow(s => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {show ? 'Ocultar' : 'Ver'}
          </button>
        </div>
        {env && (
          <span className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${env.cls}`}>
            {env.label}
          </span>
        )}
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded-lg p-3">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span>
          El token es secreto: no lo compartas. Se guarda en el servidor y nunca se expone a los jugadores.
          {' '}
          <a href="https://www.mercadopago.com.ar/developers/panel/app" target="_blank" rel="noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-0.5">
            Obtener mi token <ExternalLink className="w-3 h-3" />
          </a>
        </span>
      </div>

      {err && <p className="text-sm text-red-500">{err}</p>}

      <button onClick={save} disabled={saving}
        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-colors ${ok ? 'bg-green-600 text-white' : 'btn-primary'}`}>
        <Save className="w-4 h-4" />
        {saving ? 'Guardando...' : ok ? '¡Guardado!' : 'Guardar token'}
      </button>
    </div>
  );
}

const DEPORTES = [
  { value: 'futbol', label: 'Fútbol',  emoji: '⚽' },
  { value: 'tenis',  label: 'Tenis',   emoji: '🎾' },
  { value: 'padel',  label: 'Pádel',   emoji: '🏓' },
];
const DURACIONES = [
  { value: 30,  label: '30 min',     short: '½ h' },
  { value: 60,  label: '1 hora',     short: '1 h' },
  { value: 90,  label: '1 h 30 min', short: '1½ h' },
  { value: 120, label: '2 horas',    short: '2 h' },
];

const CANCHA_INICIAL = {
  nombre: '', deporte: 'futbol', dimensiones: '', techada: false,
  duraciones_permitidas: [60], precios_por_duracion: { 60: '' },
  precio_base: '', hora_apertura: '08:00', hora_cierre: '02:00',
  sena_monto: '',   // monto fijo de seña para pagar online (MercadoPago)
};

// ── formulario crear/editar ───────────────────────────────────────────────────
function FieldForm({ initial = CANCHA_INICIAL, onSave, onCancel, saving, isEdit = false }) {
  const [form, setForm] = useState({ ...CANCHA_INICIAL, ...initial });
  const [error, setError] = useState('');

  const toggleDur = (val) => setForm(f => {
    const active = f.duraciones_permitidas.includes(val)
      ? f.duraciones_permitidas.filter(d => d !== val)
      : [...f.duraciones_permitidas, val].sort((a, b) => a - b);
    const precios = { ...f.precios_por_duracion };
    if (!active.includes(val)) delete precios[val];
    else precios[val] = precios[val] || '';
    return { ...f, duraciones_permitidas: active, precios_por_duracion: precios };
  });

  const setPrice = (dur, val) => setForm(f => ({
    ...f, precios_por_duracion: { ...f.precios_por_duracion, [dur]: val },
  }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return setError('El nombre es obligatorio.');
    if (form.duraciones_permitidas.length === 0) return setError('Seleccioná al menos una duración.');
    if (!form.hora_apertura || !form.hora_cierre) return setError('Indicá horario de apertura y cierre.');
    setError('');
    const duracion_turno = Math.min(...form.duraciones_permitidas);
    const precios = {};
    form.duraciones_permitidas.forEach(d => {
      const v = parseFloat(form.precios_por_duracion?.[d]);
      if (!isNaN(v) && v > 0) precios[d] = v;
    });
    // Seña: null si está vacía; validar que no supere el precio base
    const sena = form.sena_monto === '' || form.sena_monto == null ? null : parseFloat(form.sena_monto);
    if (sena != null && (isNaN(sena) || sena < 0)) return setError('La seña debe ser un monto válido.');
    const base = parseFloat(form.precio_base) || 0;
    if (sena != null && base > 0 && sena > base) return setError('La seña no puede superar el precio base.');

    onSave({
      ...form, duracion_turno,
      precio_base: base,
      precios_por_duracion: precios,
      sena_monto: sena,
    });
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${isEdit ? '' : 'mt-4 border border-primary/30 rounded-xl bg-primary/5 p-5'}`}>
      {!isEdit && (
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm text-primary">Nueva cancha</h4>
          <button type="button" onClick={onCancel} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Nombre */}
      <div>
        <label className="label">Nombre <span className="text-red-500">*</span></label>
        <input className="input" placeholder="Ej: Cancha 1, Pádel Central..." required
          value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
      </div>

      {/* Deporte */}
      <div>
        <label className="label">Deporte <span className="text-red-500">*</span></label>
        <div className="flex gap-2">
          {DEPORTES.map(d => (
            <button key={d.value} type="button" onClick={() => setForm(f => ({ ...f, deporte: d.value }))}
              className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-1.5
                ${form.deporte === d.value ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:border-primary hover:text-primary'}`}>
              {d.emoji} {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Medidas + precio */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Medidas</label>
          <input className="input" placeholder="Ej: 20 x 40 m" value={form.dimensiones}
            onChange={e => setForm(f => ({ ...f, dimensiones: e.target.value }))} />
        </div>
        <div>
          <label className="label">Precio base ($)</label>
          <input type="number" min="0" step="0.01" className="input" placeholder="0"
            value={form.precio_base} onChange={e => setForm(f => ({ ...f, precio_base: e.target.value }))} />
        </div>
      </div>

      {/* Seña para reservar online (MercadoPago) */}
      <div>
        <label className="label">Seña para reservar online ($)</label>
        <input type="number" min="0" step="0.01" className="input" placeholder="Vacío = no se ofrece pagar seña"
          value={form.sena_monto ?? ''} onChange={e => setForm(f => ({ ...f, sena_monto: e.target.value }))} />
        <p className="text-xs text-muted-foreground mt-1">
          Monto fijo que el jugador paga con MercadoPago para asegurar el turno. Dejalo vacío para no ofrecer seña en esta cancha.
        </p>
      </div>

      {/* Horario */}
      <div>
        <label className="label flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-primary" /> Horario de actividad <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Apertura</label>
            <input type="time" className="input text-sm" value={form.hora_apertura}
              onChange={e => setForm(f => ({ ...f, hora_apertura: e.target.value }))} />
          </div>
          <span className="text-muted-foreground mt-5">→</span>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Cierre</label>
            <input type="time" className="input text-sm" value={form.hora_cierre}
              onChange={e => setForm(f => ({ ...f, hora_cierre: e.target.value }))} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Si el cierre es antes de las 08:00, se considera del día siguiente (ej: 02:00 = 2am)
        </p>
      </div>

      {/* Cobertura */}
      <div>
        <label className="label">Cobertura</label>
        <div className="flex gap-2">
          {[
            { val: false, label: 'Al aire libre', icon: Wind },
            { val: true,  label: 'Techada',       icon: Home },
          ].map(({ val, label, icon: Icon }) => (
            <button key={String(val)} type="button" onClick={() => setForm(f => ({ ...f, techada: val }))}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors
                ${form.techada === val ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:border-primary hover:text-primary'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Duraciones con precio */}
      <div>
        <label className="label">Duraciones y precios <span className="text-red-500">*</span></label>
        <div className="space-y-2">
          {DURACIONES.map(d => {
            const sel = form.duraciones_permitidas.includes(d.value);
            return (
              <div key={d.value} className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${sel ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <button type="button" onClick={() => toggleDur(d.value)}
                  className={`flex items-center gap-2 flex-1 text-sm font-medium text-left transition-colors ${sel ? 'text-primary' : 'text-muted-foreground'}`}>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${sel ? 'bg-primary border-primary' : 'border-gray-300'}`}>
                    {sel && <Check className="w-3 h-3 text-white" />}
                  </span>
                  {d.label}
                </button>
                {sel && (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-muted-foreground">$</span>
                    <input type="number" min="0" step="1" placeholder="Precio"
                      className="w-24 text-sm border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                      value={form.precios_por_duracion?.[d.value] || ''}
                      onChange={e => setPrice(d.value, e.target.value)}
                      onClick={e => e.stopPropagation()} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="btn-outline flex-1 py-2 text-sm">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1 py-2 text-sm">
          {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cancha'}
        </button>
      </div>
    </form>
  );
}

// ── panel de detalle (solo lectura) ──────────────────────────────────────────
function FieldDetail({ field, onClose }) {
  const deporte = DEPORTES.find(d => d.value === field.deporte) || { label: field.deporte, emoji: '🏟️' };
  const precios = field.precios_por_duracion || {};

  return (
    <div className="mt-2 bg-gray-50 border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Configuración de la cancha</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Row label="Nombre"    value={field.nombre} />
        <Row label="Deporte"   value={`${deporte.emoji} ${deporte.label}`} />
        <Row label="Cobertura" value={field.techada ? '🏠 Techada' : '🌤 Al aire libre'} />
        {field.dimensiones && <Row label="Medidas" value={field.dimensiones} />}
        <Row label="Horario"
          value={`${field.hora_apertura || '08:00'} → ${field.hora_cierre || '02:00'}`} />
        <Row label="Estado" value={field.activa ? '🟢 Habilitada' : '🔴 Inhabilitada'} />
        <Row label="Seña online"
          value={field.sena_monto > 0 ? `$${parseFloat(field.sena_monto).toLocaleString('es-AR')}` : '— (no ofrece seña)'} />
      </div>

      {Object.keys(precios).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Precios por duración</p>
          <div className="flex flex-wrap gap-2">
            {DURACIONES.filter(d => precios[d.value]).map(d => (
              <span key={d.value} className="bg-white border border-border rounded-lg px-3 py-1 text-sm">
                <span className="font-medium">{d.label}</span>
                <span className="text-primary font-bold ml-2">${parseFloat(precios[d.value]).toLocaleString('es-AR')}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-24 shrink-0">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

// ── fila de cancha con acciones ──────────────────────────────────────────────
function FieldRow({ field, complexId, onUpdated, onDeleted }) {
  const [mode,    setMode]    = useState(null); // null | 'view' | 'edit'
  const [saving,  setSaving]  = useState(false);
  const [confirm, setConfirm] = useState(false);

  const deporte = DEPORTES.find(d => d.value === field.deporte);

  const handleSave = async (data) => {
    setSaving(true);
    try {
      const updated = await settingsService.updateField(complexId, field.id, data);
      onUpdated(updated);
      setMode(null);
    } catch (err) {
      alert(err.message || 'Error al actualizar la cancha.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    setSaving(true);
    try {
      const updated = await settingsService.toggleField(complexId, field.id);
      onUpdated(updated);
    } catch {
      alert('Error al cambiar el estado.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await settingsService.deleteField(complexId, field.id);
      onDeleted(field.id);
    } catch (err) {
      alert(err.message || 'Error al eliminar la cancha.');
    } finally {
      setSaving(false);
      setConfirm(false);
    }
  };

  const durLabel = (field.duraciones_permitidas?.length
    ? field.duraciones_permitidas
    : [field.duracion_turno || 60]
  ).map(d => DURACIONES.find(x => x.value === d)?.short || `${d}m`).join(' · ');

  return (
    <div className={`border-b border-border last:border-0 ${!field.activa ? 'opacity-60' : ''}`}>
      {/* fila principal */}
      <div className="flex items-center gap-3 py-3">
        {/* icono deporte */}
        <span className="text-xl shrink-0">{deporte?.emoji || '🏟️'}</span>

        {/* info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{field.nombre}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${field.activa ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
              {field.activa ? 'Habilitada' : 'Inhabilitada'}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0 mt-0.5 text-xs text-muted-foreground">
            <span className="capitalize">{deporte?.label || field.deporte}</span>
            {field.dimensiones && <span>· {field.dimensiones}</span>}
            <span>· {field.techada ? '🏠 Techada' : '🌤 Aire libre'}</span>
            <span className="flex items-center gap-0.5">
              · <Clock className="w-3 h-3 inline mx-0.5" />
              {field.hora_apertura || '08:00'} – {field.hora_cierre || '02:00'}
            </span>
            <span>· ⏱ {durLabel}</span>
          </div>
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
              title="Editar cancha"
              className={`p-1.5 rounded-lg transition-colors ${mode === 'edit' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}>
              <Pencil className="w-4 h-4" />
            </button>

            {/* Toggle estado */}
            <button onClick={handleToggle} disabled={saving}
              title={field.activa ? 'Inhabilitar cancha' : 'Habilitar cancha'}
              className={`p-1.5 rounded-lg transition-colors ${field.activa
                ? 'text-green-500 hover:text-red-500 hover:bg-red-50'
                : 'text-red-400 hover:text-green-600 hover:bg-green-50'}`}>
              {field.activa ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
            </button>

            {/* Eliminar */}
            <button onClick={() => setConfirm(true)}
              title="Eliminar cancha"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* panel expandible */}
      {mode === 'view' && (
        <FieldDetail field={field} onClose={() => setMode(null)} />
      )}
      {mode === 'edit' && (
        <div className="border border-primary/30 rounded-xl bg-primary/5 p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-primary">Editando: {field.nombre}</span>
            <button onClick={() => setMode(null)} className="p-1 hover:bg-muted rounded text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <FieldForm
            initial={{
              nombre:                field.nombre,
              deporte:               field.deporte,
              dimensiones:           field.dimensiones || '',
              techada:               field.techada,
              precio_base:           field.precio_base || '',
              hora_apertura:         field.hora_apertura || '08:00',
              hora_cierre:           field.hora_cierre   || '02:00',
              duraciones_permitidas: field.duraciones_permitidas?.length ? field.duraciones_permitidas : [field.duracion_turno || 60],
              precios_por_duracion:  field.precios_por_duracion || {},
              sena_monto:            field.sena_monto ?? '',
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
export default function SettingsTab({ complexId, onUpdate }) {
  const [form,          setForm]          = useState(null);
  const [fields,        setFields]        = useState([]);
  const [saving,        setSaving]        = useState(false);
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [savingField,   setSavingField]   = useState(false);
  const [saveOk,        setSaveOk]        = useState(false);

  useEffect(() => {
    settingsService.get(complexId).then(data => {
      setForm(data);
      setFields(data.fields || []);
    }).catch(() => {});
  }, [complexId]);

  const saveComplex = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Enviar solo los campos generales (no pisar mercadopago_token, que se guarda
      // desde su propia tarjeta con estado independiente).
      const payload = {
        nombre:      form.nombre,
        telefono:    form.telefono,
        email:       form.email,
        ciudad:      form.ciudad,
        direccion:   form.direccion,
        descripcion: form.descripcion,
      };
      const updated = await settingsService.update(complexId, payload);
      onUpdate?.(updated);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateField = async (data) => {
    setSavingField(true);
    try {
      const created = await settingsService.createField(complexId, data);
      setFields(fs => [...fs, created]);
      setShowFieldForm(false);
    } catch (err) {
      alert(err.message || 'Error al crear la cancha.');
    } finally {
      setSavingField(false);
    }
  };

  if (!form) return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
    </div>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Configuración del Complejo</h2>

      {/* datos generales */}
      <form onSubmit={saveComplex} className="card space-y-4">
        <h3 className="font-semibold">Datos generales</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Nombre</label>
            <input className="input" value={form.nombre || ''} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input className="input" value={form.telefono || ''} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">Ciudad</label>
            <input className="input" value={form.ciudad || ''} onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="label">Dirección</label>
          <input className="input" value={form.direccion || ''} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
        </div>
        <div>
          <label className="label">Descripción</label>
          <textarea className="input h-20 resize-none" value={form.descripcion || ''}
            onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
        </div>
        <button type="submit" disabled={saving}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-colors ${saveOk ? 'bg-green-600 text-white' : 'btn-primary'}`}>
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : saveOk ? '¡Guardado!' : 'Guardar cambios'}
        </button>
      </form>

      {/* MercadoPago */}
      <MercadoPagoCard complexId={complexId} initialToken={form.mercadopago_token} />

      {/* canchas */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-semibold">Canchas</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fields.length} cancha{fields.length !== 1 ? 's' : ''} ·{' '}
              {fields.filter(f => f.activa).length} habilitada{fields.filter(f => f.activa).length !== 1 ? 's' : ''}
            </p>
          </div>
          {!showFieldForm && (
            <button onClick={() => setShowFieldForm(true)}
              className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
          )}
        </div>

        <div>
          {fields.length === 0 && !showFieldForm && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay canchas registradas. Agregá la primera.
            </p>
          )}
          {fields.map(f => (
            <FieldRow
              key={f.id}
              field={f}
              complexId={complexId}
              onUpdated={updated => setFields(fs => fs.map(x => x.id === updated.id ? updated : x))}
              onDeleted={id => setFields(fs => fs.filter(x => x.id !== id))}
            />
          ))}
        </div>

        {showFieldForm && (
          <FieldForm
            onSave={handleCreateField}
            onCancel={() => setShowFieldForm(false)}
            saving={savingField}
          />
        )}
      </div>
    </div>
  );
}
