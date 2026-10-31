import React, { useState, useRef, useEffect } from 'react';
import { Search, Plus, Bell, Command, CheckCircle2, AlertTriangle, ShieldCheck, X, LogOut, Lock, Menu } from 'lucide-react';

import type { ShiftRole } from '../lib/operations';
interface HeaderProps {
  warrantyNotifications?: {id:string; technician:string}[];
  onOpenWarranty?: (id:string)=>void;
  shiftRole?: ShiftRole;
  onShiftRoleChange?: (role: ShiftRole) => void;
  globalSearch: string;
  setGlobalSearch: (q: string) => void;
  onOpenNewOrder: () => void;
  notificationsCount?: number;
  urgentOrdersCount: number;
  onLogout?: () => void;
  onToggleMobileMenu?: () => void;
  viewMode: 'recepcion' | 'taller';
  onViewModeChange: (mode: 'recepcion' | 'taller') => void;
}

export const Header: React.FC<HeaderProps> = ({
  warrantyNotifications = [], onOpenWarranty,
  shiftRole = 'administrador', onShiftRoleChange,
  globalSearch,
  setGlobalSearch,
  onOpenNewOrder,
  urgentOrdersCount,
  onLogout,
  onToggleMobileMenu,
  viewMode,
  onViewModeChange,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global shortcut ⌘K or / to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="border-b border-zinc-800/80 bg-[#161619] px-3 md:px-6 py-2.5 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 sticky top-0 z-20">
      <label className="text-xs shrink-0">Perfil del turno<select aria-label="Perfil del turno" value={shiftRole} onChange={e=>onShiftRoleChange?.(e.target.value as ShiftRole)} className="block bg-zinc-800 p-2 rounded"><option value="recepcion">Recepción / Mostrador</option><option value="tecnico">Técnico Laboratorio</option><option value="administrador">Administrador</option></select></label>
      <div role="group" aria-label="Modo de operación" className="flex shrink-0 rounded-xl border border-zinc-700 bg-zinc-950 p-1">
        <button type="button" aria-pressed={viewMode === 'recepcion'} onClick={() => onViewModeChange('recepcion')} className={`min-h-11 flex-1 whitespace-nowrap px-3 rounded-lg text-xs font-semibold transition-colors ${viewMode === 'recepcion' ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-white'}`}>🖥️ Recepción</button>
        <button type="button" aria-pressed={viewMode === 'taller'} onClick={() => onViewModeChange('taller')} className={`min-h-11 flex-1 whitespace-nowrap px-3 rounded-lg text-xs font-semibold transition-colors ${viewMode === 'taller' ? 'bg-teal-400 text-zinc-950' : 'text-zinc-400 hover:text-white'}`}>📱 Modo Taller</button>
      </div>
      {/* Mobile Top Bar (Row 1 on mobile, Right side on desktop) */}
      <div className="flex items-center justify-between gap-2 w-full xl:w-auto xl:order-3">
        {/* Left Mobile: Hamburger + Brand (Hidden on desktop) */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            id="btn-mobile-menu"
            onClick={onToggleMobileMenu}
            className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/60 border border-zinc-700/60 md:hidden shrink-0"
            title="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-lg bg-[#1c1c20] border border-zinc-700/60 flex items-center justify-center font-bold text-[11px] font-mono text-zinc-100 shadow-sm">
              CM
            </div>
            <span className="font-semibold text-zinc-100 tracking-tight text-xs uppercase font-sans">
              CELMART
            </span>
          </div>
        </div>

        {/* Right Actions: Notifications, + Nueva Orden, Avatar & Lock */}
        <div className="flex items-center gap-2 sm:gap-3 ml-auto">
          {/* Notifications Popover Toggle */}
          <div className="relative">
            <button
              id="btn-notifications"
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-lg text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 border border-zinc-700/60 transition-colors relative bg-[#1c1c20]"
              title="Notificaciones y Alertas"
            >
              <Bell className="w-4 h-4" />
              {urgentOrdersCount + warrantyNotifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
              )}
              {urgentOrdersCount + warrantyNotifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500"></span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-lg bg-[#161619] border border-zinc-800/80 shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80 mb-2">
                  <span className="text-xs font-semibold text-zinc-100">Alertas del Taller</span>
                  <span className="text-[10px] font-mono text-zinc-400 uppercase">En tiempo real</span>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {warrantyNotifications.map(item=><button key={item.id} onClick={()=>{onOpenWarranty?.(item.id);setShowNotifications(false);}} className="block w-full text-left p-3 rounded bg-purple-950 text-purple-200">{item.id} · Reingreso por garantía para {item.technician}</button>)}
                  <div className="p-2.5 rounded-lg bg-[#1c1c20] border border-zinc-800/80 text-xs flex gap-2.5 items-start">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-zinc-100 font-medium text-[11px]">3 Órdenes Urgentes Activas</p>
                      <p className="text-zinc-400 text-[10px] mt-0.5">OS-2418, OS-2413 y OS-2410 requieren atención prioritaria.</p>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#1c1c20] border border-zinc-800/80 text-xs flex gap-2.5 items-start">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-zinc-100 font-medium text-[11px]">Repuestos Recibidos</p>
                      <p className="text-zinc-400 text-[10px] mt-0.5">Lote de 25 puertos Type-C ingresados a stock.</p>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#1c1c20] border border-zinc-800/80 text-xs flex gap-2.5 items-start">
                    <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-zinc-100 font-medium text-[11px]">Garantías en Vigor</p>
                      <p className="text-zinc-400 text-[10px] mt-0.5">128 dispositivos con garantía vigente.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Primary Action: + Nueva Orden de Servicio */}
          <button
            id="btn-new-service-order"
            onClick={onOpenNewOrder}
            className="flex items-center gap-1.5 sm:gap-2 bg-zinc-100 hover:bg-white text-zinc-950 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg font-semibold text-xs shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nueva Orden de Servicio</span>
            <span className="sm:hidden">Nueva Orden</span>
          </button>

          {/* User Info Avatar Badge & Lock Action */}
          <div className="flex items-center gap-2 pl-2 border-l border-zinc-800/80">
            <div className="w-8 h-8 rounded-full bg-[#1c1c20] border border-zinc-700/60 flex items-center justify-center text-xs font-mono font-semibold text-zinc-200">
              CM
            </div>
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-semibold text-zinc-100 leading-tight">CelMart Taller</span>
              <span className="text-[10px] text-zinc-400 font-mono">Sesión activa</span>
            </div>

            {onLogout && (
              <button
                id="btn-lock-session"
                onClick={onLogout}
                className="p-1.5 ml-0.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 border border-transparent hover:border-zinc-700/60 transition-colors"
                title="Bloquear terminal / Cerrar sesión"
              >
                <Lock className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search Bar (Row 2 on mobile, Left side on desktop) */}
      {viewMode === 'recepcion' && <div className="w-full xl:flex-1 xl:max-w-xl xl:order-2">
        <div className="relative group w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-zinc-200 transition-colors" />
          <input
            ref={searchInputRef}
            id="global-search-input"
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Buscar cliente por nombre o equipo por IMEI..."
            className="w-full bg-[#1c1c20] text-zinc-100 placeholder-zinc-400 text-xs pl-10 pr-12 py-2 rounded-lg border border-zinc-700/60 focus:outline-none focus:border-zinc-500 transition-all font-sans"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {globalSearch ? (
              <button
                onClick={() => setGlobalSearch('')}
                className="text-zinc-400 hover:text-zinc-200 p-0.5"
                title="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 bg-zinc-800/90 border border-zinc-700/60 rounded">
                <Command className="w-2.5 h-2.5" /> K
              </kbd>
            )}
          </div>
        </div>
      </div>}
    </header>
  );
};
