import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import NotificationBell from '../../components/NotificationBell';
import { complexService } from '../../services/complexService';
import {
  Calendar, List, DollarSign, Settings, Users,
  Image, BarChart2, LogOut, Building2, ShieldCheck,
  Lock, LayoutDashboard, Link2, Menu, X,
} from 'lucide-react';
import AgendaTab        from './AgendaTab';
import OperationsTab    from './OperationsTab';
import CashTab          from './CashTab';
import SettingsTab      from './SettingsTab';
import CollaboratorsTab from './CollaboratorsTab';
import ImagesTab        from './ImagesTab';
import StatsTab         from './StatsTab';
import UsersTab         from './UsersTab';
import InvitesTab       from './InvitesTab';

// permiso: clave usada en Collaborator.permisos
const TABS = [
  { key: 'agenda',        label: 'Agenda',        icon: Calendar,    permiso: 'agenda' },
  { key: 'invitaciones',  label: 'Invitaciones',  icon: Link2,       permiso: 'agenda' },
  { key: 'operaciones',   label: 'Operaciones',   icon: List,        permiso: 'operaciones' },
  { key: 'caja',          label: 'Caja',          icon: DollarSign,  permiso: 'caja' },
  { key: 'estadisticas',  label: 'Estadísticas',  icon: BarChart2,   permiso: 'estadisticas' },
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

  // Cargar complejos según el rol
  useEffect(() => {
    setLoadingComplexes(true);
    complexService.getAll()
      .then(data => {
        setComplexes(data);
        if (data.length > 0) setSelectedComplex(data[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingComplexes(false));
  }, []);

  // Tabs visibles según rol y permisos del complejo seleccionado (memoizado)
  const visibleTabs = useMemo(() => {
    return TABS.filter(tab => {
      if (tab.adminOnly) return isGeneralAdmin;
      if (user?.rol === 'general_admin' || user?.rol === 'complex_admin') return true;
      if (isCollaborator && selectedComplex) {
        const permisos = getCollaboratorPermisos(selectedComplex.id);
        return permisos?.[tab.permiso] === true;
      }
      return false;
    });
  }, [user?.rol, isGeneralAdmin, isCollaborator, selectedComplex?.id, getCollaboratorPermisos]);

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

  const renderTab = () => {
    // Tabs sin complejo
    if (activeTab === 'usuarios')     return <UsersTab />;
    if (activeTab === 'imagenes')     return <ImagesTab />;
    if (activeTab === 'invitaciones') return <InvitesTab complexId={selectedComplex?.id} />;

    if (!selectedComplex) {
      if (loadingComplexes) return (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      );
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Sin complejos disponibles</h3>
          <p className="text-muted-foreground text-sm mb-4">
            {isCollaborator
              ? 'No tenés complejos asignados o tu acceso fue inhabilitado.'
              : 'No tenés complejos registrados aún.'}
          </p>
          {!isCollaborator && (
            <a href="/adherir-complejo" className="btn-primary">Registrar complejo</a>
          )}
        </div>
      );
    }

    if (!activeTab || visibleTabs.length === 0) return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Lock className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-semibold mb-2">Sin permisos</h3>
        <p className="text-muted-foreground text-sm">
          No tenés permisos asignados para este complejo. Contactá al administrador.
        </p>
      </div>
    );

    const props = { complexId: selectedComplex.id, complex: selectedComplex };
    switch (activeTab) {
      case 'agenda':        return <AgendaTab {...props} />;
      case 'operaciones':   return <OperationsTab {...props} />;
      case 'caja':          return <CashTab {...props} />;
      case 'estadisticas':  return <StatsTab {...props} />;
      case 'configuracion': return <SettingsTab {...props} onUpdate={c => setSelectedComplex(c)} />;
      case 'colaboradores': return <CollaboratorsTab {...props} />;
      default:              return null;
    }
  };

  // Badge de rol
  const roleBadge = () => {
    if (user?.rol === 'general_admin') return 'bg-purple-100 text-purple-700';
    if (user?.rol === 'complex_admin') return 'badge-green';
    return 'badge-yellow';
  };
  const roleLabel = () => {
    if (user?.rol === 'general_admin') return 'Admin General';
    if (user?.rol === 'complex_admin') return 'Admin Complejo';
    return 'Colaborador';
  };

  const SIDEBAR = { background: '#0a0e1a', borderRight: '1px solid #1e2a3d' };
  const DIVIDER = { borderColor: '#1e2a3d' };

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Sidebar ── */}
      <aside className="w-60 flex-col shrink-0 hidden md:flex" style={SIDEBAR}>
        {/* cabecera */}
        <div className="p-4 border-b" style={DIVIDER}>
          <div className="font-black text-white text-base flex items-center gap-2 mb-1">
            <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
              <span className="text-white text-xs font-black">J</span>
            </div>
            JugaHoy
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {user?.nombre} {user?.apellido}
          </div>
          <span className={`text-xs mt-1.5 inline-block px-2.5 py-0.5 rounded-full font-medium ${roleBadge()}`}>
            {roleLabel()}
          </span>
        </div>

        {/* selector de complejo */}
        {complexes.length > 1 && (
          <div className="p-3 border-b" style={DIVIDER}>
            <label className="text-xs text-muted-foreground mb-1 block">Complejo activo</label>
            <select className="input text-sm" value={selectedComplex?.id || ''}
              onChange={e => setSelectedComplex(complexes.find(c => c.id === parseInt(e.target.value)))}>
              {complexes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        )}

        {/* nombre del complejo activo */}
        {selectedComplex && activeTab !== 'usuarios' && activeTab !== 'imagenes' && (
          <div className="px-4 py-2 border-b" style={{ ...DIVIDER, background: '#060a12' }}>
            <div className="text-xs font-semibold truncate text-foreground">{selectedComplex.nombre}</div>
            <div className="text-xs text-muted-foreground truncate">{selectedComplex.ciudad}</div>
          </div>
        )}

        {/* navegación */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {visibleTabs.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${activeTab === key
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}>
              <Icon className="w-4 h-4 shrink-0" /> {label}
            </button>
          ))}

          {/* Tabs sin permiso (solo visibles, no accesibles) */}
          {isCollaborator && selectedComplex && (
            TABS.filter(t => !t.adminOnly && !visibleTabs.find(vt => vt.key === t.key)).map(({ key, label, icon: Icon }) => (
              <div key={key}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground/40 cursor-not-allowed select-none"
                title="Sin permiso">
                <Icon className="w-4 h-4 shrink-0" />
                {label}
                <Lock className="w-3 h-3 ml-auto" />
              </div>
            ))
          )}
        </nav>

        {/* Panel de administración general */}
        {isGeneralAdmin && (
          <div className="px-3 pb-2 border-b" style={DIVIDER}>
            <button
              onClick={() => navigate('/admin')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-purple-400 hover:bg-purple-900/20 hover:text-purple-300 transition-colors">
              <LayoutDashboard className="w-4 h-4 shrink-0" /> Admin General
            </button>
          </div>
        )}

        {/* notificaciones + logout */}
        <div className="p-3 border-t border-border space-y-1">
          <div className="flex items-center px-3 py-2">
            <NotificationBell />
            <span className="text-sm text-muted-foreground ml-2">Notificaciones</span>
          </div>
          <button onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors">
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── mobile header + hamburguesa ── */}
        <div className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b"
          style={{ background: '#0a0e1a', borderColor: '#1e2a3d' }}>
          <span className="font-black text-white flex items-center gap-2">
            <span className="w-6 h-6 bg-primary rounded flex items-center justify-center text-white text-xs font-black">J</span>
            JugaHoy
          </span>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button onClick={() => setMobileMenuOpen(o => !o)}
              aria-label="Menú" aria-expanded={mobileMenuOpen}
              className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* ── drawer del menú móvil ── */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b" style={{ background: '#0a0e1a', borderColor: '#1e2a3d' }}>
            <div className="p-4 space-y-3">
              {/* usuario + rol */}
              <div>
                <div className="text-sm font-semibold text-white truncate">{user?.nombre} {user?.apellido}</div>
                <span className={`text-xs mt-1 inline-block px-2.5 py-0.5 rounded-full font-medium ${roleBadge()}`}>
                  {roleLabel()}
                </span>
              </div>

              {/* selector de complejo */}
              {complexes.length > 1 && (
                <select className="input text-sm w-full" value={selectedComplex?.id || ''}
                  onChange={e => setSelectedComplex(complexes.find(c => c.id === parseInt(e.target.value)))}>
                  {complexes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              )}

              {/* opciones del sistema */}
              <div className="space-y-1">
                {visibleTabs.map(({ key, label, icon: Icon }) => (
                  <button key={key} onClick={() => { setActiveTab(key); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                      ${activeTab === key ? 'bg-primary text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
                    <Icon className="w-4 h-4 shrink-0" /> {label}
                  </button>
                ))}

                {/* tabs sin permiso (visibles, no accesibles) */}
                {isCollaborator && selectedComplex &&
                  TABS.filter(t => !t.adminOnly && !visibleTabs.find(vt => vt.key === t.key)).map(({ key, label, icon: Icon }) => (
                    <div key={key} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/25 cursor-not-allowed select-none">
                      <Icon className="w-4 h-4 shrink-0" /> {label} <Lock className="w-3 h-3 ml-auto" />
                    </div>
                  ))}
              </div>

              {isGeneralAdmin && (
                <button onClick={() => { navigate('/admin'); setMobileMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-purple-400 hover:bg-purple-900/20 transition-colors">
                  <LayoutDashboard className="w-4 h-4 shrink-0" /> Admin General
                </button>
              )}

              <button onClick={logout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors border-t border-[#1e2a3d] mt-2 pt-3">
                <LogOut className="w-4 h-4 shrink-0" /> Cerrar sesión
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-auto p-6">
          {renderTab()}
        </main>
      </div>
    </div>
  );
}
