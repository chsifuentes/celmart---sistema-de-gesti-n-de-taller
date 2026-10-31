import React, { useState } from 'react';
import { 
  Eye, 
  Printer, 
  Smartphone, 
  Laptop, 
  Tablet, 
  Search, 
  MessageSquare,
  ChevronDown,
  Inbox,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { Order, OrderStatus, WhatsAppTemplateKey } from '../types';
import { determineTemplateKeyForStatus } from '../lib/whatsapp';

interface OrdersTableProps {
  orders: Order[];
  selectedFilter: string;
  setSelectedFilter: (filter: string) => void;
  onSelectOrder: (order: Order) => void;
  onPrintTicket: (order: Order) => void;
  onOpenWhatsApp: (order: Order, templateKey?: WhatsAppTemplateKey) => void;
  onUpdateOrderStatus: (orderId: string, newStatus: OrderStatus) => void;
  onDeleteOrder?: (orderId: string) => void | Promise<void>;
}

export const OrdersTable: React.FC<OrdersTableProps> = ({
  orders,
  selectedFilter,
  setSelectedFilter,
  onSelectOrder,
  onPrintTicket,
  onOpenWhatsApp,
  onUpdateOrderStatus,
  onDeleteOrder,
}) => {
  const [tableSearch, setTableSearch] = useState('');
  const [openStatusDropdownId, setOpenStatusDropdownId] = useState<string | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filterTabs = [
    'Todos',
    'Recibido',
    'En Diagnóstico',
    'Esperando Repuesto',
    'En Reparación',
    'Listo',
  ];

  // Filtering logic
  const filteredOrders = orders.filter((order) => {
    const matchesTab =
      selectedFilter === 'Todos' || order.estado === selectedFilter;

    const term = tableSearch.toLowerCase().trim();
    const matchesSearch =
      !term ||
      order.id.toLowerCase().includes(term) ||
      order.cliente.nombre.toLowerCase().includes(term) ||
      order.cliente.telefono.includes(term) ||
      order.dispositivo.modelo.toLowerCase().includes(term) ||
      order.dispositivo.imei.toLowerCase().includes(term) ||
      (order.tecnico?.nombre.toLowerCase().includes(term) ?? false);

    return matchesTab && matchesSearch;
  });

  const getDeviceIcon = (model: string, marca: string) => {
    const m = (model + ' ' + marca).toLowerCase();
    if (m.includes('macbook') || m.includes('laptop') || m.includes('xps') || m.includes('dell') || m.includes('pc')) {
      return <Laptop className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />;
    }
    if (m.includes('ipad') || m.includes('tab') || m.includes('tablet')) {
      return <Tablet className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />;
    }
    return <Smartphone className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />;
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'Listo':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#1c1c20] text-zinc-200 border border-zinc-700/60">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            Listo
          </span>
        );
      case 'En Reparación':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#1c1c20] text-zinc-200 border border-zinc-700/60">
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            En Reparación
          </span>
        );
      case 'En Diagnóstico':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#1c1c20] text-zinc-200 border border-zinc-700/60">
            <span className="w-2 h-2 rounded-full bg-sky-400"></span>
            En Diagnóstico
          </span>
        );
      case 'Esperando Repuesto':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#1c1c20] text-zinc-200 border border-zinc-700/60">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            Esperando Repuesto
          </span>
        );
      case 'Esperando Presupuesto':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#1c1c20] text-zinc-200 border border-zinc-700/60">
            <span className="w-2 h-2 rounded-full bg-orange-400"></span>
            Esperando Presupuesto
          </span>
        );
      case 'Entregado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#1c1c20] text-zinc-400 border border-zinc-800">
            <span className="w-2 h-2 rounded-full bg-zinc-500"></span>
            Entregado
          </span>
        );
      case 'Recibido':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#1c1c20] text-zinc-200 border border-zinc-700/60">
            <span className="w-2 h-2 rounded-full bg-zinc-400"></span>
            Recibido
          </span>
        );
    }
  };

  const statusOptions: OrderStatus[] = [
    'Recibido',
    'En Diagnóstico',
    'Esperando Repuesto',
    'En Reparación',
    'Listo',
    'Entregado',
  ];

  return (
    <div className="bg-[#161619] border border-zinc-800/80 rounded-lg overflow-hidden flex flex-col shadow-sm">
      {/* Table Header Controls */}
      <div className="p-4 sm:p-5 border-b border-zinc-800/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
              Estado de Reparaciones
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {filteredOrders.length} de {orders.length} órdenes activas
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Filtrar tabla..."
              className="w-full bg-[#1c1c20] text-zinc-100 placeholder-zinc-400 text-xs pl-8 pr-3 py-1.5 rounded-lg border border-zinc-700/60 focus:outline-none focus:border-zinc-500 font-sans"
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {filterTabs.map((tab) => {
            const isSelected = selectedFilter === tab;
            return (
              <button
                key={tab}
                id={`filter-tab-${tab.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={() => setSelectedFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                  isSelected
                    ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                    : 'bg-[#1c1c20] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 border border-zinc-700/60'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead>
            <tr className="border-b border-zinc-800/80 bg-[#111114]">
              <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold w-24 whitespace-nowrap">
                ID
              </th>
              <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold whitespace-nowrap">
                CLIENTE
              </th>
              <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold whitespace-nowrap">
                DISPOSITIVO
              </th>
              <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold whitespace-nowrap">
                ESTADO
              </th>
              <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold whitespace-nowrap">
                TÉCNICO
              </th>
              <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold whitespace-nowrap">
                INGRESO
              </th>
              <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold text-right whitespace-nowrap">
                ACCIONES
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 text-xs">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-14 text-center">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Inbox className="w-8 h-8 text-zinc-600 stroke-[1.5]" />
                    <p className="text-xs font-mono text-zinc-500 max-w-sm">
                      {orders.length === 0
                        ? 'No hay órdenes de servicio activas. Haz clic en + Nueva Orden para comenzar.'
                        : 'No se encontraron órdenes con el filtro o término de búsqueda seleccionado.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  id={`order-row-${order.id}`}
                  className="hover:bg-zinc-800/60 transition-colors group cursor-pointer"
                  onClick={() => onSelectOrder(order)}
                >
                  {/* ID */}
                  <td className="py-3.5 px-4 font-mono font-medium whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {order.prioridadUrgente ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title="Urgente" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-transparent" />
                      )}
                      <span className={order.prioridadUrgente ? 'text-zinc-100 font-semibold' : 'text-zinc-300'}>
                        {order.id}
                      </span>
                    </div>
                  </td>

                  {/* CLIENTE */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-semibold text-zinc-100 group-hover:text-white transition-colors">
                        {order.cliente.nombre}
                      </span>
                      <span className="text-xs font-mono text-zinc-400 mt-0.5">
                        {order.cliente.telefono}
                      </span>
                    </div>
                  </td>

                  {/* DISPOSITIVO */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="flex items-start gap-2.5">
                      {getDeviceIcon(order.dispositivo.modelo, order.dispositivo.marca)}
                      <div className="flex flex-col">
                        <span className="font-medium text-zinc-100">
                          {order.dispositivo.modelo}
                        </span>
                        <span className="text-xs font-mono text-zinc-400 mt-0.5">
                          IMEI: {order.dispositivo.imei}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* ESTADO (with subtle pill & quick switch) */}
                  <td className="py-3.5 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="relative inline-block">
                      <button
                        onClick={() => setOpenStatusDropdownId(openStatusDropdownId === order.id ? null : order.id)}
                        className="flex items-center gap-1 hover:opacity-90 transition-opacity"
                        title="Cambiar estado rápido"
                      >
                        {getStatusBadge(order.estado)}
                        <ChevronDown className="w-3 h-3 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>

                      {openStatusDropdownId === order.id && (
                        <div className="absolute left-0 mt-1 w-44 rounded-lg bg-[#161619] border border-zinc-700/80 shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                          <div className="px-2.5 py-1 text-[10px] font-mono uppercase text-zinc-400 border-b border-zinc-800">
                            Cambiar Estado
                          </div>
                          {statusOptions.map((st) => (
                            <button
                              key={st}
                              onClick={() => {
                                onUpdateOrderStatus(order.id, st);
                                setOpenStatusDropdownId(null);
                                // Disparar modal de confirmación WhatsApp con la plantilla correspondiente al nuevo estado
                                onOpenWhatsApp({ ...order, estado: st }, determineTemplateKeyForStatus(st));
                              }}
                              className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-zinc-800/80 flex items-center justify-between ${
                                order.estado === st ? 'text-zinc-100 font-semibold bg-zinc-800/60' : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              <span>{st}</span>
                              {order.estado === st && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* TÉCNICO */}
                  <td className="py-3.5 px-4">
                    {order.tecnico ? (
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[#1c1c20] border border-zinc-700/60 flex items-center justify-center text-[10px] font-mono font-semibold text-zinc-200">
                          {order.tecnico.iniciales}
                        </span>
                        <span className="text-zinc-200 font-medium truncate">
                          {order.tecnico.nombre}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-zinc-500">
                        <span className="w-6 h-6 rounded-full bg-[#1c1c20] border border-zinc-800 flex items-center justify-center text-[10px] font-mono text-zinc-400">
                          —
                        </span>
                        <span className="italic text-zinc-400 text-xs">Sin asignar</span>
                      </div>
                    )}
                  </td>

                  {/* INGRESO */}
                  <td className="py-3.5 px-4 font-mono text-zinc-400 text-xs whitespace-nowrap">
                    {order.ingreso}
                  </td>

                  {/* ACCIONES */}
                  <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      {/* WhatsApp quick contact */}
                      <button
                        onClick={() => onOpenWhatsApp(order, determineTemplateKeyForStatus(order.estado))}
                        className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 bg-emerald-950/30 hover:bg-emerald-900/50 border border-emerald-800/50 transition-colors shadow-xs"
                        title="Enviar notificación por WhatsApp al cliente"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>

                      {/* View dossier drawer */}
                      <button
                        onClick={() => onSelectOrder(order)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
                        title="Ver Ficha Técnica del Dispositivo"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {/* Print thermal ticket */}
                      <button
                        onClick={() => onPrintTicket(order)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
                        title="Imprimir Ticket de Recepción"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      {/* Delete order */}
                      <button
                        onClick={() => setOrderToDelete(order)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-950/30 border border-transparent hover:border-rose-900/40 transition-colors"
                        title="Eliminar Orden de Servicio"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Confirmación para Eliminar Ticket */}
      {orderToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => {
            if (!isDeleting) setOrderToDelete(null);
          }}
        >
          <div 
            className="bg-[#161619] border border-zinc-700/80 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-full bg-rose-950/60 border border-rose-800/60 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1.5 min-w-0 flex-1">
                <h3 className="text-base font-bold text-zinc-100">
                  ¿Eliminar orden {orderToDelete.id}?
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Estás a punto de eliminar definitivamente la orden de reparación de{' '}
                  <strong className="text-white font-semibold">{orderToDelete.cliente.nombre}</strong>.
                </p>
                <div className="bg-[#1c1c20] border border-zinc-800/90 rounded-lg p-3 text-xs text-zinc-400 font-mono space-y-1 mt-2">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Folio:</span>
                    <span className="text-zinc-200 font-semibold">{orderToDelete.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Dispositivo:</span>
                    <span className="text-zinc-200">{orderToDelete.dispositivo.marca} {orderToDelete.dispositivo.modelo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">IMEI:</span>
                    <span className="text-zinc-300">{orderToDelete.dispositivo.imei || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Estado actual:</span>
                    <span className="text-amber-400 font-medium">{orderToDelete.estado}</span>
                  </div>
                </div>
                <p className="text-[11px] text-rose-400 font-mono pt-1">
                  Esta acción es irreversible y eliminará el registro de la base de datos.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setOrderToDelete(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700/80 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  try {
                    setIsDeleting(true);
                    if (onDeleteOrder) {
                      await onDeleteOrder(orderToDelete.id);
                    }
                    setOrderToDelete(null);
                  } catch (err) {
                    console.error('Error eliminando orden:', err);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Eliminando...' : 'Eliminar Definitivamente'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
