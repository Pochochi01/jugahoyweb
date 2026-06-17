import { Building2, MapPin, Layers, CheckCircle, Mail, KeyRound } from 'lucide-react';

export default function Step4Review({ data, onBack, onFinish, loading }) {
  const { org, complex, courts } = data;

  return (
    <div className="card" data-aos="fade-up">
      <h2 className="text-xl font-bold mb-1">Paso 4: Revisión</h2>
      <p className="text-muted-foreground text-sm mb-6">Revisá los datos antes de finalizar el registro</p>

      <div className="space-y-4">
        {/* Titular + credenciales */}
        <Section icon={CheckCircle} title="Titular y acceso al panel">
          <Row label="Nombre"   value={`${org.titular_nombre} ${org.titular_apellido}`} />
          <Row label="Teléfono" value={org.titular_telefono} />
          {org.titular_dni && <Row label="DNI/CUIT" value={org.titular_dni} />}

          {/* Credenciales destacadas */}
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-primary shrink-0" />
              <span className="text-muted-foreground w-28 shrink-0">Usuario:</span>
              <span className="font-semibold text-primary">{org.titular_email}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <KeyRound className="w-4 h-4 text-primary shrink-0" />
              <span className="text-muted-foreground w-28 shrink-0">Contraseña:</span>
              <span className="font-mono tracking-widest text-muted-foreground">{'•'.repeat(Math.min(org.password?.length || 8, 12))}</span>
            </div>
          </div>

          <div className="mt-3 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-xs text-primary">
            Vas a poder ingresar al panel con este email y contraseña desde la pantalla de Login.
          </div>
        </Section>

        {/* Complejo */}
        <Section icon={Building2} title="Complejo">
          <Row label="Nombre"    value={complex.nombre} />
          <Row label="Dirección" value={[complex.direccion, complex.ciudad, complex.provincia].filter(Boolean).join(', ')} />
          {complex.telefono    && <Row label="Teléfono" value={complex.telefono} />}
          {complex.email       && <Row label="Email"    value={complex.email} />}
          {complex.prestaciones?.length > 0 && <Row label="Prestaciones" value={complex.prestaciones.join(', ')} />}
          {complex.descripcion && <Row label="Descripción" value={complex.descripcion} />}
        </Section>

        {/* Canchas */}
        <Section icon={Layers} title={`Canchas (${courts.length})`}>
          {courts.map((c, i) => (
            <div key={i} className="text-sm py-1.5 border-b border-border last:border-0">
              <div className="font-medium">{c.nombre} <span className="capitalize text-muted-foreground">— {c.deporte}</span></div>
              <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                <span>{c.piso?.replace('_', ' ')}</span>
                {c.dimensiones && <span>{c.dimensiones}</span>}
                <span>{c.techada ? 'Techada' : 'Al aire libre'}</span>
                <span>⏱ {c.duracion_turno || c.duraciones_permitidas?.[0] || 60} min</span>
                {c.precio_base > 0 && <span>💲{c.precio_base}</span>}
              </div>
            </div>
          ))}
        </Section>
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={onBack} className="btn-outline flex-1">← Atrás</button>
        <button onClick={onFinish} disabled={loading} className="btn-primary flex-1 py-3">
          {loading
            ? <span className="flex items-center justify-center gap-2"><span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> Registrando...</span>
            : '✓ Finalizar y crear cuenta'}
        </button>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 font-semibold text-sm mb-3">
        <Icon className="w-4 h-4 text-primary" /> {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex text-sm">
      <span className="text-muted-foreground w-28 shrink-0">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
