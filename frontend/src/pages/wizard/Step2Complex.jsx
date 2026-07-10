import { useState, useEffect, useRef } from 'react';
import { publicService } from '../../services/publicService';
import SearchableSelect from '../../components/SearchableSelect';

const PRESTACIONES = ['Estacionamiento', 'Vestuarios', 'Iluminación nocturna', 'Bar/Cantina', 'WiFi', 'Seguridad', 'Tribuna'];

export default function Step2Complex({ onNext, onBack, initial }) {
  const [form, setForm] = useState({ nombre: '', direccion: '', ciudad: '', provincia: '', telefono: '', email: '', descripcion: '', prestaciones: [], ...initial });

  // Catálogo de ubicaciones
  const [provincias,   setProvincias]   = useState([]);
  const [localidades,  setLocalidades]  = useState([]);
  const [loadingProv,  setLoadingProv]  = useState(true);
  const [loadingLoc,   setLoadingLoc]   = useState(false);
  const [errors,       setErrors]       = useState({});
  const [loadError,    setLoadError]    = useState('');

  // Evita resetear la ciudad la primera vez (cuando se vuelve al paso con datos ya cargados)
  const firstLocLoad = useRef(true);

  // 1) Cargar provincias al montar
  useEffect(() => {
    let alive = true;
    setLoadingProv(true);
    publicService.getProvincias()
      .then(data => { if (alive) setProvincias(data || []); })
      .catch(() => { if (alive) setLoadError('No se pudieron cargar las provincias. Reintentá en unos segundos.'); })
      .finally(() => { if (alive) setLoadingProv(false); });
    return () => { alive = false; };
  }, []);

  // 2) Cargar localidades cada vez que cambia la provincia
  useEffect(() => {
    if (!form.provincia) { setLocalidades([]); return; }
    let alive = true;
    setLoadingLoc(true);
    publicService.getLocalidades(form.provincia)
      .then(data => { if (alive) setLocalidades(data || []); })
      .catch(() => { if (alive) { setLocalidades([]); setLoadError('No se pudieron cargar las localidades.'); } })
      .finally(() => { if (alive) setLoadingLoc(false); });
    return () => { alive = false; };
  }, [form.provincia]);

  // ── handlers de selección ──────────────────────────────────
  const handleProvincia = (provincia) => {
    // Al cambiar la provincia, se resetea la ciudad (coherencia Provincia–Localidad)
    setForm(f => ({ ...f, provincia, ciudad: '' }));
    setErrors(e => ({ ...e, provincia: '', ciudad: '' }));
    firstLocLoad.current = false;
  };

  const handleCiudad = (ciudad) => {
    setForm(f => ({ ...f, ciudad }));
    setErrors(e => ({ ...e, ciudad: '' }));
  };

  const togglePrestacion = (p) => setForm(f => ({
    ...f, prestaciones: f.prestaciones.includes(p) ? f.prestaciones.filter(x => x !== p) : [...f.prestaciones, p],
  }));

  // ── validación en submit ───────────────────────────────────
  const validate = () => {
    const e = {};
    if (!form.nombre.trim())    e.nombre    = 'El nombre es obligatorio.';
    if (!form.direccion.trim()) e.direccion = 'La dirección es obligatoria.';
    if (!form.provincia)        e.provincia = 'Seleccioná una provincia.';
    if (!form.ciudad)           e.ciudad    = 'Seleccioná una ciudad/localidad.';
    // Coherencia: la localidad elegida debe pertenecer a la provincia cargada
    if (form.ciudad && localidades.length > 0 && !localidades.includes(form.ciudad)) {
      e.ciudad = 'La localidad no corresponde a la provincia seleccionada.';
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = 'Email inválido.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onNext(form);
  };

  return (
    <div className="card" data-aos="fade-up">
      <h2 className="text-xl font-bold mb-1">Paso 2: Datos del complejo</h2>
      <p className="text-muted-foreground text-sm mb-6">Información principal de tu complejo deportivo</p>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {loadError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label className="label">Nombre del complejo</label>
          <input className="input" required value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          {errors.nombre && <p className="text-xs text-red-400 mt-1">{errors.nombre}</p>}
        </div>

        <div>
          <label className="label">Dirección</label>
          <input className="input" required value={form.direccion}
            onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
          {errors.direccion && <p className="text-xs text-red-400 mt-1">{errors.direccion}</p>}
        </div>

        {/* Ubicación: primero Provincia, luego Ciudad/Localidad (encadenados) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SearchableSelect
            label="Provincia"
            required
            value={form.provincia}
            onChange={handleProvincia}
            options={provincias}
            loading={loadingProv}
            placeholder="Seleccioná una provincia"
            searchPlaceholder="Buscar provincia…"
            emptyMessage="No hay provincias"
            error={errors.provincia}
          />

          <SearchableSelect
            label="Ciudad/Localidad"
            required
            value={form.ciudad}
            onChange={handleCiudad}
            options={localidades}
            loading={loadingLoc}
            disabled={!form.provincia}
            disabledHint="Seleccioná primero la provincia"
            placeholder="Seleccioná una ciudad/localidad"
            searchPlaceholder="Buscar ciudad/localidad…"
            emptyMessage="No hay localidades para esta provincia"
            error={errors.ciudad}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Teléfono</label>
            <input className="input" value={form.telefono}
              onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
          </div>
        </div>

        <div>
          <label className="label">Descripción</label>
          <textarea className="input h-20 resize-none" value={form.descripcion}
            onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
        </div>

        <div>
          <label className="label">Prestaciones</label>
          <div className="flex flex-wrap gap-2">
            {PRESTACIONES.map(p => (
              <button key={p} type="button" onClick={() => togglePrestacion(p)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${form.prestaciones.includes(p) ? 'bg-primary text-white border-primary' : 'border-border hover:border-primary'}`}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onBack} className="btn-outline flex-1">← Atrás</button>
          <button type="submit" className="btn-primary flex-1">Siguiente →</button>
        </div>
      </form>
    </div>
  );
}
