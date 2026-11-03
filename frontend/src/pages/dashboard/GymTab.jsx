import { useState, useMemo, lazy, Suspense } from 'react';
import {
  Dumbbell, LayoutDashboard, Users, ScanLine, Wallet, CalendarDays, ClipboardList, Layers, FileBarChart, Settings, ShoppingCart,
} from 'lucide-react';
import { gymApi } from '../../services/gymService';
import { GymCtx, puede, useCarga, Cargando, ErrorBox } from '../../components/gym/GymUI';

// Cada vista se carga al abrirla (el módulo es grande y no todos los roles usan todo)
const VISTAS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, recurso: 'dashboard', C: lazy(() => import('./gym/GymDashboard')) },
  { key: 'acceso', label: 'Acceso', icon: ScanLine, recurso: 'accesos', C: lazy(() => import('./gym/GymAcceso')) },
  { key: 'socios', label: 'Socios', icon: Users, recurso: 'socios', C: lazy(() => import('./gym/GymSocios')) },
  { key: 'cobranzas', label: 'Cobranzas', icon: Wallet, recurso: 'cobranzas', C: lazy(() => import('./gym/GymCobranzas')) },
  { key: 'clases', label: 'Clases', icon: CalendarDays, recurso: 'clases', C: lazy(() => import('./gym/GymClases')) },
  { key: 'rutinas', label: 'Rutinas', icon: ClipboardList, recurso: 'rutinas', C: lazy(() => import('./gym/GymRutinas')) },
  { key: 'catalogos', label: 'Planes y equipos', icon: Layers, recursos: ['planes', 'profesores', 'equipos'], C: lazy(() => import('./gym/GymCatalogos')) },
  { key: 'reportes', label: 'Reportes', icon: FileBarChart, recurso: 'reportes', C: lazy(() => import('./gym/GymReportes')) },
  { key: 'config', label: 'Configuración', icon: Settings, recursos: ['configuracion', 'auditoria'], C: lazy(() => import('./gym/GymConfig')) },
];

/**
 * Módulo GYM / FITNESS CENTER dentro del panel del complejo.
 * Las vistas visibles dependen de los permisos granulares del usuario (rol de gym).
 * Tienda e inventario usan la Cantina/Almacén existente (botón "Tienda").
 */
export default function GymTab({ complexId, irA }) {
  const api = useMemo(() => gymApi(complexId), [complexId]);
  const ctx = useCarga(() => api.contexto(), [api]);
  const [vista, setVista] = useState(null);
  const [toast, setToast] = useState(null);
  const avisar = (tipo, msg) => { setToast({ tipo, msg }); setTimeout(() => setToast(null), 3500); };

  if (ctx.cargando && !ctx.data) return <Cargando />;
  if (ctx.error) return <ErrorBox>{ctx.error}</ErrorBox>;
  const { permisos, config, sucursales } = ctx.data;
  const visibles = VISTAS.filter(v => (v.recursos || [v.recurso]).some(r => puede(permisos, r, 'ver')));
  const actual = visibles.find(v => v.key === vista) || visibles[0];
  const valor = { api, complexId, permisos, config, sucursales, avisar, recargarContexto: ctx.recargar, irVista: setVista };

  return (
    <GymCtx.Provider value={valor}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold flex items-center gap-2 mr-auto"><Dumbbell className="w-5 h-5 text-primary" /> Gym</h2>
          {irA && <button className="btn-outline btn-sm" onClick={() => irA('cantina')} title="Productos, ventas y stock (Cantina / Almacén)"><ShoppingCart className="w-4 h-4" /> Tienda e inventario</button>}
        </div>
        <nav className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1" aria-label="Secciones del gym">
          {visibles.map(v => (
            <button key={v.key} onClick={() => setVista(v.key)} aria-current={actual?.key === v.key ? 'page' : undefined}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${actual?.key === v.key ? 'border-primary bg-primary/15 text-primary font-medium' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              <v.icon className="w-4 h-4" /> {v.label}
            </button>
          ))}
        </nav>
        {!actual ? (
          <div className="card text-center text-sm text-muted-foreground py-10">No tenés permisos en el módulo Gym. Pedile al administrador que te asigne un rol (Gym → Configuración).</div>
        ) : (
          <Suspense fallback={<Cargando />}><actual.C key={actual.key} /></Suspense>
        )}
        {toast && <div className={`fixed bottom-6 right-6 z-[60] px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-white ${toast.tipo === 'ok' ? 'bg-green-600' : 'bg-red-600'}`} role="status">{toast.msg}</div>}
      </div>
    </GymCtx.Provider>
  );
}
