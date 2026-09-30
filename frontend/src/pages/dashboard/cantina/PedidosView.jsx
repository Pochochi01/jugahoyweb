import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, Plus, Minus, X, Trash2, Pencil, Copy, Check, MessageCircle, Truck, Users, ClipboardList,
  PackageCheck, Ban, UserPlus, ChevronRight,
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
  const [contacto, setContacto] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [items, setItems] = useState([]);           // [{ producto, cantidad, precio }]
  const [qProd, setQProd] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cantinaService.listProductos(complexId).then(setProductos).catch(() => {});
    if (tipo === 'proveedor') cantinaService.listProveedores(complexId, { estado: 'activo' }).then(setProveedores).catch(() => {});
  }, [complexId, tipo]);

  const campoPrecio = tipo === 'proveedor' ? 'precio_costo' : 'precio_venta';
  const sugeridos = useMemo(() => {
    const q = normalize(qProd.trim());
    if (!q) return [];
    return productos.filter(p => p.activo !== false && normalize(p.nombre).includes(q)).slice(0, 8);
  }, [productos, qProd]);

  const agregar = (p) => {
    setItems(its => {
      const i = its.findIndex(x => x.producto.id === p.id);
      if (i >= 0) return its.map((x, j) => (j === i ? { ...x, cantidad: Number(x.cantidad) + 1 } : x));
      return [...its, { producto: p, cantidad: 1, precio: Number(p[campoPrecio]) }];
    });
    setQProd('');
  };
  const setItem = (i, k, v) => setItems(its => its.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const total = items.reduce((a, i) => a + Number(i.cantidad || 0) * Number(i.precio || 0), 0);

  const guardar = async () => {
    setError('');
    if (!contacto) return setError(`Elegí ${tipo === 'cliente' ? 'un cliente' : 'un proveedor'}.`);
    if (!items.length) return setError('Agregá al menos un producto.');
    if (items.some(i => !(Number(i.cantidad) > 0))) return setError('Las cantidades deben ser mayores a 0.');
    // Venta: avisar (no bloquear) si hoy no alcanza el stock; se valida al entregar
    setGuardando(true);
    try {
      const p = await cantinaService.createPedido(complexId, tipo, {
        [tipo === 'cliente' ? 'cliente_id' : 'proveedor_id']: contacto.id,
        notas,
        items: items.map(i => ({ producto_id: i.producto.id, cantidad: Number(i.cantidad), precio_unitario: Number(i.precio) })),
      });
      onCreado(p);
    } catch (e) { setError(errMsg(e)); } finally { setGuardando(false); }
  };

  return (
    <Panel titulo={tipo === 'cliente' ? 'Nuevo pedido de cliente' : 'Nuevo pedido a proveedor'} onClose={onClose}>
      <div className="space-y-4">
        {/* Contacto */}
        {tipo === 'cliente'
          ? <ClienteBuscador complexId={complexId} value={contacto} onChange={setContacto} />
          : (
            <label className="block">
              <span className="text-xs text-muted-foreground">Proveedor</span>
              <select className="input" value={contacto?.id || ''} onChange={e => setContacto(proveedores.find(p => p.id === Number(e.target.value)) || null)}>
                <option value="">Elegí un proveedor…</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.contacto ? ` (${p.contacto})` : ''}</option>)}
              </select>
              {proveedores.length === 0 && <span className="text-[11px] text-amber-400">No hay proveedores activos: cargalos en "Proveedores".</span>}
            </label>
          )}

        {/* Productos */}
        <div>
          <span className="text-xs text-muted-foreground">Productos</span>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="input pl-9" placeholder="Buscar producto para agregar…" value={qProd} onChange={e => setQProd(e.target.value)} />
            {sugeridos.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-xl max-h-64 overflow-y-auto">
                {sugeridos.map(p => (
                  <button key={p.id} type="button" onClick={() => agregar(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between gap-2">
                    <span className="truncate">{p.nombre}</span>
                    <span className="text-xs text-muted-foreground shrink-0">stock {cant(p.stock)} · {money(p[campoPrecio])}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {items.length > 0 && (
          <div className="space-y-1.5">
            {items.map((i, idx) => {
              const faltaStock = tipo === 'cliente' && Number(i.cantidad) > Number(i.producto.stock);
              return (
                <div key={i.producto.id} className="flex items-center gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{i.producto.nombre}</div>
                    {faltaStock && <div className="text-[11px] text-amber-400">Hoy hay {cant(i.producto.stock)}: se valida al entregar</div>}
                  </div>
                  <button type="button" className="p-1 rounded hover:bg-muted" onClick={() => setItem(idx, 'cantidad', Math.max(1, Number(i.cantidad) - 1))} aria-label="Menos"><Minus className="w-3.5 h-3.5" /></button>
                  <input className="input !w-16 text-center !px-1" inputMode="decimal" value={i.cantidad} onChange={e => setItem(idx, 'cantidad', e.target.value)} aria-label="Cantidad" />
                  <button type="button" className="p-1 rounded hover:bg-muted" onClick={() => setItem(idx, 'cantidad', Number(i.cantidad) + 1)} aria-label="Más"><Plus className="w-3.5 h-3.5" /></button>
                  <input className="input !w-24 text-right !px-2" inputMode="decimal" value={i.precio} onChange={e => setItem(idx, 'precio', e.target.value)}
                    aria-label={tipo === 'proveedor' ? 'Costo unitario' : 'Precio unitario'} title={tipo === 'proveedor' ? 'Costo unitario' : 'Precio unitario'} />
                  <button type="button" className="p-1 text-red-400 hover:bg-red-500/10 rounded" onClick={() => setItems(its => its.filter((_, j) => j !== idx))} aria-label="Quitar"><Trash2 className="w-4 h-4" /></button>
                </div>
              );
            })}
            <div className="text-right text-sm font-semibold pt-1">Total {money(total)}</div>
          </div>
        )}

        <textarea className="input min-h-[60px]" placeholder="Notas (opcional): entrega, forma de pago…" value={notas} onChange={e => setNotas(e.target.value)} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={guardando} onClick={guardar}>{guardando ? 'Generando…' : 'Generar pedido'}</button>
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
