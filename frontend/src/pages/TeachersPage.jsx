import Header from '../components/Header';
import Footer from '../components/Footer';

export default function TeachersPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 bg-muted">
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          <h1 className="text-3xl font-bold mb-4">Profesores y entrenadores</h1>
          <p className="text-muted-foreground">Directorio de profesores y entrenadores disponibles. Próximamente.</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
