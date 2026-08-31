import React, { useState, useRef, useEffect } from 'react';
import { Search, Plus, Bell, Command, CheckCircle2, AlertTriangle, ShieldCheck, X, LogOut, Lock } from 'lucide-react';

interface HeaderProps {
  globalSearch: string;
  setGlobalSearch: (q: string) => void;
  onOpenNewOrder: () => void;
  notificationsCount?: number;
  urgentOrdersCount: number;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  globalSearch,
  setGlobalSearch,
  onOpenNewOrder,
  urgentOrdersCount,
  onLogout,
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
    <header className="h-16 border-b border-zinc-800/80 bg-[#161619] px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
      {/* Global Search Bar */}
      <div className="flex-1 max-w-xl">
        <div className="relative group">
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
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        {/* Notifications Popover Toggle */}
        <div className="relative">
          <button
            id="btn-notifications"
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-lg text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 border border-zinc-700/60 transition-colors relative bg-[#1c1c20]"
            title="Notificaciones y Alertas"
          >
            <Bell className="w-4 h-4" />
            {urgentOrdersCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
            )}
            {urgentOrdersCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500"></span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-lg bg-[#161619] border border-zinc-800/80 shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80 mb-2">
                <span className="text-xs font-semibold text-zinc-100">Alertas del Taller</span>
                <span className="text-[10px] font-mono text-zinc-400 uppercase">En tiempo real</span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
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
          className="flex items-center gap-2 bg-zinc-100 hover:bg-white text-zinc-950 px-3.5 py-2 rounded-lg font-semibold text-xs shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99]"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Orden de Servicio</span>
        </button>

        {/* User Info Avatar Badge & Lock Action */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-zinc-800/80">
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
              className="p-1.5 ml-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 border border-transparent hover:border-zinc-700/60 transition-colors"
              title="Bloquear terminal / Cerrar sesión"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
