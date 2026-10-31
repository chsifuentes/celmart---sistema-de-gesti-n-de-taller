import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Command,
  LogOut,
  Menu,
  Monitor,
  Plus,
  Search,
  Smartphone,
  X,
} from 'lucide-react';

interface HeaderProps {
  globalSearch: string;
  setGlobalSearch: (query: string) => void;
  onOpenNewOrder: () => void;
  urgentOrdersCount: number;
  warrantyNotifications?: { id: string; technician: string }[];
  onOpenWarranty?: (id: string) => void;
  onLogout?: () => void;
  onToggleMobileMenu?: () => void;
  viewMode: 'recepcion' | 'taller';
  onViewModeChange: (mode: 'recepcion' | 'taller') => void;
}

export function Header({
  globalSearch,
  setGlobalSearch,
  onOpenNewOrder,
  urgentOrdersCount,
  warrantyNotifications = [],
  onOpenWarranty,
  onLogout,
  onToggleMobileMenu,
  viewMode,
  onViewModeChange,
}: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setShowNotifications(false);
        setShowAccount(false);
      }
    };
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!notificationRef.current?.contains(event.target))
        setShowNotifications(false);
      if (!accountRef.current?.contains(event.target)) setShowAccount(false);
    };
    window.addEventListener('keydown', keydown);
    document.addEventListener('pointerdown', dismiss);
    return () => {
      window.removeEventListener('keydown', keydown);
      document.removeEventListener('pointerdown', dismiss);
    };
  }, []);

  return (
    <header className="h-16 md:h-16 shrink-0 border-b border-zinc-800/80 bg-[#161619] px-3 md:px-6 flex items-center justify-between gap-2 md:gap-4 sticky top-0 z-20">
      <button
        id="btn-mobile-menu"
        type="button"
        onClick={onToggleMobileMenu}
        aria-label="Abrir menú"
        className="md:hidden shrink-0 p-1.5 rounded-md text-zinc-400 hover:text-zinc-100"
      >
        <Menu className="w-4 h-4" />
      </button>
      <div className="relative group min-w-0 flex-1 max-w-xl">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
        <input
          ref={searchInputRef}
          id="global-search-input"
          type="search"
          aria-label="Búsqueda global"
          value={globalSearch}
          onChange={(event) => setGlobalSearch(event.target.value)}
          placeholder="Buscar cliente por nombre o equipo por IMEI..."
          className="w-full h-8 bg-[#1c1c20] text-zinc-100 placeholder-zinc-500 text-xs pl-8 pr-7 sm:pr-12 rounded-md border border-zinc-700/60 focus:outline-none focus:border-zinc-500"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          {globalSearch ? (
            <button
              type="button"
              onClick={() => setGlobalSearch('')}
              aria-label="Limpiar búsqueda"
              className="text-zinc-500 hover:text-zinc-200"
            >
              <X className="w-3 h-3" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1 py-0.5 text-[10px] font-mono text-zinc-500 border border-zinc-700/60 rounded">
              <Command className="w-2.5 h-2.5" />K
            </kbd>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        <div
          role="group"
          aria-label="Modo de operación"
          className="inline-flex h-8 items-center rounded-md border border-zinc-700/60 bg-[#1c1c20] p-0.5"
        >
          {(
            [
              { mode: 'recepcion', label: 'Recepción', Icon: Monitor },
              { mode: 'taller', label: 'Taller', Icon: Smartphone },
            ] as const
          ).map(({ mode, label, Icon }) => (
            <button
              key={mode}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={viewMode === mode}
              onClick={() => onViewModeChange(mode)}
              className={`h-6 px-1.5 lg:px-2 inline-flex items-center gap-1.5 rounded text-xs transition-colors ${viewMode === mode ? 'bg-zinc-700/60 text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{label}</span>
            </button>
          ))}
        </div>
        <div ref={notificationRef} className="relative">
          <button
            id="btn-notifications"
            type="button"
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowAccount(false);
            }}
            aria-label="Notificaciones y alertas"
            aria-expanded={showNotifications}
            className="w-8 h-8 flex items-center justify-center rounded-md bg-[#1c1c20] border border-zinc-700/60 text-zinc-400 hover:text-zinc-100 relative"
          >
            <Bell className="w-3.5 h-3.5" />
            {urgentOrdersCount + warrantyNotifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg bg-[#161619] border border-zinc-800/80 shadow-xl p-3 z-50 text-xs">
              <p className="font-semibold text-zinc-200 pb-2 mb-2 border-b border-zinc-800/80">
                Alertas del taller
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {urgentOrdersCount > 0 && (
                  <p className="flex gap-2 text-zinc-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    {urgentOrdersCount} órdenes urgentes activas
                  </p>
                )}
                {warrantyNotifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onOpenWarranty?.(item.id);
                      setShowNotifications(false);
                    }}
                    className="block w-full text-left p-2 rounded-md bg-[#1c1c20] text-zinc-300"
                  >
                    <span className="font-mono">{item.id}</span> · Garantía para{' '}
                    {item.technician}
                  </button>
                ))}
                {!urgentOrdersCount && !warrantyNotifications.length && (
                  <p className="text-zinc-500">Sin alertas pendientes.</p>
                )}
              </div>
            </div>
          )}
        </div>
        <button
          id="btn-new-service-order"
          type="button"
          onClick={onOpenNewOrder}
          aria-label="Nueva Orden de Servicio"
          title="Nueva Orden de Servicio"
          className="h-8 px-2 sm:px-3 inline-flex items-center gap-1.5 bg-zinc-100 hover:bg-white text-zinc-950 rounded-md text-xs font-semibold whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline lg:hidden">Nueva Orden</span>
          <span className="hidden lg:inline">Nueva Orden de Servicio</span>
        </button>
        <div
          ref={accountRef}
          className="relative border-l border-zinc-800/80 pl-1.5 sm:pl-3"
        >
          <button
            type="button"
            aria-label="Cuenta del taller"
            aria-expanded={showAccount}
            onClick={() => {
              setShowAccount(!showAccount);
              setShowNotifications(false);
            }}
            className="w-8 h-8 rounded-full bg-[#1c1c20] border border-zinc-700/60 flex items-center justify-center text-xs font-mono text-zinc-300 hover:text-white"
          >
            CM
          </button>
          {showAccount && (
            <div className="absolute right-0 mt-2 w-44 rounded-lg border border-zinc-800/80 bg-[#161619] p-1 shadow-xl text-xs">
              <p className="px-2 py-2 text-zinc-500">CelMart · Sesión activa</p>
              {onLogout && (
                <button
                  id="btn-lock-session"
                  type="button"
                  onClick={onLogout}
                  className="w-full p-2 rounded-md hover:bg-[#1c1c20] text-zinc-300 flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Cerrar sesión
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
