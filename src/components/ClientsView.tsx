import React, { useState } from 'react';
import { Search, Plus, UserPlus, Phone, Mail, Wrench, DollarSign, X, Check, ArrowRight, Inbox, MessageSquare } from 'lucide-react';
import { Client, Order, WhatsAppTemplateKey } from '../types';
import { formatWhatsAppPhone } from '../lib/whatsapp';

interface ClientsViewProps {
  clients: Client[];
  orders: Order[];
  onAddClient: (newClient: Omit<Client, 'id' | 'reparacionesRealizadas' | 'saldoPendiente' | 'ultimaVisita'>) => void;
  onSelectClientOrders: (clientName: string) => void;
  onOpenWhatsApp?: (order: Order, templateKey?: WhatsAppTemplateKey) => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  clients,
  orders,
  onAddClient,
  onSelectClientOrders,
  onOpenWhatsApp,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Client Form State
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [dispositivoHabitual, setDispositivoHabitual] = useState('');

  const filteredClients = clients.filter((c) => {
    const term = searchTerm.toLowerCase();
    return (
      c.nombre.toLowerCase().includes(term) ||
      c.telefono.includes(term) ||
      c.email.toLowerCase().includes(term)
    );
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !telefono.trim()) return;

    onAddClient({
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      email: email.trim() || 'sin-correo@cliente.com',
      dispositivosFrecuentes: dispositivoHabitual ? [dispositivoHabitual.trim()] : ['Dispositivo móvil'],
    });

    setNombre('');
    setTelefono('');
    setEmail('');
    setDispositivoHabitual('');
    setIsAddModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Directorio de Clientes</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Gestión de historial técnico, datos de contacto y saldos de clientes CelMart.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, teléfono o email..."
              className="w-full bg-[#1c1c20] text-zinc-100 placeholder-zinc-400 text-xs pl-9 pr-3 py-2 rounded-lg border border-zinc-700/60 focus:outline-none focus:border-zinc-500 font-sans"
            />
          </div>

          <button
            id="btn-add-client-modal"
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-zinc-100 hover:bg-white text-zinc-950 px-3.5 py-2 rounded-lg font-semibold text-xs shadow-sm transition-all shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Agregar Cliente</span>
          </button>
        </div>
      </div>

      {/* Clients Table */}
      <div className="bg-[#161619] border border-zinc-800/80 rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-zinc-800/80 bg-[#111114]">
                <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold whitespace-nowrap">
                  CLIENTE
                </th>
                <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold whitespace-nowrap">
                  CONTACTO
                </th>
                <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold text-center whitespace-nowrap">
                  REPARACIONES
                </th>
                <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold whitespace-nowrap">
                  SALDO PENDIENTE
                </th>
                <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold whitespace-nowrap">
                  ÚLTIMA VISITA
                </th>
                <th className="py-3 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold text-right whitespace-nowrap">
                  HISTORIAL
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-xs">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Inbox className="w-8 h-8 text-zinc-600 stroke-[1.5]" />
                      <p className="text-xs font-mono text-zinc-500 max-w-sm">
                        {clients.length === 0
                          ? 'No hay clientes registrados.'
                          : 'No se encontraron clientes registrados con ese criterio.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => {
                  const clientOrders = orders.filter((o) => o.cliente.nombre === client.nombre);
                  return (
                    <tr
                      key={client.id}
                      className="hover:bg-zinc-800/60 transition-colors group"
                    >
                      {/* Cliente */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#1c1c20] border border-zinc-700/60 flex items-center justify-center font-mono font-bold text-xs text-zinc-200">
                            {client.nombre.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                          </div>
                          <div>
                            <p className="font-semibold text-zinc-100 group-hover:text-white">
                              {client.nombre}
                            </p>
                            <p className="text-[11px] text-zinc-400">
                              {client.dispositivosFrecuentes.join(', ')}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Contacto */}
                      <td className="py-3 px-4 font-mono">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-zinc-200 flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-zinc-400" />
                            {client.telefono}
                          </span>
                          <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                            <Mail className="w-3 h-3 text-zinc-400" />
                            {client.email}
                          </span>
                        </div>
                      </td>

                      {/* Reparaciones */}
                      <td className="py-3 px-4 text-center font-mono font-semibold text-zinc-200">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#1c1c20] border border-zinc-700/60 text-xs">
                          {client.reparacionesRealizadas || clientOrders.length}
                        </span>
                      </td>

                      {/* Saldo */}
                      <td className="py-3 px-4 font-mono">
                        {client.saldoPendiente > 0 ? (
                          <span className="text-rose-400 font-semibold">
                            ${client.saldoPendiente.toLocaleString()} MXN
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-medium">Al corriente ($0)</span>
                        )}
                      </td>

                      {/* Última Visita */}
                      <td className="py-3 px-4 font-mono text-zinc-400 text-[11px]">
                        {client.ultimaVisita}
                      </td>

                      {/* Historial */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {client.telefono && (
                            <button
                              type="button"
                              onClick={() => {
                                if (clientOrders.length > 0 && onOpenWhatsApp) {
                                  onOpenWhatsApp(clientOrders[0]);
                                } else {
                                  const clean = formatWhatsAppPhone(client.telefono);
                                  const msg = encodeURIComponent(`Hola ${client.nombre}, te saludamos de CelMart Servicio Técnico.`);
                                  window.open(`https://wa.me/${clean}?text=${msg}`, '_blank');
                                }
                              }}
                              className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 bg-emerald-950/30 hover:bg-emerald-900/50 border border-emerald-800/50 transition-colors"
                              title="Contactar por WhatsApp"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => onSelectClientOrders(client.nombre)}
                            className="inline-flex items-center gap-1 text-xs text-zinc-300 hover:text-white bg-[#1c1c20] hover:bg-zinc-800 border border-zinc-700/60 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            <span>Ver Órdenes</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: + Agregar Cliente */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161619] border border-zinc-700/80 rounded-lg w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-zinc-300" />
                <h3 className="text-sm font-semibold text-zinc-100">Registrar Nuevo Cliente</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                  NOMBRE COMPLETO *
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Gabriela Castro Morales"
                  className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                  TELÉFONO / WHATSAPP *
                </label>
                <input
                  type="tel"
                  required
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="+52 55 1234 5678"
                  className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                  CORREO ELECTRÓNICO
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@ejemplo.com"
                  className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                  DISPOSITIVO HABITUAL / NOTA
                </label>
                <input
                  type="text"
                  value={dispositivoHabitual}
                  onChange={(e) => setDispositivoHabitual(e.target.value)}
                  placeholder="Ej: iPhone 14 Pro / iPad Air"
                  className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold transition-colors"
                >
                  Guardar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
