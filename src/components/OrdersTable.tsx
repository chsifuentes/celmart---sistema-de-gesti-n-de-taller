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
  Inbox
} from 'lucide-react';
import { Order, OrderStatus } from '../types';

interface OrdersTableProps {
  orders: Order[];
  selectedFilter: string;
  setSelectedFilter: (filter: string) => void;
  onSelectOrder: (order: Order) => void;
  onPrintTicket: (order: Order) => void;
  onOpenWhatsApp: (order: Order) => void;
  onUpdateOrderStatus: (orderId: string, newStatus: OrderStatus) => void;
}

export const OrdersTable: React.FC<OrdersTableProps> = ({
  orders,
  selectedFilter,
  setSelectedFilter,
  onSelectOrder,
  onPrintTicket,
  onOpenWhatsApp,
  onUpdateOrderStatus,
}) => {
  const [tableSearch, setTableSearch] = useState('');
  const [openStatusDropdownId, setOpenStatusDropdownId] = useState<string | null>(null);

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
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-800/80 bg-[#111114]">
              <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold w-24">
                ID
              </th>
              <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold">
                CLIENTE
              </th>
              <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold">
                DISPOSITIVO
              </th>
              <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold">
                ESTADO
              </th>
              <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold">
                TÉCNICO
              </th>
              <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold">
                INGRESO
              </th>
              <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold text-right">
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
                  <td className="py-3.5 px-4 font-mono font-medium">
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
                  <td className="py-3.5 px-4">
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
                  <td className="py-3.5 px-4">
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
                  <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
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
                        onClick={() => onOpenWhatsApp(order)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/60 transition-colors"
                        title="Enviar actualización WhatsApp"
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
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
