import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Star, Search, Building2, Dumbbell, ArrowRight } from 'lucide-react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { publicService } from '../../services/publicService';
import { useAuth } from '../../context/AuthContext';

const DEPORTE_ICON = { futbol: '⚽', padel: '🏓', tenis: '🎾', basquet: '🏀', voley: '🏐', otro: '🏃' };

function getFavorites() {
  try { return JSON.parse(localStorage.getItem('favorites') || '[]'); } catch { return []; }
}
function toggleFavorite(id) {
  const favs = getFavorites();
  const next = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id];
  localStorage.setItem('favorites', JSON.stringify(next));
  return next;
}

export default function PlayerPage() {
  const { user } = useAuth();
  const [complexes, setComplexes] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [favorites, setFavorites] = useState(getFavorites());
  const [showFavs,  setShowFavs]  = useState(false);

  useEffect(() => {
    publicService.getComplexes().then(setComplexes).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleFav = (e, id) => {
    e.preventDefault(); e.stopPropagation();
    setFavorites(toggleFavorite(id));
  };

  const filtered = complexes.filter(c => {
    const q = search.toLowerCase();
    return (!q || `${c.nombre} ${c.ciudad} ${c.provincia}`.toLowerCase().includes(q))
        && (!showFavs || favorites.includes(c.id));
  });

  const sportsList = (fields) => [...new Set((fields || []).map(f => f.deporte))].slice(0, 4);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 py-10 sm:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* saludo */}
          <div className="mb-8" data-aos="fade-up">
            <h1 className="text-2xl sm:text-3xl font-black text-white">
              Hola{user ? `, ${user.nombre}` : ''} 👋
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              Encontrá tu cancha y reservá en segundos.
            </p>
          </div>

          {/* Buscador */}
          <div className="flex flex-col sm:flex-row gap-3 mb-8" data-aos="fade-up" data-aos-delay="50">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input className="input pl-9" placeholder="Buscar por nombre, ciudad o barrio..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button
              onClick={() => setShowFavs(s => !s)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border text-sm font-medium transition-all duration-200"
              style={{
                background:   showFavs ? '#f59e0b' : 'transparent',
                borderColor:  showFavs ? '#f59e0b' : '#1e2a3d',
                color:        showFavs ? '#fff'    : '#94a3b8',
              }}
            >
              <Star className={`w-4 h-4 ${showFavs ? 'fill-white' : ''}`} />
              Favoritos {favorites.length > 0 && `(${favorites.length})`}
            </button>
          </div>

          {/* Grid de complejos */}
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>{showFavs ? 'No tenés complejos favoritos aún.' : 'No se encontraron complejos.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {filtered.map((c, i) => {
                const isFav   = favorites.includes(c.id);
                const sports  = sportsList(c.fields);
                const canChas = (c.fields || []).length;
                return (
                  <Link key={c.id} to={`/canchas/${c.id}`}
                    data-aos="fade-up" data-aos-delay={Math.min(i * 60, 240)}
                    className="card hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 group relative overflow-hidden">

                    {/* Botón favorito */}
                    <button onClick={e => handleFav(e, c.id)}
                      className="absolute top-4 right-4 z-10 p-1.5 rounded-full transition-colors"
                      style={{ background: 'rgba(6,10,18,0.6)' }}>
                      <Star className={`w-4 h-4 ${isFav ? 'fill-yellow-400 text-yellow-400' : 'text-white/30 group-hover:text-yellow-400'} transition-colors`} />
                    </button>

                    {/* Banner de color */}
                    <div className="h-20 -mx-6 -mt-6 mb-5 rounded-t-xl flex items-center justify-center text-3xl"
                      style={{ background: 'linear-gradient(135deg, #0d1a2d 0%, #1a2d4d 100%)' }}>
                      <span>{sports.length > 0 ? DEPORTE_ICON[sports[0]] : '🏟️'}</span>
                    </div>

                    <h3 className="font-bold text-foreground group-hover:text-primary transition-colors mb-1 pr-6">
                      {c.nombre}
                    </h3>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{c.ciudad}{c.provincia ? `, ${c.provincia}` : ''}</span>
                    </div>

                    {/* Sports tags */}
                    <div className="flex gap-1.5 flex-wrap mb-4">
                      {sports.map(s => (
                        <span key={s} className="text-xs px-2.5 py-0.5 rounded-full capitalize"
                          style={{ background: '#141b2d', color: '#94a3b8', border: '1px solid #1e2a3d' }}>
                          {DEPORTE_ICON[s]} {s}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid #1e2a3d' }}>
                      <span className="text-xs text-muted-foreground">
                        <Dumbbell className="w-3.5 h-3.5 inline mr-1" />
                        {canChas} cancha{canChas !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs font-semibold text-primary flex items-center gap-1">
                        Ver turnos <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
