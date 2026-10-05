import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import NotificationBell from '../../components/NotificationBell';
import { complexService } from '../../services/complexService';
import {
  Calendar, List, DollarSign, Settings, Users,
  Image, BarChart2, LogOut, Building2, ShieldCheck,
  Lock, LayoutDashboard, Link2, Menu, X, ShoppingCart, Trophy, GraduationCap, Store, Goal,
} from 'lucide-react';
import ComplexSwitcher from '../../components/ComplexSwitcher';
import BrandLogo from '../../components/BrandLogo';
import ThemeToggle from '../../components/ThemeToggle';
import { esAlmacen, nombreComercio, modulosComplejo } from '../../utils/modoComplejo';
import EscuelaTab from './EscuelaTab';
import AgendaTab        from './AgendaTab';
import OperationsTab    from './OperationsTab';
import CashTab          from './CashTab';
import SettingsTab      from './SettingsTab';
import CollaboratorsTab from './CollaboratorsTab';
import ImagesTab        from './ImagesTab';
import StatsTab         from './StatsTab';
import UsersTab         from './UsersTab';
import InvitesTab       from './InvitesTab';
import CantinaTab       from './CantinaTab';
import TorneosTab       from './TorneosTab';
import ProfesoresTab    from './ProfesoresTab';

// permiso: clave usada en Collaborator.permisos
// deportivo: módulo que requiere canchas → oculto en complejos sin canchas (modo Almacén)
const TABS = [
  { key: 'agenda',        label: 'Agenda',        icon: Calendar,    permiso: 'agenda',       deportivo: true },
  { key: 'invitaciones',  label: 'Invitaciones',  icon: Link2,       permiso: 'agenda',       deportivo: true },
  { key: 'operaciones',   label: 'Operaciones',   icon: List,        permiso: 'operaciones',  deportivo: true },
  // En modo Almacén la caja se usa desde adentro del módulo Almacén (subpestaña)
  { key: 'caja',          label: 'Caja',          icon: DollarSign,  permiso: 'caja',         deportivo: true },
  // "Cantina" con canchas / "Almacén" sin canchas (ver utils/modoComplejo)
  { key: 'cantina',       label: 'Cantina',       icon: ShoppingCart, permisos: ['cantina_gestion', 'cantina_ventas'] },
  // modulo: visible solo si las canchas lo habilitan (utils/modoComplejo → modulosComplejo)
  //   torneos → solo con canchas de pádel · profesores / escuela → alguna cancha habilitada
  { key: 'torneos',       label: 'Torneos Pádel', icon: Trophy,      permiso: 'torneos',    modulo: 'torneos' },
  { key: 'profesores',    label: 'Profesores',    icon: GraduationCap, permiso: 'profesores', modulo: 'profesores' },
  { key: 'escuela',       label: 'Escuelas',      icon: Goal,        permiso: 'escuela',    modulo: 'escuela' },
  { key: 'estadisticas',  label: 'Estadísticas',  icon: BarChart2,   permiso: 'estadisticas', deportivo: true },
  { key: 'configuracion', label: 'Configuración', icon: Settings,    permiso: 'configuracion' },
  { key: 'colaboradores', label: 'Colaboradores', icon: Users,       permiso: 'colaboradores' },
  { key: 'imagenes',      label: 'Imágenes',      icon: Image,       permiso: null, adminOnly: true },
  { key: 'usuarios',      label: 'Usuarios',      icon: ShieldCheck, permiso: null, adminOnly: true },
];

export default function Dashboard() {
  const { user, logout, isGeneralAdmin, isCollaborator, getCollaboratorPermisos } = useAuth();
  const navigate = useNavigate();
  const [complexes,       setComplexes]      = useState([]);
  const [selectedComplex, setSelectedComplex] = useState(null);
  const [activeTab,       setActiveTab]      = useState(null);
  const [loadingComplexes, setLoadingComplexes] = useState(true);
  const [mobileMenuOpen,  setMobileMenuOpen]  = useState(false); // hamburguesa móvil
  // Vuelta del OAuth de MercadoPago: /dashboard?mp=conectado|error&complex=&mp_email=&mp_msg=
  const [resultadoMp, setResultadoMp] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    if (!q.get('mp')) return null;
    return {
      complexId: Number(q.get('complex')) || null,
      tipo: q.get('mp') === 'conectado' ? 'ok' : 'error',
      msg: q.get('mp') === 'conectado'
        ? `¡Listo! MercadoPago quedó conectado${q.get('mp_email') ? ` con la cuenta ${q.get('mp_email')}` : ''}.`
        : (q.get('mp_msg') || 'No se pudo conectar MercadoPago.'),
    };
  });

  // Cargar complejos según el rol
  useEffect(() => {
    setLoadingComplexes(true);
    complexService.getAll()
      .then(data => {
        setComplexes(data);
        // Si volvemos de conectar MercadoPago, abrir ese complejo en Configuración
        const elegido = (resultadoMp?.complexId && data.find(c => c.id === resultadoMp.complexId)) || data[0];
        if (elegido) setSelectedComplex(elegido);
        if (resultadoMp) {
          setActiveTab('configuracion');
          window.history.replaceState(null, '', window.location.pathname);   // limpiar ?mp=… de la URL
        }
      })
      .catch(() => {})
      .finally(() => setLoadingComplexes(false));
  }, []);

  // Tabs que APLICAN al complejo seleccionado según sus canchas:
  //  - sin canchas (modo Almacén): fuera los módulos deportivos; "Cantina" → "Almacén"
  //  - sin canchas de pádel: fuera torneos y profesores
  const almacen = esAlmacen(selectedComplex);
  const tabsDelComplejo = useMemo(() => {
    const modulos = modulosComplejo(selectedComplex);
    return TABS
      .filter(tab => !(almacen && tab.deportivo) && !(tab.modulo && !modulos[tab.modulo]))
      .map(tab => (tab.key === 'cantina' && almacen ? { ...tab, label: nombreComercio(selectedComplex), icon: Store } : tab));
  }, [almacen, selectedComplex?.fields]);

  // Tabs visibles según rol y permisos del complejo seleccionado (memoizado)
  const visibleTabs = useMemo(() => {
    return tabsDelComplejo.filter(tab => {
      if (tab.adminOnly) return isGeneralAdmin;
      if (user?.rol === 'general_admin' || user?.rol === 'complex_admin') return true;
      if (isCollaborator && selectedComplex) {
        const permisos = getCollaboratorPermisos(selectedComplex.id);
        // tab.permisos (array) → visible si tiene AL MENOS UNO; tab.permiso (único).
        if (tab.permisos) return tab.permisos.some(p => permisos?.[p] === true);
        return permisos?.[tab.permiso] === true;
      }
      return false;
    });
  }, [tabsDelComplejo, user?.rol, isGeneralAdmin, isCollaborator, selectedComplex?.id, getCollaboratorPermisos]);

  // Cuando cambian los tabs disponibles, activar el primero si el actual ya no está
  useEffect(() => {
    if (visibleTabs.length === 0) {
      setActiveTab(null);
      return;
    }
    if (!visibleTabs.find(t => t.key === activeTab)) {
      setActiveTab(visibleTabs[0].key);
    }
  }, [visibleTabs]);

  // Actualiza el complejo seleccionado (y su copia en la lista del selector).
  // Cargar la primera cancha / borrar la última cambia el modo y el menú al instante.
  const actualizarComplejo = (patch) => {
    setSelectedComplex(prev => (prev ? { ...prev, ...patch } : prev));
    setComplexes(list => list.map(c => (c.id === selectedComplex?.id ? { ...c, ...patch } : c)));
  };

  const renderTab = () => {
    // Tabs sin complejo
    if (activeTab === 'usuarios')     return <UsersTab />;
    if (activeTab === 'imagenes')     return <ImagesTab />;
    if (activeTab === 'invitaciones') return <InvitesTab complexId={selectedComplex?.id} />;

    if (!selectedComplex) {
      if (loadingComplexes) return (
        <div className="space-y-4" aria-busy="true" aria-label="Cargando complejos">
          <div className="skeleton h-9 w-56" />
          <div className="grid gap-3 sm:grid-cols-3"><div className="skeleton h-24" /><div className="skeleton h-24" /><div className="skeleton h-24" /></div>
          <div className="skeleton h-72" />
        </div>
      );
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="grid place-items-center w-14 h-14 rounded-2xl bg-muted mb-4"><Building2 className="w-7 h-7 text-muted-foreground" aria-hidden="true" /></span>
          <h3 className="text-lg font-bold mb-1.5">Todavía no hay complejos</h3>
          <p className="text-muted-foreground text-sm mb-4">
            {isCollaborator
              ? 'No tenés complejos asignados o tu acceso fue inhabilitado.'
              : 'Registrá tu complejo para empezar a recibir reservas.'}
          </p>
          {!isCollaborator && (
            <a href="/adherir-complejo" className="btn-primary">Registrar complejo</a>
          )}
        </div>
      );
    }

    if (!activeTab || visibleTabs.length === 0) return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <span className="grid place-items-center w-14 h-14 rounded-2xl bg-muted mb-4"><Lock className="w-7 h-7 text-muted-foreground" aria-hidden="true" /></span>
        <h3 className="text-lg font-bold mb-1.5">Sin permisos en este complejo</h3>
        <p className="text-muted-foreground text-sm">
          Pedile al administrador que te habilite las secciones que necesitás.
        </p>
      </div>
    );

    // Al cambiar de complejo, durante un render el tab activo puede no aplicar al
    // nuevo (ej. "agenda" en un complejo sin canchas) hasta que el efecto lo
    // corrija: no montarlo, para no disparar pedidos a módulos bloqueados.
    if (!visibleTabs.some(t => t.key === activeTab)) return null;

    const props = { complexId: selectedComplex.id, complex: selectedComplex };
    switch (activeTab) {
      case 'agenda':        return <AgendaTab {...props} />;
      case 'operaciones':   return <OperationsTab {...props} />;
      case 'caja':          return <CashTab {...props} />;
      case 'cantina':       return <CantinaTab {...props} />;
      case 'torneos':       return <TorneosTab {...props} />;
      case 'profesores':    return <ProfesoresTab {...props} />;
      case 'escuela':       return <EscuelaTab {...props} />;
      case 'estadisticas':  return <StatsTab {...props} />;
      case 'configuracion': return (
        <SettingsTab {...props} resultadoMp={resultadoMp && (!resultadoMp.complexId || resultadoMp.complexId === selectedComplex.id) ? resultadoMp : null}
          onUpdate={c => actualizarComplejo({ ...c, fields: c.fields ?? selectedComplex.fields })}
          onFieldsChange={fields => actualizarComplejo({ fields })} />
      );
      case 'colaboradores': return <CollaboratorsTab {...props} />;
      default:              return null;
    }
  };

  // Rol: etiqueta + estilo semántico
  const ROL = {
    general_admin: { label: 'Admin general', cls: 'badge-blue' },
    complex_admin: { label: 'Administrador', cls: 'badge-green' },
  };
  const rol = ROL[user?.rol] || { label: 'Colaborador', cls: 'badge-yellow' };
  const iniciales = `${user?.nombre?.[0] || ''}${user?.apellido?.[0] || ''}`.toUpperCase() || '·';

  // Navegación agrupada por intención (el orden de TABS se respeta dentro de cada grupo)
  const GRUPOS = [
    { titulo: 'Operación',   keys: ['agenda', 'invitaciones', 'operaciones', 'caja', 'cantina'] },
    { titulo: 'Actividades', keys: ['torneos', 'profesores', 'escuela'] },
    { titulo: 'Gestión',     keys: ['estadisticas', 'configuracion', 'colaboradores'] },
    { titulo: 'Plataforma',  keys: ['imagenes', 'usuarios'] },
  ];
  const bloqueadas = isCollaborator && selectedComplex
    ? tabsDelComplejo.filter(t => !t.adminOnly && !visibleTabs.find(vt => vt.key === t.key))
    : [];
  const tabActual = visibleTabs.find(t => t.key === activeTab);

  const elegirTab = (key) => { setActiveTab(key); setMobileMenuOpen(false); };

  // Drawer móvil: Escape cierra y el fondo no se desplaza
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMobileMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [mobileMenuOpen]);

  const navItem = ({ key, label, icon: Icon }) => {
    const activo = activeTab === key;
    return (
      <button key={key} onClick={() => elegirTab(key)} aria-current={activo ? 'page' : undefined}
        className={`group w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-160 ease-out
          ${activo ? 'bg-primary/12 text-foreground font-semibold' : 'text-muted-foreground font-medium hover:bg-muted hover:text-foreground'}`}>
        <Icon className={`w-[18px] h-[18px] shrink-0 ${activo ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </button>
    );
  };

  /** Contenido de la barra lateral (se usa en escritorio y en el drawer móvil). */
  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <a href="/" className="rounded-lg" aria-label="JugaHoy — inicio"><BrandLogo emblem="h-9" text="text-xl" /></a>
        <button onClick={() => setMobileMenuOpen(false)} className="btn-icon md:hidden" aria-label="Cerrar menú"><X className="w-5 h-5" /></button>
      </div>

      {/* complejo activo / selector */}
      {selectedComplex && activeTab !== 'usuarios' && activeTab !== 'imagenes' && (
        <div className="px-3 pb-3">
          {complexes.length > 1 ? (
            <ComplexSwitcher complexes={complexes} selected={selectedComplex} onSelect={setSelectedComplex} />
          ) : (
            <div className="rounded-xl border border-border bg-card px-3 py-2.5">
              <div className="text-sm font-semibold text-foreground truncate">{selectedComplex.nombre}</div>
              {selectedComplex.ciudad && <div className="text-xs text-muted-foreground truncate mt-0.5">{selectedComplex.ciudad}</div>}
            </div>
          )}
        </div>
      )}

      {/* navegación */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Secciones del panel">
        {GRUPOS.map(g => {
          const items = visibleTabs.filter(t => g.keys.includes(t.key));
          const lock = bloqueadas.filter(t => g.keys.includes(t.key));
          if (!items.length && !lock.length) return null;
          return (
            <div key={g.titulo} className="mt-4 first:mt-1">
              <div className="px-3 pb-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">{g.titulo}</div>
              <div className="space-y-0.5">
                {items.map(navItem)}
                {lock.map(({ key, label, icon: Icon }) => (
                  <div key={key} title="Sin permiso"
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground/50 cursor-not-allowed select-none">
                    <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> {label}
                    <Lock className="w-3 h-3 ml-auto" aria-label="Sin permiso" />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {isGeneralAdmin && (
          <div className="mt-4">
            <button onClick={() => { navigate('/admin'); setMobileMenuOpen(false); }}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-info hover:bg-info/10 transition-colors duration-160">
              <LayoutDashboard className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> Admin general
            </button>
          </div>
        )}
      </nav>

      {/* usuario */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
          <span className="grid place-items-center w-9 h-9 rounded-full bg-primary/15 text-primary text-sm font-bold shrink-0" aria-hidden="true">{iniciales}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground truncate">{user?.nombre} {user?.apellido}</div>
            <span className={`${rol.cls} !px-2 !py-0 mt-0.5`}>{rol.label}</span>
          </div>
          <ThemeToggle compact />
        </div>
        <button onClick={logout}
          className="mt-1 w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-danger/10 hover:text-danger transition-colors duration-160">
          <LogOut className="w-[18px] h-[18px]" aria-hidden="true" /> Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-background md:flex">
      {/* ── Sidebar (escritorio) ── */}
      <aside className="hidden md:block w-64 shrink-0 border-r border-border bg-subtle sticky top-0 h-[100dvh]">
        {sidebar}
      </aside>

      {/* ── Drawer (móvil) ── */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menú del panel">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[min(20rem,86vw)] border-r border-border bg-subtle shadow-pop animate-drawer-in">
            {sidebar}
          </div>
        </div>
      )}

      {/* ── Contenido ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 glass !border-x-0 !border-t-0 flex items-center gap-3 px-4 md:px-8 h-14">
          <button onClick={() => setMobileMenuOpen(true)} aria-label="Abrir menú" aria-expanded={mobileMenuOpen}
            className="btn-icon md:hidden -ml-2"><Menu className="w-5 h-5" /></button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              {tabActual && <tabActual.icon className="w-[18px] h-[18px] text-primary shrink-0 hidden sm:block" aria-hidden="true" />}
              <h1 className="text-base font-bold truncate">{tabActual?.label || 'Panel'}</h1>
              {selectedComplex && activeTab !== 'usuarios' && activeTab !== 'imagenes' && (
                <span className="hidden sm:inline text-sm text-muted-foreground truncate">· {selectedComplex.nombre}</span>
              )}
            </div>
          </div>
          <NotificationBell />
        </header>

        <main className="flex-1 px-4 py-5 md:px-8 md:py-7">
          {renderTab()}
        </main>
      </div>
    </div>
  );
}
