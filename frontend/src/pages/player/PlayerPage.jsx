import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Star, Search, Building2, ArrowRight, MessageCircle, X } from 'lucide-react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import SearchableSelect from '../../components/SearchableSelect';
import PhoneVerification from '../../components/PhoneVerification';
import { publicService } from '../../services/publicService';
import { favoritesService } from '../../services/favoritesService';
import { useAuth } from '../../context/AuthContext';

import { SportTile, SportChip } from '../../components/SportIcon';

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

  // Verificación de teléfono por WhatsApp
  const [verifiedNow, setVerifiedNow] = useState(false);
  const [showVerify,  setShowVerify]  = useState(false);
  const needsVerify = user && user.telefono && user.phone_verified === false && !verifiedNow;

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
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-black text-foreground">
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

          {/* Banner de verificación de WhatsApp */}
          {needsVerify && (
            <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              {!showVerify ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <MessageCircle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Verificá tu WhatsApp</p>
                    <p className="text-xs text-muted-foreground">Confirmá tu número para reservar sin problemas.</p>
                  </div>
                  <button onClick={() => setShowVerify(true)}
                    className="btn-primary text-sm py-1.5 px-4 shrink-0">Verificar ahora</button>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-foreground">Verificá tu WhatsApp</span>
                    <button onClick={() => setShowVerify(false)} className="btn-icon !w-8 !min-h-[2rem]">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <PhoneVerification
                    telefono={user.telefono}
                    compact
                    onVerified={() => { setVerifiedNow(true); setShowVerify(false); }}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Acceso rápido: favoritos ─────────────────────── */}
          {favComplexes.length > 0 && (
            <section className="mb-8" aria-label="Complejos favoritos">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-warning fill-warning" aria-hidden="true" />
                <h2 className="text-sm font-bold">Tus favoritos</h2>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {favComplexes.map(c => (
                  <Link key={c.id} to={`/canchas/${c.id}`}
                    className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card
                               hover:border-primary/50 transition-colors max-w-[70vw] sm:max-w-xs">
                    <SportTile deporte={sportsList(c.fields)[0]} size="sm" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground truncate">{c.nombre}</span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {c.ciudad}{c.provincia ? `, ${c.provincia}` : ''}
                      </span>
                    </span>
                    <button
                      onClick={(e) => toggleFav(e, c)}
                      aria-label={`Quitar ${c.nombre} de favoritos`}
                      className="ml-1 shrink-0 grid place-items-center w-8 h-8 rounded-md text-warning hover:bg-muted"
                    >
                      <Star className="w-4 h-4 fill-warning" />
                    </button>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── Filtros: dropdowns dependientes ──────────────── */}
          <div className="card mb-8">
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
            <div className="text-center py-20 text-muted-foreground">
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
                    className="card p-5 group relative flex flex-col hover:border-foreground/20 transition-[border-color,transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-pop">

                    {/* Botón favorito */}
                    <button onClick={e => toggleFav(e, c)}
                      disabled={favBusy}
                      aria-label={isFav ? `Quitar ${c.nombre} de favoritos` : `Agregar ${c.nombre} a favoritos`}
                      aria-pressed={isFav}
                      className="absolute top-3.5 right-3.5 z-10 grid place-items-center w-9 h-9 rounded-lg hover:bg-muted transition-colors duration-160 disabled:opacity-60">
                      <Star className={`w-[18px] h-[18px] transition-colors duration-160 ${isFav ? 'fill-warning text-warning' : 'text-muted-foreground group-hover:text-warning'}`} />
                    </button>

                    <div className="flex items-start gap-3 pr-10">
                      <SportTile deporte={sports[0]} />
                      <div className="min-w-0">
                        <h3 className="font-bold text-foreground leading-snug">{c.nombre}</h3>
                        <div className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">{c.ciudad}{c.provincia ? `, ${c.provincia}` : ''}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-1.5 flex-wrap mt-4 mb-4">
                      {sports.map(s => <SportChip key={s} deporte={s} />)}
                    </div>

                    <div className="mt-auto flex items-center justify-between pt-3 border-t border-border">
                      <span className="text-xs text-muted-foreground tabular">
                        {canChas} cancha{canChas !== 1 ? 's' : ''}
                      </span>
                      <span className="text-sm font-semibold text-primary flex items-center gap-1">
                        Ver turnos <ArrowRight className="w-4 h-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" aria-hidden="true" />
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
