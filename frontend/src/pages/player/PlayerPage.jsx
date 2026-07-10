import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Star, Search, Building2, Dumbbell, ArrowRight } from 'lucide-react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import SearchableSelect from '../../components/SearchableSelect';
import { publicService } from '../../services/publicService';
import { favoritesService } from '../../services/favoritesService';
import { useAuth } from '../../context/AuthContext';

const DEPORTE_ICON = { futbol: '⚽', padel: '🏓', tenis: '🎾', basquet: '🏀', voley: '🏐', otro: '🏃' };

const sportsList = (fields) => [...new Set((fields || []).map(f => f.deporte))].slice(0, 4);

export default function PlayerPage() {
  const { user } = useAuth();

  // Catálogo de ubicaciones (dropdowns dependientes)
  const [provincias,  setProvincias]  = useState([]);
  const [localidades, setLocalidades] = useState([]);
  const [provincia,   setProvincia]   = useState('');
  const [ciudad,      setCiudad]      = useState('');
  const [loadingProv, setLoadingProv] = useState(true);
  const [loadingLoc,  setLoadingLoc]  = useState(false);

  // Resultados
  const [complexes, setComplexes] = useState([]);
  const [loading,   setLoading]   = useState(false); // no se carga hasta filtrar
  const [search,    setSearch]    = useState('');

  // Favoritos (persistidos en BD)
  const [favComplexes, setFavComplexes] = useState([]);
  const [favBusy,      setFavBusy]      = useState(false);
  const favIds = useMemo(() => new Set(favComplexes.map(c => c.id)), [favComplexes]);

  const [error, setError] = useState('');

  // ── Carga inicial: provincias, favoritos y complejos ───────
  useEffect(() => {
    let alive = true;
    setLoadingProv(true);
    publicService.getProvincias()
      .then(d => alive && setProvincias(d || []))
      .catch(() => alive && setError('No se pudieron cargar las provincias.'))
      .finally(() => alive && setLoadingProv(false));

    favoritesService.getAll()
      .then(d => alive && setFavComplexes(d || []))
      .catch(() => {/* silencioso: favoritos no es crítico */});

    return () => { alive = false; };
  }, []);

  // ── Cargar localidades al cambiar provincia ────────────────
  useEffect(() => {
    if (!provincia) { setLocalidades([]); return; }
    let alive = true;
    setLoadingLoc(true);
    publicService.getLocalidades(provincia)
      .then(d => alive && setLocalidades(d || []))
      .catch(() => alive && setLocalidades([]))
      .finally(() => alive && setLoadingLoc(false));
    return () => { alive = false; };
  }, [provincia]);

  // ── Cargar complejos según filtros (backend) ───────────────
  // Regla: solo se muestran complejos tras completar el orden
  // provincia → localidad. Sin ambos filtros no se consulta ni se muestra nada.
  const loadComplexes = useCallback(() => {
    if (!provincia || !ciudad) { setComplexes([]); setLoading(false); return; }
    setLoading(true);
    publicService.getComplexes({ provincia, ciudad })
      .then(setComplexes)
      .catch(() => setComplexes([]))
      .finally(() => setLoading(false));
  }, [provincia, ciudad]);

  useEffect(() => { loadComplexes(); }, [loadComplexes]);

  // ── Handlers de dropdowns ──────────────────────────────────
  const handleProvincia = (p) => { setProvincia(p); setCiudad(''); }; // reset ciudad (coherencia)
  const handleCiudad     = (c) => setCiudad(c);

  // ── Favoritos: alta/baja optimista con rollback ────────────
  const toggleFav = async (e, complex) => {
    e.preventDefault(); e.stopPropagation();
    if (favBusy) return;
    setFavBusy(true);

    const isFav = favIds.has(complex.id);
    // Actualización optimista
    setFavComplexes(prev => isFav ? prev.filter(c => c.id !== complex.id) : [complex, ...prev]);
    try {
      if (isFav) await favoritesService.remove(complex.id);
      else       await favoritesService.add(complex.id);
    } catch {
      // Rollback si falla
      setFavComplexes(prev => isFav ? [complex, ...prev] : prev.filter(c => c.id !== complex.id));
      setError('No se pudo actualizar el favorito. Reintentá.');
    } finally {
      setFavBusy(false);
    }
  };

  // Filtro por nombre sobre los resultados ya traídos del backend
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return complexes;
    return complexes.filter(c => `${c.nombre} ${c.ciudad} ${c.provincia}`.toLowerCase().includes(q));
  }, [complexes, search]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 py-10 sm:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* saludo */}
          <div className="mb-6" data-aos="fade-up">
            <h1 className="text-2xl sm:text-3xl font-black text-white">
              Hola{user ? `, ${user.nombre}` : ''} 👋
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              Encontrá tu cancha y reservá en segundos.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
              {error}
            </div>
          )}

          {/* ── Acceso rápido: favoritos ─────────────────────── */}
          {favComplexes.length > 0 && (
            <section className="mb-8" data-aos="fade-up" aria-label="Complejos favoritos">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                <h2 className="text-sm font-semibold text-white">Tus favoritos</h2>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {favComplexes.map(c => (
                  <Link key={c.id} to={`/canchas/${c.id}`}
                    className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card
                               hover:border-primary/50 transition-colors max-w-[70vw] sm:max-w-xs">
                    <span className="text-lg shrink-0">
                      {sportsList(c.fields)[0] ? DEPORTE_ICON[sportsList(c.fields)[0]] : '🏟️'}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground truncate">{c.nombre}</span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {c.ciudad}{c.provincia ? `, ${c.provincia}` : ''}
                      </span>
                    </span>
                    <button
                      onClick={(e) => toggleFav(e, c)}
                      aria-label={`Quitar ${c.nombre} de favoritos`}
                      className="ml-1 shrink-0 text-yellow-400 hover:text-yellow-300"
                    >
                      <Star className="w-4 h-4 fill-yellow-400" />
                    </button>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── Filtros: dropdowns dependientes ──────────────── */}
          <div className="card mb-8" data-aos="fade-up" data-aos-delay="50">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <SearchableSelect
                label="Provincia"
                value={provincia}
                onChange={handleProvincia}
                options={provincias}
                loading={loadingProv}
                placeholder="Todas las provincias"
                searchPlaceholder="Buscar provincia…"
                emptyMessage="No hay provincias"
              />
              <SearchableSelect
                label="Ciudad/Localidad"
                value={ciudad}
                onChange={handleCiudad}
                options={localidades}
                loading={loadingLoc}
                disabled={!provincia}
                disabledHint="Seleccioná primero la provincia"
                placeholder="Todas las localidades"
                searchPlaceholder="Buscar ciudad/localidad…"
                emptyMessage="No hay localidades"
              />
              <div>
                <label className="label">Nombre</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input className="input pl-9" placeholder="Buscar por nombre…"
                    value={search} onChange={e => setSearch(e.target.value)} />
                </div>
              </div>
            </div>
            {(provincia || ciudad || search) && (
              <button
                onClick={() => { setProvincia(''); setCiudad(''); setSearch(''); }}
                className="mt-3 text-xs text-primary hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          {/* ── Resultados ───────────────────────────────────── */}
          {/* Solo se muestran complejos tras completar el orden provincia → localidad */}
          {(!provincia || !ciudad) ? (
            <div className="text-center py-20 text-muted-foreground" data-aos="fade-up">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium text-foreground mb-1">Buscá tu complejo</p>
              <p className="text-sm">
                {!provincia
                  ? 'Seleccioná una provincia y luego la ciudad/localidad para ver los complejos disponibles.'
                  : 'Ahora elegí la ciudad/localidad para ver los complejos.'}
              </p>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No hay complejos en {ciudad}, {provincia}.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {filtered.map((c, i) => {
                const isFav   = favIds.has(c.id);
                const sports  = sportsList(c.fields);
                const canChas = (c.fields || []).length;
                return (
                  <Link key={c.id} to={`/canchas/${c.id}`}
                    data-aos="fade-up" data-aos-delay={Math.min(i * 60, 240)}
                    className="card hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 group relative overflow-hidden">

                    {/* Botón favorito */}
                    <button onClick={e => toggleFav(e, c)}
                      disabled={favBusy}
                      aria-label={isFav ? `Quitar ${c.nombre} de favoritos` : `Agregar ${c.nombre} a favoritos`}
                      aria-pressed={isFav}
                      className="absolute top-4 right-4 z-10 p-1.5 rounded-full transition-colors disabled:opacity-60"
                      style={{ background: 'rgba(6,10,18,0.6)' }}>
                      <Star className={`w-4 h-4 ${isFav ? 'fill-yellow-400 text-yellow-400' : 'text-white/30 group-hover:text-yellow-400'} transition-colors`} />
                    </button>

                    {/* Banner */}
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
