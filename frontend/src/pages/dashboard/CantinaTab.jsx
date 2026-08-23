import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { cantinaService } from '../../services/cantinaService';
import { METODOS_PAGO as METODOS, metodoLabel, metodoChipStyle } from '../../utils/metodoPago';
import {
  LayoutDashboard, ShoppingCart, Package, Boxes, Receipt, BarChart2,
  Plus, Minus, Trash2, X, Search, AlertTriangle, DollarSign, TrendingUp,
  CheckCircle, RotateCcw, Pencil, Filter,
} from 'lucide-react';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
const CATEGORIAS = ['bebidas', 'comidas_rapidas', 'snacks', 'postres', 'otros'];
const CAT_LABEL = { bebidas: 'Bebidas', comidas_rapidas: 'Comidas rápidas', snacks: 'Snacks', postres: 'Postres', otros: 'Otros' };

// Chip de método de pago reutilizable.
const MetodoChip = ({ metodo }) => (
  <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={metodoChipStyle(metodo)}>
    {metodoLabel(metodo)}
  </span>
);

// ══════════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════════
function DashboardView({ complexId }) {
  const [d, setD] = useState(null);
  useEffect(() => { cantinaService.dashboard(complexId).then(setD).catch(() => setD(null)); }, [complexId]);
  if (!d) return <Loader />;
  const cards = [
    { label: 'Ventas del día', value: d.ventas_dia.cantidad, icon: Receipt, color: 'text-blue-400' },
    { label: 'Recaudado hoy', value: money(d.ventas_dia.total), icon: DollarSign, color: 'text-green-400' },
    { label: 'Productos activos', value: d.productos_activos, icon: Package, color: 'text-primary' },
    { label: 'Sin stock', value: d.sin_stock, icon: AlertTriangle, color: 'text-red-400' },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card py-4">
            <Icon className={`w-6 h-6 ${color} mb-2`} />
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
          </div>
        ))}
      </div>
      <div>
        <h3 className="font-semibold mb-2 flex items-center gap-2 text-amber-400">
          <AlertTriangle className="w-4 h-4" /> Stock crítico
        </h3>
        {d.stock_critico.length === 0
          ? <div className="card text-sm text-muted-foreground py-4 text-center">Todo el stock está OK.</div>
          : <div className="space-y-1.5">
              {d.stock_critico.map(p => (
                <div key={p.id} className="card py-2.5 flex items-center justify-between text-sm">
                  <span className="font-medium">{p.nombre}</span>
                  <span className={Number(p.stock) <= 0 ? 'text-red-400 font-semibold' : 'text-amber-400'}>
                    Stock: {Number(p.stock)} {Number(p.stock_minimo) > 0 && <span className="text-muted-foreground">(mín {Number(p.stock_minimo)})</span>}
                  </span>
                </div>
              ))}
            </div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  POS — VENDER
// ══════════════════════════════════════════════════════════════════
function PosView({ complexId, toast }) {
  const [productos, setProductos] = useState([]);
  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]);      // [{ producto, cantidad }]
  const [metodo, setMetodo] = useState('efectivo');
  const [descuento, setDescuento] = useState('');
  const [cobrando, setCobrando] = useState(false);

  const load = useCallback(() => {
    cantinaService.listProductos(complexId, { soloDisponibles: true }).then(setProductos).catch(() => setProductos([]));
  }, [complexId]);
  useEffect(() => { load(); }, [load]);

  const filtrados = productos.filter(p => p.nombre.toLowerCase().includes(q.toLowerCase()));

  const add = (p) => setCart(c => {
    const ex = c.find(i => i.producto.id === p.id);
    if (ex) {
      if (ex.cantidad >= Number(p.stock)) { toast('error', `Sin más stock de ${p.nombre}`); return c; }
      return c.map(i => i.producto.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i);
    }
    return [...c, { producto: p, cantidad: 1 }];
  });
  const setQty = (id, delta) => setCart(c => c.map(i => {
    if (i.producto.id !== id) return i;
    const nueva = i.cantidad + delta;
    if (nueva <= 0) return null;
    if (nueva > Number(i.producto.stock)) { toast('error', 'Sin más stock'); return i; }
    return { ...i, cantidad: nueva };
  }).filter(Boolean));
  const quitar = (id) => setCart(c => c.filter(i => i.producto.id !== id));

  const subtotal = cart.reduce((s, i) => s + Number(i.producto.precio_venta) * i.cantidad, 0);
  const desc = Math.max(0, Number(descuento) || 0);
  const total = Math.max(0, subtotal - desc);

  const cobrar = async () => {
    if (!cart.length) return;
    setCobrando(true);
    try {
      const res = await cantinaService.crearVenta(complexId, {
        metodo_pago: metodo, descuento: desc,
        items: cart.map(i => ({ producto_id: i.producto.id, cantidad: i.cantidad })),
      });
      toast('success', `Venta #${res.id} cobrada — ${money(res.total)}${res.en_caja ? ' (en caja)' : ''}`);
      setCart([]); setDescuento(''); load();
    } catch (err) {
      toast('error', err?.message || 'No se pudo cobrar.');
    } finally { setCobrando(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Catálogo */}
      <div className="lg:col-span-2 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="input pl-9" placeholder="Buscar producto..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {filtrados.length === 0 ? (
          <div className="card text-center text-sm text-muted-foreground py-8">Sin productos disponibles.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {filtrados.map(p => (
              <button key={p.id} onClick={() => add(p)}
                className="card py-3 text-left hover:ring-2 hover:ring-primary transition-all">
                <div className="text-sm font-semibold truncate">{p.nombre}</div>
                <div className="text-xs text-muted-foreground">{CAT_LABEL[p.categoria] || p.categoria}</div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-green-400 font-bold">{money(p.precio_venta)}</span>
                  <span className={`text-xs ${p.stock_bajo ? 'text-amber-400' : 'text-muted-foreground'}`}>x{Number(p.stock)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Carrito */}
      <div className="card space-y-3 h-fit lg:sticky lg:top-4">
        <h3 className="font-semibold flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-primary" /> Venta</h3>
        {cart.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Tocá productos para agregarlos.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {cart.map(i => (
              <div key={i.producto.id} className="flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{i.producto.nombre}</div>
                  <div className="text-xs text-muted-foreground">{money(i.producto.precio_venta)} c/u</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setQty(i.producto.id, -1)} className="p-1 rounded bg-white/5 hover:bg-white/10"><Minus className="w-3 h-3" /></button>
                  <span className="w-6 text-center tabular-nums">{i.cantidad}</span>
                  <button onClick={() => setQty(i.producto.id, +1)} className="p-1 rounded bg-white/5 hover:bg-white/10"><Plus className="w-3 h-3" /></button>
                  <button onClick={() => quitar(i.producto.id)} className="p-1 rounded text-red-400 hover:bg-red-500/10"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-border pt-3 space-y-2">
          <div>
            <label className="label text-xs">Método de pago</label>
            <select className="input" value={metodo} onChange={e => setMetodo(e.target.value)}>
              {METODOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs">Descuento ($)</label>
            <input type="number" min="0" className="input" placeholder="0" value={descuento} onChange={e => setDescuento(e.target.value)} />
          </div>
          <div className="flex justify-between text-sm text-muted-foreground"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          <div className="flex justify-between text-lg font-bold"><span>Total</span><span className="text-green-400">{money(total)}</span></div>
          <button onClick={cobrar} disabled={!cart.length || cobrando} className="btn-primary w-full flex items-center justify-center gap-2">
            <CheckCircle className="w-4 h-4" /> {cobrando ? 'Cobrando...' : 'Cobrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  PRODUCTOS (CRUD)
// ══════════════════════════════════════════════════════════════════
const PROD_INI = { categoria: 'bebidas', nombre: '', descripcion: '', precio_costo: '', precio_venta: '', unidad_medida: 'unidad', stock: '', stock_minimo: '' };

function ProductosView({ complexId, toast }) {
  const [productos, setProductos] = useState([]);
  const [form, setForm] = useState(null);   // null | {...} (nuevo/editar)
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => { cantinaService.listProductos(complexId).then(setProductos).catch(() => setProductos([])); }, [complexId]);
  useEffect(() => { load(); }, [load]);

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return toast('error', 'El nombre es obligatorio.');
    setSaving(true);
    try {
      const payload = { ...form, precio_costo: Number(form.precio_costo) || 0, precio_venta: Number(form.precio_venta) || 0, stock: Number(form.stock) || 0, stock_minimo: Number(form.stock_minimo) || 0 };
      if (form.id) await cantinaService.updateProducto(complexId, form.id, payload);
      else         await cantinaService.createProducto(complexId, payload);
      toast('success', form.id ? 'Producto actualizado.' : 'Producto creado.');
      setForm(null); load();
    } catch (err) { toast('error', err?.message || 'Error al guardar.'); } finally { setSaving(false); }
  };
  const borrar = async (p) => {
    if (!window.confirm(`¿Dar de baja "${p.nombre}"?`)) return;
    try { await cantinaService.deleteProducto(complexId, p.id); toast('success', 'Producto dado de baja.'); load(); }
    catch (err) { toast('error', err?.message || 'Error.'); }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Productos ({productos.length})</h3>
        <button onClick={() => setForm({ ...PROD_INI })} className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5"><Plus className="w-4 h-4" /> Nuevo</button>
      </div>
      <div className="space-y-1.5">
        {productos.map(p => (
          <div key={p.id} className={`card py-3 flex items-center gap-3 ${!p.activo ? 'opacity-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold flex items-center gap-2">
                {p.nombre}
                {!p.disponible && <span className="badge-red">Sin stock</span>}
                {p.stock_bajo && p.disponible && <span className="badge-yellow text-xs">Stock bajo</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                {CAT_LABEL[p.categoria] || p.categoria} · {money(p.precio_venta)} · stock {Number(p.stock)} {p.unidad_medida}
              </div>
            </div>
            <button onClick={() => setForm({ ...p, precio_costo: p.precio_costo, precio_venta: p.precio_venta, stock: p.stock, stock_minimo: p.stock_minimo })}
              className="p-1.5 rounded text-blue-400 hover:bg-blue-500/10"><Pencil className="w-4 h-4" /></button>
            <button onClick={() => borrar(p)} className="p-1.5 rounded text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {productos.length === 0 && <div className="card text-center text-sm text-muted-foreground py-8">Sin productos. Creá el primero.</div>}
      </div>

      {form && (
        <Modal onClose={() => setForm(null)} title={form.id ? 'Editar producto' : 'Nuevo producto'}>
          <form onSubmit={guardar} className="space-y-3">
            <div><label className="label">Nombre *</label><input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Categoría</label>
                <select className="input" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                </select>
              </div>
              <div><label className="label">Unidad</label><input className="input" value={form.unidad_medida} onChange={e => setForm(f => ({ ...f, unidad_medida: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Precio costo ($)</label><input type="number" min="0" className="input" value={form.precio_costo} onChange={e => setForm(f => ({ ...f, precio_costo: e.target.value }))} /></div>
              <div><label className="label">Precio venta ($)</label><input type="number" min="0" className="input" value={form.precio_venta} onChange={e => setForm(f => ({ ...f, precio_venta: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">{form.id ? 'Stock (se ajusta en Stock)' : 'Stock inicial'}</label>
                <input type="number" min="0" className="input" value={form.stock} disabled={!!form.id} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
              </div>
              <div><label className="label">Stock mínimo</label><input type="number" min="0" className="input" value={form.stock_minimo} onChange={e => setForm(f => ({ ...f, stock_minimo: e.target.value }))} /></div>
            </div>
            <div><label className="label">Descripción</label><textarea className="input h-16 resize-none" value={form.descripcion || ''} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
            <button type="submit" disabled={saving} className="btn-primary w-full">{saving ? 'Guardando...' : 'Guardar'}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  STOCK
// ══════════════════════════════════════════════════════════════════
function StockView({ complexId, toast }) {
  const [productos, setProductos] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [movs, setMovs] = useState([]);
  const [mov, setMov] = useState({ producto_id: '', tipo: 'entrada', motivo: 'compra', cantidad: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    cantinaService.listProductos(complexId).then(setProductos).catch(() => {});
    cantinaService.alertas(complexId).then(setAlertas).catch(() => setAlertas([]));
    cantinaService.listMovimientos(complexId, {}).then(setMovs).catch(() => setMovs([]));
  }, [complexId]);
  useEffect(() => { load(); }, [load]);

  const registrar = async (e) => {
    e.preventDefault();
    if (!mov.producto_id) return toast('error', 'Elegí un producto.');
    setSaving(true);
    try {
      await cantinaService.crearMovimiento(complexId, { ...mov, cantidad: Number(mov.cantidad) || 0 });
      toast('success', 'Movimiento registrado.');
      setMov(m => ({ ...m, cantidad: '' })); load();
    } catch (err) { toast('error', err?.message || 'Error.'); } finally { setSaving(false); }
  };
  const MOTIVOS = { entrada: ['compra', 'reposicion', 'ajuste'], salida: ['merma', 'devolucion', 'ajuste'], ajuste: ['ajuste'] };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-4">
        {alertas.length > 0 && (
          <div className="card border-amber-500/30">
            <h3 className="font-semibold text-amber-400 flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4" /> Alertas de stock ({alertas.length})</h3>
            <div className="space-y-1 text-sm">
              {alertas.map(a => (
                <div key={a.id} className="flex justify-between"><span>{a.nombre}</span>
                  <span className={a.sin_stock ? 'text-red-400 font-semibold' : 'text-amber-400'}>{a.sin_stock ? 'Sin stock' : `${a.stock} (mín ${a.stock_minimo})`}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <form onSubmit={registrar} className="card space-y-3">
          <h3 className="font-semibold">Registrar movimiento</h3>
          <div><label className="label">Producto</label>
            <select className="input" value={mov.producto_id} onChange={e => setMov(m => ({ ...m, producto_id: e.target.value }))}>
              <option value="">Elegí...</option>
              {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} (stock {Number(p.stock)})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Tipo</label>
              <select className="input" value={mov.tipo} onChange={e => setMov(m => ({ ...m, tipo: e.target.value, motivo: MOTIVOS[e.target.value][0] }))}>
                <option value="entrada">Entrada</option><option value="salida">Salida</option><option value="ajuste">Ajuste (fijar)</option>
              </select>
            </div>
            <div><label className="label">Motivo</label>
              <select className="input" value={mov.motivo} onChange={e => setMov(m => ({ ...m, motivo: e.target.value }))}>
                {MOTIVOS[mov.tipo].map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          </div>
          <div><label className="label">{mov.tipo === 'ajuste' ? 'Stock final' : 'Cantidad'}</label>
            <input type="number" min="0" className="input" value={mov.cantidad} onChange={e => setMov(m => ({ ...m, cantidad: e.target.value }))} />
          </div>
          <button type="submit" disabled={saving} className="btn-primary w-full">{saving ? '...' : 'Registrar'}</button>
        </form>
      </div>

      <div>
        <h3 className="font-semibold mb-2">Historial de movimientos</h3>
        <div className="space-y-1.5 max-h-[70vh] overflow-y-auto">
          {movs.map(m => (
            <div key={m.id} className="card py-2.5 text-sm flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-medium truncate">{m.producto?.nombre}</div>
                <div className="text-xs text-muted-foreground">{m.motivo} · {new Date(m.createdAt).toLocaleString('es-AR')}</div>
              </div>
              <span className={`font-semibold ${m.tipo === 'entrada' ? 'text-green-400' : m.tipo === 'salida' ? 'text-red-400' : 'text-blue-400'}`}>
                {m.tipo === 'entrada' ? '+' : m.tipo === 'salida' ? '−' : '='}{Number(m.cantidad)} → {Number(m.stock_resultante)}
              </span>
            </div>
          ))}
          {movs.length === 0 && <div className="card text-center text-sm text-muted-foreground py-8">Sin movimientos.</div>}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  VENTAS (historial + devolución)
// ══════════════════════════════════════════════════════════════════
function VentasView({ complexId, toast, puedeGestionar }) {
  const [ventas, setVentas] = useState([]);
  const [detalle, setDetalle] = useState(null);
  const hoy = new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [fMetodo, setFMetodo] = useState('');   // filtro por método

  const load = useCallback(() => { cantinaService.listVentas(complexId, { desde, hasta }).then(setVentas).catch(() => setVentas([])); }, [complexId, desde, hasta]);
  useEffect(() => { load(); }, [complexId]); // eslint-disable-line

  const visibles = fMetodo ? ventas.filter(v => v.metodo_pago === fMetodo) : ventas;
  // Totales por método (solo ventas completadas).
  const porMetodo = METODOS.map(m => ({
    ...m,
    total: ventas.filter(v => v.estado === 'completada' && v.metodo_pago === m.v).reduce((s, v) => s + Number(v.total), 0),
  })).filter(m => m.total > 0);

  const devolver = async (v) => {
    if (!window.confirm(`¿Anular la venta #${v.id} y reponer el stock?`)) return;
    try { await cantinaService.devolverVenta(complexId, v.id); toast('success', 'Venta anulada.'); setDetalle(null); load(); }
    catch (err) { toast('error', err?.message || 'Error.'); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input type="date" className="input w-auto text-sm" value={desde} onChange={e => setDesde(e.target.value)} />
        <span className="text-muted-foreground text-sm">→</span>
        <input type="date" className="input w-auto text-sm" value={hasta} onChange={e => setHasta(e.target.value)} />
        <button onClick={load} className="btn-primary text-sm py-2 px-4">Filtrar</button>
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select className="input w-auto text-sm" value={fMetodo} onChange={e => setFMetodo(e.target.value)}>
            <option value="">Todos los métodos</option>
            {METODOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
        </div>
        <span className="text-sm text-muted-foreground ml-auto">
          Total: <b className="text-green-400">{money(visibles.filter(v => v.estado === 'completada').reduce((s, v) => s + Number(v.total), 0))}</b>
        </span>
      </div>

      {/* Totales por método de pago */}
      {porMetodo.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {porMetodo.map(m => (
            <div key={m.v} className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <MetodoChip metodo={m.v} />
              <span className="text-sm font-bold text-green-400">{money(m.total)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {visibles.map(v => (
          <div key={v.id} className={`card py-3 flex items-center gap-3 cursor-pointer ${v.estado === 'anulada' ? 'opacity-50' : ''}`} onClick={() => setDetalle(v)}>
            <Receipt className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Venta #{v.id} {v.estado === 'anulada' && <span className="badge-red">Anulada</span>}</div>
              <div className="text-xs text-muted-foreground">{new Date(v.fecha).toLocaleString('es-AR')} · {v.detalle?.length || 0} ítems</div>
            </div>
            <MetodoChip metodo={v.metodo_pago} />
            <span className="font-bold text-green-400 whitespace-nowrap">{money(v.total)}</span>
          </div>
        ))}
        {visibles.length === 0 && <div className="card text-center text-sm text-muted-foreground py-8">{fMetodo ? 'Sin ventas con este método.' : 'Sin ventas en el rango.'}</div>}
      </div>

      {detalle && (
        <Modal onClose={() => setDetalle(null)} title={`Venta #${detalle.id}`}>
          <div className="space-y-2 text-sm">
            {detalle.detalle?.map(d => (
              <div key={d.id} className="flex justify-between">
                <span>{Number(d.cantidad)}× {d.nombre_producto}</span>
                <span className="text-muted-foreground">{money(d.subtotal)}</span>
              </div>
            ))}
            <div className="border-t border-border pt-2 flex justify-between font-semibold"><span>Total</span><span className="text-green-400">{money(detalle.total)}</span></div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{new Date(detalle.fecha).toLocaleString('es-AR')}</span>
              <MetodoChip metodo={detalle.metodo_pago} />
            </div>
            {puedeGestionar && detalle.estado === 'completada' && (
              <button onClick={() => devolver(detalle)} className="btn-outline w-full flex items-center justify-center gap-2 text-red-400 border-red-400/40 hover:bg-red-500/10 mt-2">
                <RotateCcw className="w-4 h-4" /> Anular / devolver
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  REPORTES
// ══════════════════════════════════════════════════════════════════
function ReportesView({ complexId }) {
  const [prod, setProd] = useState(null);
  const [caja, setCaja] = useState(null);
  const mes = () => { const n = new Date(); return { desde: new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10), hasta: new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().slice(0, 10) }; };
  const [rango, setRango] = useState(mes());

  const load = useCallback(() => {
    cantinaService.reporteProductos(complexId, rango).then(setProd).catch(() => setProd(null));
    cantinaService.caja(complexId, rango).then(setCaja).catch(() => setCaja(null));
  }, [complexId, rango]);
  useEffect(() => { load(); }, [complexId]); // eslint-disable-line

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input type="date" className="input w-auto text-sm" value={rango.desde} onChange={e => setRango(r => ({ ...r, desde: e.target.value }))} />
        <span className="text-muted-foreground text-sm">→</span>
        <input type="date" className="input w-auto text-sm" value={rango.hasta} onChange={e => setRango(r => ({ ...r, hasta: e.target.value }))} />
        <button onClick={load} className="btn-primary text-sm py-2 px-4">Filtrar</button>
      </div>

      {caja && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-start">
          <div className="card py-3"><div className="text-xl font-bold text-green-400">{money(caja.ingresos_cantina)}</div><div className="text-xs text-muted-foreground">Ingresos cantina</div></div>

          {/* Ingresos por turnos + desglose por método de pago */}
          <div className="card py-3">
            <div className="text-xl font-bold text-blue-400">{money(caja.ingresos_turnos)}</div>
            <div className="text-xs text-muted-foreground">Ingresos turnos</div>
            {caja.turnos_por_metodo && (
              <div className="mt-2 pt-2 border-t border-border space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Efectivo</span><span className="text-white/80 tabular-nums">{money(caja.turnos_por_metodo.efectivo)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">MercadoPago</span><span className="text-white/80 tabular-nums">{money(caja.turnos_por_metodo.mercadopago)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tarjeta</span><span className="text-white/80 tabular-nums">{money(caja.turnos_por_metodo.tarjeta)}</span></div>
              </div>
            )}
          </div>

          <div className="card py-3"><div className="text-xl font-bold text-red-400">{money(caja.egresos)}</div><div className="text-xs text-muted-foreground">Egresos</div></div>
          <div className="card py-3"><div className="text-xl font-bold text-primary">{money(caja.neto)}</div><div className="text-xs text-muted-foreground">Neto en caja</div></div>
        </div>
      )}

      {prod && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-400" /> Más vendidos</h3>
            <TablaProductos rows={prod.mas_vendidos} />
          </div>
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-amber-400" /> Menos vendidos</h3>
            <TablaProductos rows={prod.menos_vendidos} />
          </div>
          <div className="md:col-span-2 card py-3 flex justify-between">
            <span className="text-muted-foreground text-sm">Margen de ganancia total (período)</span>
            <span className="font-bold text-green-400">{money(prod.total_margen)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
function TablaProductos({ rows }) {
  if (!rows?.length) return <div className="card text-center text-sm text-muted-foreground py-6">Sin datos.</div>;
  return (
    <div className="space-y-1">
      {rows.map(p => (
        <div key={p.producto_id} className="card py-2 flex items-center justify-between text-sm">
          <span className="truncate">{p.nombre}</span>
          <span className="text-muted-foreground shrink-0 ml-2">{Number(p.unidades)}u · <b className="text-green-400">{money(p.total)}</b> · margen {money(p.margen)}</span>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════════
function Loader() {
  return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>;
}
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 card w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  MAIN TAB
// ══════════════════════════════════════════════════════════════════
export default function CantinaTab({ complexId }) {
  const { hasPermission } = useAuth();
  const gestion = hasPermission(complexId, 'cantina_gestion');
  const ventas  = hasPermission(complexId, 'cantina_ventas');

  const SUBTABS = [
    { key: 'dashboard', label: 'Inicio',    icon: LayoutDashboard, show: gestion || ventas },
    { key: 'vender',    label: 'Vender',     icon: ShoppingCart,    show: ventas },
    { key: 'productos', label: 'Productos',  icon: Package,         show: gestion },
    { key: 'stock',     label: 'Stock',      icon: Boxes,           show: gestion },
    { key: 'ventas',    label: 'Ventas',     icon: Receipt,         show: gestion || ventas },
    { key: 'reportes',  label: 'Reportes',   icon: BarChart2,       show: gestion },
  ].filter(t => t.show);

  const [active, setActive] = useState(SUBTABS[0]?.key);
  const [toast, setToast] = useState(null);
  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500); };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-primary" /> Cantina</h2>

      {/* Sub-navegación */}
      <div className="flex gap-2 flex-wrap border-b border-border pb-2">
        {SUBTABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActive(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${active === key ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {active === 'dashboard' && <DashboardView complexId={complexId} />}
      {active === 'vender'    && <PosView complexId={complexId} toast={showToast} />}
      {active === 'productos' && <ProductosView complexId={complexId} toast={showToast} />}
      {active === 'stock'     && <StockView complexId={complexId} toast={showToast} />}
      {active === 'ventas'    && <VentasView complexId={complexId} toast={showToast} puedeGestionar={gestion} />}
      {active === 'reportes'  && <ReportesView complexId={complexId} />}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2.5 px-5 py-3.5 rounded-xl shadow-xl text-sm font-medium text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
