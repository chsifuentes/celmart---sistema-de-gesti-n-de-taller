import React from 'react';
import { ArrowUpRight, ArrowDownLeft, Inbox } from 'lucide-react';
import { InventoryMovement } from '../types';

interface InventoryMovementsPanelProps {
  movements: InventoryMovement[];
  onGoToInventory?: () => void;
}

export const InventoryMovementsPanel: React.FC<InventoryMovementsPanelProps> = ({
  movements,
  onGoToInventory,
}) => {
  return (
    <div className="bg-[#161619] border border-zinc-800/80 rounded-lg p-5 space-y-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">Últimos Movimientos</h3>
        <button
          onClick={onGoToInventory}
          className="text-xs font-mono text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          Ver Inventario →
        </button>
      </div>

      {/* Movements list or empty state */}
      {movements.length === 0 ? (
        <div className="py-8 text-center flex flex-col items-center justify-center space-y-1.5 border border-dashed border-zinc-800/80 rounded-lg">
          <Inbox className="w-5 h-5 text-zinc-600 stroke-[1.5]" />
          <p className="text-xs font-mono text-zinc-500">Sin actividad reciente</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {movements.map((mov) => {
            const isPositive = mov.cantidad > 0;
            return (
              <div
                key={mov.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#111114] border border-zinc-800/80 hover:bg-[#1c1c20] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center border ${
                      isPositive
                        ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-400'
                        : 'bg-rose-950/40 border-rose-800/50 text-rose-400'
                    }`}
                  >
                    {isPositive ? (
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    )}
                  </div>

                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-zinc-100 truncate">
                      {mov.repuestoNombre}
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono mt-0.5">
                      {mov.codigoOrden && (
                        <span className="text-zinc-300 font-medium">{mov.codigoOrden} ·</span>
                      )}
                      <span>{mov.autor}</span>
                      <span>· {mov.tiempo}</span>
                    </div>
                  </div>
                </div>

                {/* Quantity indicator */}
                <div className="text-right shrink-0">
                  <span
                    className={`text-xs font-mono font-bold ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isPositive ? `+${mov.cantidad}` : mov.cantidad}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
