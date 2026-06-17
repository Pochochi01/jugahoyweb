import { useState } from 'react';

const PRESTACIONES = ['Estacionamiento', 'Vestuarios', 'Iluminación nocturna', 'Bar/Cantina', 'WiFi', 'Seguridad', 'Tribuna'];

export default function Step2Complex({ onNext, onBack, initial }) {
  const [form, setForm] = useState({ nombre: '', direccion: '', ciudad: '', provincia: '', telefono: '', email: '', descripcion: '', prestaciones: [], ...initial });

  const togglePrestacion = (p) => setForm(f => ({
    ...f, prestaciones: f.prestaciones.includes(p) ? f.prestaciones.filter(x => x !== p) : [...f.prestaciones, p],
  }));

  const handleSubmit = (e) => { e.preventDefault(); onNext(form); };

  return (
    <div className="card" data-aos="fade-up">
      <h2 className="text-xl font-bold mb-1">Paso 2: Datos del complejo</h2>
      <p className="text-muted-foreground text-sm mb-6">Información principal de tu complejo deportivo</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><label className="label">Nombre del complejo</label><input className="input" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
        <div><label className="label">Dirección</label><input className="input" required value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Ciudad</label><input className="input" required value={form.ciudad} onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))} /></div>
          <div><label className="label">Provincia</label><input className="input" required value={form.provincia} onChange={e => setForm(f => ({ ...f, provincia: e.target.value }))} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Teléfono</label><input className="input" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} /></div>
          <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
        </div>
        <div><label className="label">Descripción</label><textarea className="input h-20 resize-none" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
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
