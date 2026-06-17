import { useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { Mail, Phone, MapPin, ArrowRight } from 'lucide-react';
import { contactService } from '../services/contactService';

export default function ContactPage() {
  const [form,    setForm]    = useState({ nombre: '', email: '', mensaje: '' });
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await contactService.send(form);
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Error al enviar el mensaje');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 py-14 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="text-center mb-12" data-aos="fade-up">
            <p className="text-xs font-bold tracking-[0.2em] text-primary uppercase mb-3">Estamos para ayudarte</p>
            <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">Contacto</h1>
          </div>

          <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
            {/* Formulario */}
            <div className="card" data-aos="fade-right">
              <h2 className="text-lg font-bold text-white mb-6">Envianos un mensaje</h2>

              {error && (
                <div className="mb-4 px-4 py-3 rounded-lg text-sm text-red-400 border"
                  style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
                  {error}
                </div>
              )}

              {sent ? (
                <div className="text-center py-10">
                  <div className="text-4xl mb-3">✅</div>
                  <p className="text-primary font-semibold">¡Mensaje enviado!</p>
                  <p className="text-muted-foreground text-sm mt-1">Te respondemos a la brevedad.</p>
                  <button onClick={() => { setSent(false); setForm({ nombre: '', email: '', mensaje: '' }); }}
                    className="mt-4 text-xs text-primary hover:underline">
                    Enviar otro mensaje
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="label">Nombre</label>
                    <input className="input" required value={form.nombre}
                      onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input type="email" className="input" required value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Mensaje</label>
                    <textarea className="input h-28 resize-none" required value={form.mensaje}
                      onChange={e => setForm(f => ({ ...f, mensaje: e.target.value }))} />
                  </div>
                  <button type="submit" disabled={loading}
                    className="btn-primary w-full flex items-center justify-center gap-2 glow-green">
                    {loading ? 'Enviando...' : <><span>Enviar mensaje</span><ArrowRight className="w-4 h-4" /></>}
                  </button>
                </form>
              )}
            </div>

            {/* Datos de contacto */}
            <div className="space-y-4" data-aos="fade-left">
              {[
                { icon: Mail,   label: 'Email',     value: 'hola@jugahoy.com.ar' },
                { icon: Phone,  label: 'Teléfono',  value: '+54 11 0000-0000' },
                { icon: MapPin, label: 'Ubicación', value: 'Buenos Aires, Argentina' },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="card flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                    <div className="font-semibold text-foreground text-sm">{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
