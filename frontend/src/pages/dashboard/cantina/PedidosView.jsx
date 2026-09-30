import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, Plus, Minus, X, Trash2, Pencil, Copy, Check, MessageCircle, Truck, Users, ClipboardList,
  PackageCheck, Ban, UserPlus, ChevronRight, Tags,
} from 'lucide-react';
import { cantinaService } from '../../../services/cantinaService';
import { mensajePedido, telefonoPedido, waPedidoLink, copiarTexto } from '../../../utils/pedidoWhatsapp';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
const cant = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const fechaCorta = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
const errMsg = (e) => e?.message || 'Ocurrió un error';
// Búsqueda tolerante (igual que SearchableSelect): sin mayúsculas ni acentos
const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const ESTADOS = {
  proveedor: {
    pendiente:          { label: 'Pendiente',          cls: 'badge-yellow' },
    confirmado_parcial: { label: 'Recibido parcial',   cls: 'badge-blue' },
    confirmado_total:   { label: 'Recibido total',     cls: 'badge-green' },
    cancelado:          { label: 'Cancelado',          cls: 'badge-red' },
  },
  cliente: {
    pendiente: { label: 'Pendiente', cls: 'badge-yellow' },
    entregado: { label: 'Entregado', cls: 'badge-green' },
    cancelado: { label: 'Cancelado', cls: 'badge-red' },
  },
};
const ITEM_ESTADO = { pendiente: 'text-amber-400', recibido: 'text-green-400', entregado: 'text-green-400' };

/**
 * Pantalla de Pedidos de la Cantina.
 *  - Ventas (pedidos de clientes): cualquiera con permiso de cantina.
 *  - Compras (pedidos a proveedores) y Proveedores: solo 'cantina_gestion'.
 */
export default function PedidosView({ complexId, clubNombre, toast, gestion }) {
  const SUB = [
    { key: 'ventas',      label: 'Pedidos de clientes',   icon: ClipboardList, show: true },
    { key: 'compras',     label: 'Pedidos a proveedores', icon: Truck,         show: gestion },
    { key: 'clientes',    label: 'Clientes',              icon: Users,         show: true },
    { key: 'proveedores', label: 'Proveedores',           icon: Truck,         show: gestion },
  ].filter(s => s.show);
  const [sub, setSub] = useState(SUB[0].key);
  const ctx = { complexId, clubNombre, toast, gestion };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto">
        {SUB.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setSub(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm whitespace-nowrap transition-colors
              ${sub === key ? 'bg-primary/15 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>
      {sub === 'ventas'      && <ListaPedidos key="cliente" tipo="cliente" {...ctx} />}
      {sub === 'compras'     && <ListaPedidos key="proveedor" tipo="proveedor" {...ctx} />}
      {sub === 'clientes'    && <Contactos key="clientes" tipo="cliente" {...ctx} />}
      {sub === 'proveedores' && <Contactos key="proveedores" tipo="proveedor" {...ctx} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  LISTADO DE PEDIDOS
// ══════════════════════════════════════════════════════════════════
function ListaPedidos({ tipo, complexId, clubNombre, toast }) {
  const [pedidos, setPedidos] = useState(null);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState(null);   // pedido en el detalle

  const cargar = useCallback(() => {
    cantinaService.listPedidos(complexId, tipo, { q: q.trim() || undefined, estado: estado || undefined })
      .then(setPedidos).catch(() => setPedidos([]));
  }, [complexId, tipo, q, estado]);
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t); }, [cargar]);

  const actualizar = (p) => { setAbierto(p); cargar(); };
  const contacto = (p) => (tipo === 'proveedor' ? p.proveedor : p.cliente);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="input pl-9" value={q} onChange={e => setQ(e.target.value)}
            placeholder={tipo === 'cliente' ? 'Buscar por n° de pedido, cliente, DNI o WhatsApp…' : 'Buscar por n° de pedido, proveedor o WhatsApp…'} />
        </div>
        <select className="input !w-auto text-sm" value={estado} onChange={e => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS[tipo]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn-primary text-sm flex items-center gap-1" onClick={() => setNuevo(true)}><Plus className="w-4 h-4" /> Nuevo pedido</button>
      </div>

      {!pedidos ? <div className="text-sm text-muted-foreground">Cargando…</div>
        : pedidos.length === 0 ? <div className="card text-center text-sm text-muted-foreground py-8">Sin pedidos.</div>
        : (
          <div className="space-y-1.5">
            {pedidos.map(p => {
              const e = ESTADOS[tipo][p.estado];
              const recibidos = p.items.filter(i => i.estado !== 'pendiente').length;
              return (
                <button key={p.id} onClick={() => setAbierto(p)} className="card w-full py-3 flex items-center gap-3 text-left hover:border-primary/50 transition-colors">
                  <div className="font-mono text-xs text-muted-foreground w-10">#{p.id}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{contacto(p)?.nombre}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {fechaCorta(p.fecha)} · {p.items.length} ítem{p.items.length !== 1 ? 's' : ''}
                      {p.estado === 'confirmado_parcial' && ` · ${recibidos}/${p.items.length} recibidos`}
                      {' · '}{money(p.total)}
                    </div>
                  </div>
                  <span className={e.cls}>{e.label}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        )}

      {nuevo && (
        <NuevoPedido tipo={tipo} complexId={complexId} onClose={() => setNuevo(false)}
          onCreado={(p) => { setNuevo(false); toast('success', `Pedido #${p.id} generado. Envialo por WhatsApp.`); actualizar(p); }} />
      )}
      {abierto && (
        <DetallePedido pedido={abierto} complexId={complexId} clubNombre={clubNombre} toast={toast}
          onClose={() => setAbierto(null)} onChange={actualizar} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  NUEVO PEDIDO
// ══════════════════════════════════════════════════════════════════
function NuevoPedido({ tipo, complexId, onClose, onCreado }) {
  const compra = tipo === 'proveedor';
  const [contacto, setContacto] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);    // venta: stock del complejo
  const [catalogo, setCatalogo] = useState(null);    // compra: catálogo del proveedor elegido
  const [items, setItems] = useState([]);            // [{ producto, cantidad, precio, link? }]
  const [qProd, setQProd] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [alerta, setAlerta] = useState(null);        // respuesta 409 HAY_MEJOR_PRECIO

  useEffect(() => {
    if (compra) cantinaService.listProveedores(complexId, { estado: 'activo' }).then(setProveedores).catch(() => {});
    else cantinaService.listProductos(complexId).then(setProductos).catch(() => {});
  }, [complexId, compra]);

  // Compra: al elegir proveedor se cargan SOLO sus productos con sus precios
  const elegirProveedor = (prov) => {
    if (items.length && prov?.id !== contacto?.id && !confirm('Cambiar de proveedor vacía la lista de productos. ¿Continuar?')) return;
    setContacto(prov);
    setItems([]);
    setCatalogo(null);
    if (prov) cantinaService.catalogoProveedor(complexId, prov.id).then(setCatalogo).catch(() => setCatalogo([]));
  };

  const sugeridos = useMemo(() => {
    const q = normalize(qProd.trim());
    if (!q) return [];
    if (compra) return (catalogo || []).filter(l => l.producto.activo !== false && normalize(l.producto.nombre).includes(q)).slice(0, 8);
    return productos.filter(p => p.activo !== false && normalize(p.nombre).includes(q)).slice(0, 8);
  }, [productos, catalogo, qProd, compra]);

  const agregar = (x) => {
    const producto = compra ? x.producto : x;
    setItems(its => {
      const i = its.findIndex(it => it.producto.id === producto.id);
      if (i >= 0) return its.map((it, j) => (j === i ? { ...it, cantidad: Number(it.cantidad) + 1 } : it));
      return [...its, compra
        // Compra: arranca en el mínimo del proveedor (si tiene) y con su precio efectivo
        ? { producto, link: x, cantidad: Math.max(Number(x.minimo_compra) || 1, 1), precio: precioEfectivo(x) }
        : { producto, cantidad: 1, precio: Number(producto.precio_venta) }];
    });
    setQProd('');
  };
  const setItem = (i, k, v) => setItems(its => its.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const total = items.reduce((a, i) => a + Number(i.cantidad || 0) * Number(i.precio || 0), 0);
  const bajoMinimo = (i) => compra && Number(i.link?.minimo_compra) > 0 && Number(i.cantidad) < Number(i.link.minimo_compra);

  const enviar = async (aceptoPrecios = false) => {
    setError('');
    if (!contacto) return setError(`Elegí ${tipo === 'cliente' ? 'un cliente' : 'un proveedor'}.`);
    if (!items.length) return setError('Agregá al menos un producto.');
    if (items.some(i => !(Number(i.cantidad) > 0))) return setError('Las cantidades deben ser mayores a 0.');
    if (items.some(bajoMinimo)) return setError('Hay productos por debajo del mínimo de compra del proveedor.');
    setGuardando(true);
    try {
      const p = await cantinaService.createPedido(complexId, tipo, {
        [compra ? 'proveedor_id' : 'cliente_id']: contacto.id,
        notas,
        // En compras el precio lo pone el catálogo del proveedor (el backend ignora el enviado)
        items: items.map(i => ({ producto_id: i.producto.id, cantidad: Number(i.cantidad), ...(compra ? {} : { precio_unitario: Number(i.precio) }) })),
        ...(aceptoPrecios ? { acepto_precios: true } : {}),
      });
      setAlerta(null);
      onCreado(p);
    } catch (e) {
      // Validación automática de precios: hay proveedores más baratos → decidir
      if (e?.code === 'HAY_MEJOR_PRECIO') setAlerta(e);
      else setError(errMsg(e));
    } finally { setGuardando(false); }
  };

  const quitarProductos = (ids) => { setItems(its => its.filter(i => !ids.includes(i.producto.id))); setAlerta(null); };

  return (
    <Panel titulo={compra ? 'Nuevo pedido a proveedor' : 'Nuevo pedido de cliente'} onClose={onClose}>
      <div className="space-y-4">
        {/* Contacto */}
        {!compra
          ? <ClienteBuscador complexId={complexId} value={contacto} onChange={setContacto} />
          : (
            <label className="block">
              <span className="text-xs text-muted-foreground">Proveedor</span>
              <select className="input" value={contacto?.id || ''} onChange={e => elegirProveedor(proveedores.find(p => p.id === Number(e.target.value)) || null)}>
                <option value="">Elegí un proveedor…</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.contacto ? ` (${p.contacto})` : ''}</option>)}
              </select>
              {proveedores.length === 0 && <span className="text-[11px] text-amber-400">No hay proveedores activos: cargalos en "Proveedores".</span>}
            </label>
          )}

        {/* Productos */}
        {compra && !contacto ? (
          <p className="text-xs text-muted-foreground">Elegí el proveedor para ver sus productos y precios.</p>
        ) : compra && catalogo?.length === 0 ? (
          <p className="text-sm text-amber-400">Este proveedor no tiene productos asociados. Cargalos en Proveedores → Productos y precios.</p>
        ) : (
          <div>
            <span className="text-xs text-muted-foreground">{compra ? `Productos de ${contacto.nombre}` : 'Productos'}</span>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className="input pl-9" placeholder="Buscar producto para agregar…" value={qProd} onChange={e => setQProd(e.target.value)} />
              {sugeridos.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-xl max-h-64 overflow-y-auto">
                  {sugeridos.map(x => {
                    const p = compra ? x.producto : x;
                    return (
                      <button key={p.id} type="button" onClick={() => agregar(x)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between gap-2">
                        <span className="truncate">{p.nombre}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          stock {cant(p.stock)} · {money(compra ? precioEfectivo(x) : p.precio_venta)}
                          {compra && Number(x.minimo_compra) > 0 && ` · mín. ${cant(x.minimo_compra)}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((i, idx) => {
              const faltaStock = !compra && Number(i.cantidad) > Number(i.producto.stock);
              const otroMasBarato = compra && i.link?.mejor_otro && i.link.mejor_otro.precio < Number(i.precio);
              return (
                <div key={i.producto.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 truncate">{i.producto.nombre}</div>
                    <button type="button" className="p-1 rounded hover:bg-muted" onClick={() => setItem(idx, 'cantidad', Math.max(1, Number(i.cantidad) - 1))} aria-label="Menos"><Minus className="w-3.5 h-3.5" /></button>
                    <input className="input !w-16 text-center !px-1" inputMode="decimal" value={i.cantidad} onChange={e => setItem(idx, 'cantidad', e.target.value)} aria-label="Cantidad" />
                    <button type="button" className="p-1 rounded hover:bg-muted" onClick={() => setItem(idx, 'cantidad', Number(i.cantidad) + 1)} aria-label="Más"><Plus className="w-3.5 h-3.5" /></button>
                    {compra
                      ? <span className="w-24 text-right text-muted-foreground" title="Precio del proveedor">{money(i.precio)}</span>
                      : <input className="input !w-24 text-right !px-2" inputMode="decimal" value={i.precio} onChange={e => setItem(idx, 'precio', e.target.value)} aria-label="Precio unitario" />}
                    <button type="button" className="p-1 text-red-400 hover:bg-red-500/10 rounded" onClick={() => setItems(its => its.filter((_, j) => j !== idx))} aria-label="Quitar"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="text-[11px] space-x-2">
                    {faltaStock && <span className="text-amber-400">Hoy hay {cant(i.producto.stock)}: se valida al entregar</span>}
                    {bajoMinimo(i) && <span className="text-red-400">Mínimo de compra: {cant(i.link.minimo_compra)}</span>}
                    {compra && Number(i.link?.descuento_pct) > 0 && <span className="text-green-400">{Number(i.link.descuento_pct)}% off sobre {money(i.link.precio_compra)}</span>}
                    {compra && i.link?.condiciones && <span className="text-muted-foreground">{i.link.condiciones}</span>}
                    {otroMasBarato && <span className="text-amber-400">💡 {money(i.link.mejor_otro.precio)} en {i.link.mejor_otro.proveedor.nombre}</span>}
                  </div>
                </div>
              );
            })}
            <div className="text-right text-sm font-semibold pt-1">Total {money(total)}</div>
          </div>
        )}

        <textarea className="input min-h-[60px]" placeholder="Notas (opcional): entrega, forma de pago…" value={notas} onChange={e => setNotas(e.target.value)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={guardando} onClick={() => enviar(false)}>{guardando ? 'Generando…' : 'Generar pedido'}</button>
      </div>

      {alerta && (
        <AlertaPrecios alerta={alerta} proveedor={contacto} guardando={guardando}
          onContinuar={() => enviar(true)} onModificar={() => setAlerta(null)} onQuitar={quitarProductos} />
      )}
    </Panel>
  );
}

/** Precio efectivo del catálogo (mismo cálculo que el backend): lista − descuento. */
function precioEfectivo(link) {
  const desc = Math.min(Math.max(Number(link.descuento_pct) || 0, 0), 100);
  return Math.round(Number(link.precio_compra) * (1 - desc / 100) * 100) / 100;
}

/**
 * Alerta previa a generar un pedido de compra: productos que están más baratos
 * en otro proveedor. El usuario decide: seguir con este proveedor, modificar el
 * pedido, o quitar esos productos (para pedirlos al proveedor más barato).
 */
function AlertaPrecios({ alerta, proveedor, guardando, onContinuar, onModificar, onQuitar }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="alertdialog" aria-labelledby="alerta-precios-titulo">
      <div className="absolute inset-0 bg-black/70" onClick={onModificar} />
      <div className="relative z-10 card w-full max-w-xl max-h-[85vh] overflow-y-auto space-y-4 border-amber-500/40">
        <div>
          <h3 id="alerta-precios-titulo" className="font-bold text-amber-400">Hay precios mejores en otros proveedores</h3>
          <p className="text-sm text-muted-foreground">
            Pidiendo lo mismo a los proveedores más baratos ahorrarías <strong className="text-foreground">{money(alerta.ahorro_total)}</strong>.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground text-left">
              <tr>
                <th className="py-1.5 pr-2">Producto</th>
                <th className="py-1.5 px-2 text-right">{proveedor?.nombre}</th>
                <th className="py-1.5 px-2 text-right">Mejor precio</th>
                <th className="py-1.5 pl-2">Proveedor</th>
              </tr>
            </thead>
            <tbody>
              {alerta.alertas.map(a => (
                <tr key={a.producto_id} className="border-t border-border">
                  <td className="py-2 pr-2">{a.producto}<div className="text-[11px] text-muted-foreground">× {cant(a.cantidad)} · ahorro {money(a.ahorro_total)}</div></td>
                  <td className="py-2 px-2 text-right">{money(a.precio_actual)}</td>
                  <td className="py-2 px-2 text-right font-semibold text-green-400">{money(a.mejor_precio)}</td>
                  <td className="py-2 pl-2">{a.mejor_proveedor.nombre}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button className="btn-outline text-sm flex-1" onClick={onModificar}>Modificar pedido</button>
          <button className="btn-outline text-sm flex-1" onClick={() => onQuitar(alerta.alertas.map(a => a.producto_id))}>Quitar esos productos</button>
          <button className="btn-primary text-sm flex-1" disabled={guardando} onClick={onContinuar}>{guardando ? 'Generando…' : 'Continuar igual'}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Catálogo de un proveedor: qué productos le compramos y a qué precio
 * (precio de compra, venta sugerida, mínimo, descuento y condiciones).
 * Muestra el mejor precio de otros proveedores como referencia.
 */
function CatalogoProveedor({ complexId, proveedor, toast, onClose }) {
  const [filas, setFilas] = useState(null);
  const [productos, setProductos] = useState([]);
  const [q, setQ] = useState('');
  const [editando, setEditando] = useState(null);   // { producto, ...campos }

  const cargar = useCallback(() => cantinaService.catalogoProveedor(complexId, proveedor.id).then(setFilas).catch(() => setFilas([])), [complexId, proveedor.id]);
  useEffect(() => { cargar(); cantinaService.listProductos(complexId).then(setProductos).catch(() => {}); }, [cargar, complexId]);

  const enCatalogo = new Set((filas || []).map(f => f.producto_id));
  const sugeridos = q.trim()
    ? productos.filter(p => !enCatalogo.has(p.id) && normalize(p.nombre).includes(normalize(q.trim()))).slice(0, 8)
    : [];
  const guardar = async (e) => {
    e.preventDefault();
    const { producto, ...d } = editando;
    try { await cantinaService.guardarPrecio(complexId, proveedor.id, producto.id, d); setEditando(null); setQ(''); cargar(); toast('success', 'Precio guardado.'); }
    catch (err) { toast('error', errMsg(err)); }
  };
  const quitar = async (f) => {
    if (!confirm(`¿Quitar "${f.producto.nombre}" del catálogo de ${proveedor.nombre}?`)) return;
    try { await cantinaService.quitarDelCatalogo(complexId, proveedor.id, f.producto_id); cargar(); } catch (err) { toast('error', errMsg(err)); }
  };
  const set = (k, v) => setEditando(x => ({ ...x, [k]: v }));

  return (
    <Panel titulo={`Productos y precios · ${proveedor.nombre}`} onClose={onClose}>
      <div className="space-y-4">
        {!editando && (
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="input pl-9" placeholder="Agregar producto al catálogo…" value={q} onChange={e => setQ(e.target.value)} />
            {sugeridos.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-xl max-h-64 overflow-y-auto">
                {sugeridos.map(p => (
                  <button key={p.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => setEditando({ producto: p, precio_compra: p.precio_costo > 0 ? String(Number(p.precio_costo)) : '', precio_venta: '', minimo_compra: '', descuento_pct: '', condiciones: '' })}>
                    {p.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {editando && (
          <form onSubmit={guardar} className="card space-y-2 border-primary/40">
            <div className="font-medium">{editando.producto.nombre}</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">Precio de compra *<input className="input" inputMode="decimal" required value={editando.precio_compra} onChange={e => set('precio_compra', e.target.value)} /></label>
              <label className="text-xs text-muted-foreground">Precio de venta sugerido<input className="input" inputMode="decimal" value={editando.precio_venta ?? ''} onChange={e => set('precio_venta', e.target.value)} /></label>
              <label className="text-xs text-muted-foreground">Mínimo de compra<input className="input" inputMode="decimal" value={editando.minimo_compra ?? ''} onChange={e => set('minimo_compra', e.target.value)} /></label>
              <label className="text-xs text-muted-foreground">Descuento %<input className="input" inputMode="decimal" value={editando.descuento_pct ?? ''} onChange={e => set('descuento_pct', e.target.value)} /></label>
            </div>
            <input className="input" placeholder="Condiciones (plazo de pago, flete, bonificaciones…)" value={editando.condiciones ?? ''} onChange={e => set('condiciones', e.target.value)} />
            <div className="flex gap-2">
              <button className="btn-primary text-sm">Guardar</button>
              <button type="button" className="btn-outline text-sm" onClick={() => setEditando(null)}>Cancelar</button>
            </div>
          </form>
        )}

        {filas?.length === 0 && <div className="card text-sm text-muted-foreground text-center py-6">Sin productos: agregá los que le comprás a este proveedor.</div>}
        <div className="space-y-1.5">
          {filas?.map(f => {
            const masBarato = f.mejor_otro && f.mejor_otro.precio < f.precio_efectivo;
            return (
              <div key={f.id} className="card py-2.5 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{f.producto.nombre}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {[
                      Number(f.descuento_pct) > 0 && `lista ${money(f.precio_compra)} −${Number(f.descuento_pct)}%`,
                      Number(f.minimo_compra) > 0 && `mín. ${cant(f.minimo_compra)}`,
                      f.precio_venta != null && `venta sug. ${money(f.precio_venta)}`,
                      f.condiciones,
                    ].filter(Boolean).join(' · ')}
                  </div>
                  {masBarato && <div className="text-[11px] text-amber-400">Más barato en {f.mejor_otro.proveedor.nombre}: {money(f.mejor_otro.precio)}</div>}
                </div>
                <div className={`font-semibold whitespace-nowrap ${masBarato ? 'text-amber-400' : 'text-green-400'}`}>{money(f.precio_efectivo)}</div>
                <button className="p-1.5 rounded hover:bg-muted" aria-label="Editar precio"
                  onClick={() => setEditando({ producto: f.producto, precio_compra: String(Number(f.precio_compra)), precio_venta: f.precio_venta ?? '', minimo_compra: f.minimo_compra ?? '', descuento_pct: f.descuento_pct ?? '', condiciones: f.condiciones ?? '' })}>
                  <Pencil className="w-4 h-4" />
                </button>
                <button className="p-1.5 rounded hover:bg-red-500/10 text-red-400" aria-label="Quitar del catálogo" onClick={() => quitar(f)}><Trash2 className="w-4 h-4" /></button>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

// ══════════════════════════════════════════════════════════════════
//  DETALLE + CONFIRMACIÓN + ENVÍO POR WHATSAPP
// ══════════════════════════════════════════════════════════════════
function DetallePedido({ pedido, complexId, clubNombre, toast, onClose, onChange }) {
  const tipo = pedido.tipo;
  const e = ESTADOS[tipo][pedido.estado];
  const c = tipo === 'proveedor' ? pedido.proveedor : pedido.cliente;
  const [recepcion, setRecepcion] = useState(null);   // { [item_id]: { tildado, cantidad } }
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');

  const pendientes = pedido.items.filter(i => i.estado === 'pendiente');
  const puedeConfirmar = tipo === 'proveedor' && ['pendiente', 'confirmado_parcial'].includes(pedido.estado);

  const accion = async (fn, ok) => {
    setError(''); setTrabajando(true);
    try { const p = await fn(); onChange(p); setRecepcion(null); toast('success', ok); } catch (err) { setError(errMsg(err)); } finally { setTrabajando(false); }
  };
  const abrirRecepcion = () => setRecepcion(Object.fromEntries(pendientes.map(i => [i.id, { tildado: true, cantidad: String(Number(i.cantidad)) }])));
  const confirmar = () => {
    const tildados = Object.entries(recepcion).filter(([, v]) => v.tildado);
    if (!tildados.length) return setError('Tildá al menos un ítem recibido.');
    const parcial = tildados.length < pendientes.length;
    accion(() => cantinaService.confirmarPedido(complexId, pedido.id,
      tildados.map(([id, v]) => ({ item_id: Number(id), cantidad_recibida: Number(v.cantidad) }))),
    parcial ? 'Recepción parcial registrada: stock actualizado.' : 'Pedido recibido completo: stock actualizado.');
  };

  return (
    <Panel titulo={`${tipo === 'cliente' ? 'Pedido de cliente' : 'Pedido a proveedor'} #${pedido.id}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold truncate">{c?.nombre}</div>
            <div className="text-xs text-muted-foreground">
              {[c?.contacto, c?.dni && `DNI ${c.dni}`, c?.whatsapp && `WA ${c.whatsapp}`].filter(Boolean).join(' · ')}
            </div>
            <div className="text-xs text-muted-foreground">{fechaCorta(pedido.fecha)}</div>
          </div>
          <span className={e.cls}>{e.label}</span>
        </div>

        {/* Ítems (o checklist de recepción) */}
        <div className="rounded-lg border border-border divide-y divide-border">
          {pedido.items.map(i => {
            const r = recepcion?.[i.id];
            return (
              <div key={i.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                {r && (
                  <input type="checkbox" className="w-4 h-4 accent-primary" checked={r.tildado} aria-label={`Recibido ${i.producto?.nombre}`}
                    onChange={ev => setRecepcion(x => ({ ...x, [i.id]: { ...x[i.id], tildado: ev.target.checked } }))} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate">{i.producto?.nombre}</div>
                  <div className={`text-[11px] ${ITEM_ESTADO[i.estado]}`}>
                    {i.estado === 'recibido' ? `Recibido ${cant(i.cantidad_recibida ?? i.cantidad)}${Number(i.cantidad_recibida) !== Number(i.cantidad) ? ` de ${cant(i.cantidad)}` : ''}`
                      : i.estado === 'entregado' ? 'Entregado'
                      : tipo === 'proveedor' && pedido.estado !== 'pendiente' ? 'No recibido' : 'Pendiente'}
                  </div>
                </div>
                {r ? (
                  <input className="input !w-20 text-center !px-1" inputMode="decimal" disabled={!r.tildado} value={r.cantidad} aria-label="Cantidad recibida"
                    onChange={ev => setRecepcion(x => ({ ...x, [i.id]: { ...x[i.id], cantidad: ev.target.value } }))} />
                ) : (
                  <span className="text-muted-foreground whitespace-nowrap">{cant(i.cantidad)} × {money(i.precio_unitario)}</span>
                )}
              </div>
            );
          })}
          <div className="px-3 py-2 text-right text-sm font-semibold">Total {money(pedido.total)}</div>
        </div>
        {pedido.notas && <p className="text-sm text-muted-foreground">📝 {pedido.notas}</p>}

        {/* Acciones de estado */}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {puedeConfirmar && !recepcion && (
            <button className="btn-primary text-sm flex items-center gap-1" onClick={abrirRecepcion}><PackageCheck className="w-4 h-4" /> Confirmar recepción</button>
          )}
          {recepcion && <>
            <button className="btn-primary text-sm flex items-center gap-1" disabled={trabajando} onClick={confirmar}>
              <Check className="w-4 h-4" /> Confirmar tildados (suma stock)
            </button>
            <button className="btn-outline text-sm" onClick={() => setRecepcion(null)}>Volver</button>
          </>}
          {tipo === 'cliente' && pedido.estado === 'pendiente' && (
            <button className="btn-primary text-sm flex items-center gap-1" disabled={trabajando}
              onClick={() => confirm('¿Marcar como entregado? Se descuenta el stock de todos los ítems.') &&
                accion(() => cantinaService.entregarPedido(complexId, pedido.id), 'Pedido entregado: stock descontado.')}>
              <PackageCheck className="w-4 h-4" /> Entregar (resta stock)
            </button>
          )}
          {pedido.estado === 'pendiente' && !recepcion && (
            <button className="btn-outline text-sm text-red-400 flex items-center gap-1" disabled={trabajando}
              onClick={() => confirm('¿Cancelar el pedido?') && accion(() => cantinaService.cancelarPedido(complexId, tipo, pedido.id), 'Pedido cancelado.')}>
              <Ban className="w-4 h-4" /> Cancelar
            </button>
          )}
        </div>
        {recepcion && (
          <p className="text-[11px] text-muted-foreground">
            Los ítems tildados suman al stock con la cantidad indicada. Los que no tildes quedan como <strong>no recibidos</strong> y podés confirmarlos más adelante.
          </p>
        )}

        {!recepcion && <EnviarWhatsApp pedido={pedido} clubNombre={clubNombre} toast={toast} />}
      </div>
    </Panel>
  );
}

/**
 * Copiar el pedido y abrir WhatsApp en el dispositivo en uso con el texto ya
 * cargado en el chat del contacto (se envía a mano). El texto sigue el estado.
 */
function EnviarWhatsApp({ pedido, clubNombre, toast }) {
  const mensaje = mensajePedido(pedido, clubNombre);
  const tel = telefonoPedido(pedido);
  const [copiado, setCopiado] = useState(false);
  const titulo = {
    pendiente: 'Enviar pedido', confirmado_parcial: 'Avisar recepción parcial', confirmado_total: 'Avisar recepción completa',
    entregado: 'Enviar comprobante de entrega', cancelado: 'Avisar cancelación',
  }[pedido.estado];

  const copiar = async () => {
    if (await copiarTexto(mensaje)) { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
    else toast('error', 'No se pudo copiar: seleccioná el texto a mano.');
  };
  const abrir = async () => {
    await copiarTexto(mensaje);   // también queda en el portapapeles, por si WhatsApp no lo carga
    window.open(waPedidoLink(tel, mensaje), '_blank', 'noopener');
  };

  return (
    <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 space-y-2">
      <div className="text-sm font-semibold flex items-center gap-1.5"><MessageCircle className="w-4 h-4 text-green-400" /> {titulo}</div>
      <pre className="text-xs whitespace-pre-wrap font-sans bg-background/60 rounded-md p-2.5 max-h-48 overflow-y-auto select-all">{mensaje}</pre>
      {!tel && <p className="text-[11px] text-amber-400">El contacto no tiene WhatsApp cargado: WhatsApp te va a pedir elegir el chat.</p>}
      <div className="flex gap-2">
        <button className="btn-outline text-sm flex-1 flex items-center justify-center gap-1.5" onClick={copiar}>
          {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copiado ? 'Copiado' : 'Copiar pedido'}
        </button>
        <button className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors" onClick={abrir}>
          <MessageCircle className="w-4 h-4" /> Abrir WhatsApp
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  BUSCADOR DE CLIENTES (nombre, DNI o WhatsApp) + alta rápida
// ══════════════════════════════════════════════════════════════════
function ClienteBuscador({ complexId, value, onChange }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [alta, setAlta] = useState(false);
  const cont = useRef(null);

  useEffect(() => {
    const texto = q.trim();
    if (!texto) { setRes([]); return; }
    const t = setTimeout(() => {
      cantinaService.listClientes(complexId, { q: texto, estado: 'activo', limit: 10 }).then(setRes).catch(() => setRes([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, complexId]);
  useEffect(() => {
    const fuera = (ev) => { if (cont.current && !cont.current.contains(ev.target)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  if (value) {
    return (
      <div>
        <span className="text-xs text-muted-foreground">Cliente</span>
        <div className="card py-2 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{value.nombre}</div>
            <div className="text-xs text-muted-foreground">{[value.dni && `DNI ${value.dni}`, value.whatsapp && `WA ${value.whatsapp}`].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</div>
          </div>
          <button className="text-xs text-primary hover:underline" onClick={() => onChange(null)}>Cambiar</button>
        </div>
      </div>
    );
  }
  if (alta) {
    return (
      <ContactoForm tipo="cliente" inicial={{ nombre: /\d/.test(q) ? '' : q, dni: /^\d{7,9}$/.test(q.replace(/\D/g, '')) ? q.replace(/\D/g, '') : '' }}
        onCancel={() => setAlta(false)}
        onSave={async (d) => { const c = await cantinaService.createCliente(complexId, d); onChange(c); setAlta(false); }} />
    );
  }
  return (
    <div ref={cont} className="relative">
      <span className="text-xs text-muted-foreground">Cliente</span>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input className="input pl-9" placeholder="Buscar cliente por nombre, DNI o WhatsApp…" value={q}
          onChange={e => { setQ(e.target.value); setAbierto(true); }} onFocus={() => setAbierto(true)} aria-label="Buscar cliente" />
      </div>
      {abierto && q.trim() && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-xl max-h-64 overflow-y-auto">
          {res.map(c => (
            <button key={c.id} type="button" onClick={() => { onChange(c); setAbierto(false); setQ(''); }}
              className="w-full text-left px-3 py-2 hover:bg-muted">
              <div className="text-sm">{c.nombre}</div>
              <div className="text-[11px] text-muted-foreground">{[c.dni && `DNI ${c.dni}`, c.whatsapp && `WA ${c.whatsapp}`].filter(Boolean).join(' · ')}</div>
            </button>
          ))}
          {res.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Sin resultados.</div>}
          <button type="button" onClick={() => setAlta(true)} className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted border-t border-border flex items-center gap-1.5">
            <UserPlus className="w-4 h-4" /> Nuevo cliente{q.trim() ? ` "${q.trim()}"` : ''}
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  CRUD DE CLIENTES / PROVEEDORES
// ══════════════════════════════════════════════════════════════════
function Contactos({ tipo, complexId, toast, gestion }) {
  const api = tipo === 'cliente'
    ? { list: cantinaService.listClientes, create: cantinaService.createCliente, update: cantinaService.updateCliente, remove: cantinaService.deleteCliente }
    : { list: cantinaService.listProveedores, create: cantinaService.createProveedor, update: cantinaService.updateProveedor, remove: cantinaService.deleteProveedor };
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [catalogo, setCatalogo] = useState(null);   // proveedor cuyo catálogo se edita

  const cargar = useCallback(() => api.list(complexId, { q: q.trim() || undefined }).then(setRows).catch(() => setRows([])), [complexId, q, tipo]);
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t); }, [cargar]);

  const guardar = async (d) => {
    if (form.id) await api.update(complexId, form.id, d); else await api.create(complexId, d);
    setForm(null); cargar(); toast('success', 'Guardado.');
  };
  const eliminar = async (r) => {
    if (!confirm(`¿Eliminar a ${r.nombre}?`)) return;
    try { const x = await api.remove(complexId, r.id); toast('success', x.message || 'Eliminado.'); cargar(); } catch (e) { toast('error', errMsg(e)); }
  };

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="input pl-9" value={q} onChange={e => setQ(e.target.value)}
            placeholder={tipo === 'cliente' ? 'Buscar por nombre, DNI o WhatsApp…' : 'Buscar por nombre, contacto o WhatsApp…'} />
        </div>
        {!form && <button className="btn-primary text-sm flex items-center gap-1" onClick={() => setForm({})}><Plus className="w-4 h-4" /> {tipo === 'cliente' ? 'Cliente' : 'Proveedor'}</button>}
      </div>
      {form && <ContactoForm tipo={tipo} inicial={form} onCancel={() => setForm(null)} onSave={guardar} />}
      {catalogo && <CatalogoProveedor complexId={complexId} proveedor={catalogo} toast={toast} onClose={() => setCatalogo(null)} />}
      {rows?.length === 0 && <div className="card text-center text-sm text-muted-foreground py-8">Sin {tipo === 'cliente' ? 'clientes' : 'proveedores'}.</div>}
      <div className="space-y-1.5">
        {rows?.map(r => (
          <div key={r.id} className="card py-2.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{r.nombre} {r.estado === 'inactivo' && <span className="badge-red ml-1">Inactivo</span>}</div>
              <div className="text-xs text-muted-foreground truncate">
                {[r.contacto, r.dni && `DNI ${r.dni}`, r.whatsapp && `WA ${r.whatsapp}`, r.email].filter(Boolean).join(' · ')}
              </div>
            </div>
            {r.whatsapp && (
              <a href={`https://wa.me/${r.whatsapp}`} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:bg-green-500/10 text-green-400" aria-label="Abrir WhatsApp"><MessageCircle className="w-4 h-4" /></a>
            )}
            {tipo === 'proveedor' && (
              <button className="btn-outline text-xs !px-2 !py-1 flex items-center gap-1" onClick={() => setCatalogo(r)}>
                <Tags className="w-3.5 h-3.5" /> Productos y precios
              </button>
            )}
            <button className="p-1.5 rounded hover:bg-muted" aria-label="Editar" onClick={() => setForm(r)}><Pencil className="w-4 h-4" /></button>
            {(gestion || tipo === 'proveedor') && (
              <button className="p-1.5 rounded hover:bg-red-500/10 text-red-400" aria-label="Eliminar" onClick={() => eliminar(r)}><Trash2 className="w-4 h-4" /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactoForm({ tipo, inicial = {}, onSave, onCancel }) {
  const [f, setF] = useState({ nombre: '', contacto: '', dni: '', whatsapp: '', email: '', estado: 'activo', ...inicial });
  const [error, setError] = useState('');
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setError('');
    const { nombre, whatsapp, email, estado } = f;
    const d = { nombre, whatsapp, email, estado, ...(tipo === 'cliente' ? { dni: f.dni } : { contacto: f.contacto }) };
    try { await onSave(d); } catch (err) { setError(errMsg(err)); }
  };
  return (
    <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-2">
      <input className="input" placeholder={tipo === 'cliente' ? 'Nombre y apellido' : 'Razón social / nombre'} value={f.nombre} onChange={e => set('nombre', e.target.value)} required />
      {tipo === 'cliente'
        ? <input className="input" inputMode="numeric" placeholder="DNI" value={f.dni || ''} onChange={e => set('dni', e.target.value)} />
        : <input className="input" placeholder="Persona de contacto" value={f.contacto || ''} onChange={e => set('contacto', e.target.value)} />}
      <input className="input" inputMode="tel" placeholder="WhatsApp con código de país (5493811234567)" value={f.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} />
      <input className="input" type="email" placeholder="Email" value={f.email || ''} onChange={e => set('email', e.target.value)} />
      {inicial.id && (
        <select className="input" value={f.estado} onChange={e => set('estado', e.target.value)}>
          <option value="activo">Activo</option><option value="inactivo">Inactivo</option>
        </select>
      )}
      {error && <p className="sm:col-span-2 text-sm text-red-400">{error}</p>}
      <div className="sm:col-span-2 flex gap-2">
        <button className="btn-primary text-sm">Guardar</button>
        <button type="button" className="btn-outline text-sm" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

/** Panel lateral (pantalla completa en el celular). */
function Panel({ titulo, onClose, children }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-lg h-full overflow-y-auto bg-background border-l border-border p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4 sticky -top-4 sm:-top-5 bg-background py-2 z-10">
          <h3 className="font-bold">{titulo}</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
