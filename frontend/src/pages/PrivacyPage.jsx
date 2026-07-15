import { ShieldCheck, Mail, Phone } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';

// Sección con número + título + contenido
function Section({ n, title, children }) {
  return (
    <section className="scroll-mt-24">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-8 h-8 rounded-lg bg-primary/15 text-primary font-bold text-sm flex items-center justify-center shrink-0">
          {n}
        </span>
        <h2 className="text-lg sm:text-xl font-bold text-white">{title}</h2>
      </div>
      <div className="text-white/60 text-sm sm:text-[15px] leading-relaxed space-y-2 pl-11">
        {children}
      </div>
    </section>
  );
}

// Lista con viñetas
function Bullets({ children }) {
  return <ul className="space-y-2 list-none">{children}</ul>;
}
function Item({ children }) {
  return (
    <li className="flex gap-2.5">
      <span className="text-primary mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />
      <span>{children}</span>
    </li>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <div className="border-b" style={{ borderColor: '#1e2a3d', background: 'linear-gradient(180deg,#0a0e1a 0%,#060a12 100%)' }}>
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 text-center" data-aos="fade-up">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/15 mb-4">
              <ShieldCheck className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">Política de Privacidad</h1>
            <p className="text-primary font-semibold">Donde Juego</p>
            <p className="text-white/40 text-sm mt-3">Última actualización: 15 de julio de 2026</p>
          </div>
        </div>

        {/* Contenido */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <div className="card space-y-8" data-aos="fade-up">

            <p className="text-white/70 text-sm sm:text-[15px] leading-relaxed">
              En <strong className="text-white">Donde Juego</strong>, valoramos y respetamos la privacidad de nuestros
              usuarios y administradores de complejos deportivos. Esta política explica cómo recopilamos, utilizamos y
              protegemos la información personal en nuestra plataforma de gestión de turnos, cantina y estadísticas.
            </p>

            <Section n={1} title="Información que recopilamos">
              <Bullets>
                <Item><strong className="text-white/80">Datos de registro:</strong> nombre, correo electrónico, número de teléfono y contraseña.</Item>
                <Item><strong className="text-white/80">Datos de uso del sistema:</strong> reservas de turnos, consumos en cantina, estadísticas de uso de canchas.</Item>
                <Item><strong className="text-white/80">Información técnica:</strong> dirección IP, tipo de dispositivo, navegador y zona horaria (ajustada siempre al huso horario de Argentina).</Item>
              </Bullets>
            </Section>

            <Section n={2} title="Uso de la información">
              <p>La información recopilada se utiliza para:</p>
              <Bullets>
                <Item>Gestionar reservas de turnos y disponibilidad de canchas.</Item>
                <Item>Administrar consumos y pedidos en la cantina.</Item>
                <Item>Generar estadísticas y reportes para los complejos deportivos.</Item>
                <Item>Mejorar la experiencia del usuario en la plataforma.</Item>
                <Item>Garantizar la seguridad y prevenir usos indebidos del sistema.</Item>
              </Bullets>
            </Section>

            <Section n={3} title="Compartición de datos">
              <Bullets>
                <Item>No compartimos información personal con terceros, salvo que sea necesario para el funcionamiento del servicio (ej. pasarelas de pago).</Item>
                <Item>Los datos estadísticos pueden ser utilizados de manera agregada y anónima para mejorar el sistema.</Item>
              </Bullets>
            </Section>

            <Section n={4} title="Seguridad">
              <p>
                Implementamos medidas técnicas y organizativas para proteger la información contra accesos no
                autorizados, pérdida o alteración.
              </p>
            </Section>

            <Section n={5} title="Derechos de los usuarios">
              <p>Los usuarios pueden:</p>
              <Bullets>
                <Item>Acceder a sus datos personales.</Item>
                <Item>Solicitar la corrección de información incorrecta.</Item>
                <Item>Solicitar la eliminación de su cuenta y datos asociados.</Item>
              </Bullets>
            </Section>

            <Section n={6} title="Cambios en la política">
              <p>
                Nos reservamos el derecho de actualizar esta política de privacidad. Las modificaciones serán
                notificadas en la plataforma.
              </p>
            </Section>

            <Section n={7} title="Contacto">
              <p>Para consultas sobre esta política o el manejo de datos personales, podés contactarnos en:</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 pl-0 sm:pl-0">
                <a href="mailto:largomauroandres@hotmail.com"
                  className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/50 transition-colors group">
                  <span className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-primary" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs text-white/40">Correo de soporte</span>
                    <span className="block text-sm font-medium text-white group-hover:text-primary transition-colors truncate">
                      largomauroandres@hotmail.com
                    </span>
                  </span>
                </a>
                <a href="tel:3815900938"
                  className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/50 transition-colors group">
                  <span className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4 text-primary" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs text-white/40">Teléfono de contacto</span>
                    <span className="block text-sm font-medium text-white group-hover:text-primary transition-colors">
                      3815900938
                    </span>
                  </span>
                </a>
              </div>
            </Section>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
