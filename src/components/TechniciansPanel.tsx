import React from 'react';
import { Users, Inbox } from 'lucide-react';
import { Technician } from '../types';

interface TechniciansPanelProps {
  technicians: Technician[];
  onSelectTechnician?: (techName: string) => void;
}

export const TechniciansPanel: React.FC<TechniciansPanelProps> = ({
  technicians,
  onSelectTechnician,
}) => {
  const freeTechsCount = technicians.filter((t) => t.estado === 'Disponible').length;

  const getStatusDot = (status: Technician['estado']) => {
    switch (status) {
      case 'Disponible':
        return 'bg-emerald-400';
      case 'Ocupado':
        return 'bg-amber-400';
      case 'Ausente':
      default:
        return 'bg-zinc-500';
    }
  };

  const getBarColor = (status: Technician['estado'], percent: number) => {
    if (status === 'Ausente') return 'bg-zinc-700';
    if (percent >= 80) return 'bg-amber-400';
    return 'bg-zinc-200';
  };

  return (
    <div className="bg-[#161619] border border-zinc-800/80 rounded-lg p-5 space-y-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">Técnicos Disponibles</h3>
        <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[#1c1c20] text-zinc-300 border border-zinc-700/60 font-semibold">
          {freeTechsCount} libres
        </span>
      </div>

      {/* Technicians List or Empty State */}
      {technicians.length === 0 ? (
        <div className="py-8 text-center flex flex-col items-center justify-center space-y-1.5 border border-dashed border-zinc-800/80 rounded-lg">
          <Inbox className="w-5 h-5 text-zinc-600 stroke-[1.5]" />
          <p className="text-xs font-mono text-zinc-500">No hay técnicos registrados</p>
        </div>
      ) : (
        <div className="space-y-4">
          {technicians.map((tech) => {
            const loadPercent = Math.round((tech.ordenesActivas / tech.capacidadMaxima) * 100);
            return (
              <div
                key={tech.id}
                onClick={() => onSelectTechnician && onSelectTechnician(tech.nombre)}
                className="group cursor-pointer hover:bg-zinc-800/60 p-2.5 -mx-2 rounded-lg transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-[#1c1c20] border border-zinc-700/70 flex items-center justify-center text-xs font-mono font-semibold text-zinc-200">
                        {tech.iniciales}
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[#161619] ${getStatusDot(
                          tech.estado
                        )}`}
                      />
                    </div>

                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-zinc-100 group-hover:text-white transition-colors">
                        {tech.nombre}
                      </span>
                      <span className="text-[11px] text-zinc-400 mt-0.5">
                        {tech.especialidad} · <span className="capitalize text-zinc-300">{tech.estado}</span>
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-mono font-medium text-zinc-300">
                      {tech.ordenesActivas}/{tech.capacidadMaxima}
                    </span>
                  </div>
                </div>

                {/* Workload Capacity Bar */}
                <div className="w-full bg-[#1c1c20] h-1.5 rounded-full overflow-hidden mt-2.5 border border-zinc-800">
                  <div
                    className={`h-full transition-all duration-300 ${getBarColor(
                      tech.estado,
                      loadPercent
                    )}`}
                    style={{ width: `${tech.estado === 'Ausente' ? 0 : loadPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
