import React from 'react';
import { Wrench, Clock, CheckCircle2, ShieldCheck, TrendingUp } from 'lucide-react';
import { Order } from '../types';

interface MetricCardsProps {
  orders: Order[];
  onSelectFilter?: (status: string) => void;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ orders, onSelectFilter }) => {
  // Compute metrics dynamically from current state
  const totalInShop = orders.filter((o) => o.estado !== 'Entregado').length;
  const waitingQuote = orders.filter((o) => o.estado === 'Esperando Presupuesto' || o.estado === 'En Diagnóstico').length;
  const readyForPickup = orders.filter((o) => o.estado === 'Listo').length;
  const activeWarranties = orders.filter((o) => o.estado === 'Entregado').length;

  const metrics = [
    {
      id: 'metric-in-shop',
      title: 'EQUIPOS EN TALLER',
      value: totalInShop,
      badgeText: totalInShop > 0 ? `+${totalInShop} activo${totalInShop > 1 ? 's' : ''}` : '0 hoy',
      badgeType: totalInShop > 0 ? 'positive' : 'neutral',
      icon: Wrench,
      iconColor: 'text-zinc-200',
      iconBg: 'bg-[#1c1c20] border-zinc-700/60',
      filterTarget: 'Todos',
    },
    {
      id: 'metric-waiting-quote',
      title: 'ESPERANDO PRESUPUESTO',
      value: waitingQuote,
      badgeText: waitingQuote > 0 ? `${waitingQuote} en espera` : '0 pendientes',
      badgeType: 'neutral',
      icon: Clock,
      iconColor: 'text-zinc-200',
      iconBg: 'bg-[#1c1c20] border-zinc-700/60',
      filterTarget: 'En Diagnóstico',
    },
    {
      id: 'metric-ready',
      title: 'LISTOS PARA ENTREGA',
      value: readyForPickup,
      badgeText: readyForPickup > 0 ? `${readyForPickup} por entregar` : '0 listos',
      badgeType: readyForPickup > 0 ? 'positive' : 'neutral',
      icon: CheckCircle2,
      iconColor: 'text-zinc-200',
      iconBg: 'bg-[#1c1c20] border-zinc-700/60',
      filterTarget: 'Listo',
    },
    {
      id: 'metric-warranty',
      title: 'GARANTÍAS ACTIVAS',
      value: activeWarranties,
      badgeText: activeWarranties > 0 ? `${activeWarranties} vigentes` : '0 activas',
      badgeType: 'neutral',
      icon: ShieldCheck,
      iconColor: 'text-zinc-200',
      iconBg: 'bg-[#1c1c20] border-zinc-700/60',
      filterTarget: 'Todos',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {metrics.map((m) => {
        const Icon = m.icon;
        return (
          <div
            key={m.id}
            id={m.id}
            onClick={() => onSelectFilter && onSelectFilter(m.filterTarget)}
            className="group relative bg-[#161619] hover:bg-[#1c1c20] border border-zinc-800/80 hover:border-zinc-700/80 rounded-lg p-4 transition-all duration-150 cursor-pointer shadow-sm"
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${m.iconBg}`}
              >
                <Icon className={`w-5 h-5 ${m.iconColor}`} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-mono uppercase font-semibold text-zinc-400 tracking-wider truncate">
                  {m.title}
                </span>
                <div className="flex items-baseline gap-2.5 mt-0.5">
                  <span className="text-2xl font-mono font-bold text-zinc-100 tracking-tight">
                    {m.value}
                  </span>
                  <div className="flex items-center gap-1 text-[11px] font-mono">
                    {m.badgeType === 'positive' ? (
                      <span className="text-emerald-400 flex items-center gap-0.5">
                        <TrendingUp className="w-3 h-3" />
                        {m.badgeText}
                      </span>
                    ) : (
                      <span className="text-zinc-500 flex items-center gap-0.5">
                        {m.badgeText}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
