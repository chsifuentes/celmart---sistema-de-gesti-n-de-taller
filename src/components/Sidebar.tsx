import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Package, 
  BarChart3, 
  Settings, 
  ChevronLeft, 
  ChevronRight, 
  Wrench,
  X 
} from 'lucide-react';

export type TabType = 'dashboard' | 'clientes' | 'inventario' | 'reportes' | 'configuraciones' | 'caja';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  activeOrdersCount: number;
  lowStockCount: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
  activeOrdersCount,
  lowStockCount,
  mobileOpen,
  onCloseMobile,
}) => {
  const menuItems = [
    {
      id: 'dashboard' as TabType,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: activeOrdersCount > 0 ? `${activeOrdersCount}` : undefined,
    },
    {
      id: 'clientes' as TabType,
      label: 'Clientes',
      icon: Users,
    },
    {
      id: 'inventario' as TabType,
      label: 'Inventario',
      icon: Package,
      badge: lowStockCount > 0 ? `!${lowStockCount}` : undefined,
      badgeVariant: 'warning',
    },
    { id: 'caja' as TabType, label: 'Corte de Caja', icon: BarChart3 },
    {
      id: 'reportes' as TabType,
      label: 'Reportes',
      icon: BarChart3,
    },
    {
      id: 'configuraciones' as TabType,
      label: 'Configuraciones',
      icon: Settings,
    },
  ];

  return (
    <>
      {/* Mobile Slide-out Drawer (< md) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={onCloseMobile} 
          />
          {/* Drawer Menu */}
          <aside className="relative w-64 max-w-[80vw] h-full bg-[#161619] border-r border-zinc-800 flex flex-col z-10 shadow-2xl animate-in slide-in-from-left duration-200">
            {/* Header with Close */}
            <div className="h-16 flex items-center px-4 border-b border-zinc-800/80 justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 shrink-0 rounded-lg bg-[#1c1c20] border border-zinc-700/60 flex items-center justify-center font-bold text-xs font-mono text-zinc-100 shadow-sm">
                  CM
                </div>
                <span className="font-semibold text-zinc-100 tracking-tight text-sm uppercase">
                  CELMART
                </span>
              </div>
              <button
                onClick={onCloseMobile}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                title="Cerrar menú lateral"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Section */}
            <div className="flex-1 py-4 px-2 space-y-6 overflow-y-auto">
              <div>
                <div className="px-3 mb-2">
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                    OPERACIÓN
                  </span>
                </div>
                <nav className="space-y-1">
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        id={`sidebar-mobile-tab-${item.id}`}
                        onClick={() => {
                          setActiveTab(item.id);
                          if (onCloseMobile) onCloseMobile();
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/80 font-semibold'
                            : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 border border-transparent'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            isActive ? 'text-zinc-100' : 'text-zinc-400'
                          }`}
                        />
                        <span className="truncate flex-1 text-left">{item.label}</span>
                        {item.badge && (
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                              item.badgeVariant === 'warning'
                                ? 'bg-amber-950/50 text-amber-300 border-amber-800/60'
                                : 'bg-[#1c1c20] text-zinc-400 border-zinc-700/60'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Sidebar (Always visible on md: and lg:) */}
      <aside 
        className={`hidden md:flex relative flex-col border-r border-zinc-800/80 bg-[#161619] transition-all duration-200 z-30 select-none shrink-0 ${
          collapsed ? 'w-[68px]' : 'w-60'
        }`}
      >
      {/* Brand Header */}
      <div className="h-16 flex items-center px-4 border-b border-zinc-800/80 justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-[#1c1c20] border border-zinc-700/60 flex items-center justify-center font-bold text-xs font-mono text-zinc-100 shadow-sm">
            CM
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-zinc-100 tracking-tight text-sm truncate uppercase">
                CELMART
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Section */}
      <div className="flex-1 py-4 px-2 space-y-6 overflow-y-auto">
        <div>
          {!collapsed && (
            <div className="px-3 mb-2">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                OPERACIÓN
              </span>
            </div>
          )}
          <nav className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`sidebar-tab-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all group ${
                    isActive
                      ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/80 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 border border-transparent'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-zinc-100' : 'text-zinc-400 group-hover:text-zinc-200'
                    }`}
                  />
                  {!collapsed && (
                    <span className="truncate flex-1 text-left">{item.label}</span>
                  )}
                  {!collapsed && item.badge && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                        item.badgeVariant === 'warning'
                          ? 'bg-amber-950/50 text-amber-300 border-amber-800/60'
                          : 'bg-[#1c1c20] text-zinc-400 border-zinc-700/60'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Footer Collapse Toggle */}
      <div className="p-2 border-t border-zinc-800/80">
        <button
          id="btn-toggle-sidebar"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
          title={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4 mx-auto" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Colapsar</span>
            </>
          )}
        </button>
      </div>
    </aside>
    </>
  );
};
