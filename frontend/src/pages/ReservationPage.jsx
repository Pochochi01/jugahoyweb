import Header from '../components/Header';
import Footer from '../components/Footer';
import { Search, MapPin } from 'lucide-react';

export default function ReservationPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 bg-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-10" data-aos="fade-up">
            <h1 className="text-3xl font-bold mb-2">Reservar cancha</h1>
            <p className="text-muted-foreground">Encontrá el complejo más cercano y reservá tu turno</p>
          </div>
          <div className="card max-w-2xl mx-auto" data-aos="fade-up" data-aos-delay="100">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input className="input pl-9" placeholder="Ciudad o barrio..." />
              </div>
              <button className="btn-primary flex items-center gap-2">
                <Search className="w-4 h-4" /> Buscar
              </button>
            </div>
            <p className="text-center text-muted-foreground mt-8 text-sm">
              Módulo de búsqueda de complejos próximamente. Mientras tanto, contactá directamente al complejo.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
