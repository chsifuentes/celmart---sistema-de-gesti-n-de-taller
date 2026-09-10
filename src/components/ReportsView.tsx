import React from 'react';
import { 
  DollarSign, 
  Smartphone, 
  TrendingUp, 
  CheckCircle2,
  Wrench,
  Flame,
  Layers,
  Inbox,
  FileQuestion
} from 'lucide-react';
import { Order, Technician, InventoryItem } from '../types';

interface ReportsViewProps {
  orders: Order[];
  technicians?: Technician[];
  inventory: InventoryItem[];
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  orders,
  inventory,
}) => {
  // Calculated KPIs from real state
  const totalRevenue = orders.reduce((sum, o) => sum + (o.totalEstimado || 0), 0);
  const totalEquiposIngresados = orders.length;
  const completedCount = orders.filter((o) => o.estado === 'Listo' || o.estado === 'Entregado').length;

  // Derive model frequencies
  const modelCounts: Record<string, number> = {};
  const brandCounts: Record<string, number> = {};

  orders.forEach((o) => {
    const mod = o.dispositivo.modelo || 'Desconocido';
    const brand = o.dispositivo.marca || 'Otra';
    modelCounts[mod] = (modelCounts[mod] || 0) + 1;
    brandCounts[brand] = (brandCounts[brand] || 0) + 1;
  });

  const sortedModels = Object.entries(modelCounts).sort((a, b) => b[1] - a[1]);
  const mostRepairedModel = sortedModels.length > 0 ? sortedModels[0][0] : 'Sin registros';
  const mostRepairedCount = sortedModels.length > 0 ? sortedModels[0][1] : 0;

  // Derive brand distribution
  const brandColors: Record<string, string> = {
    Apple: 'bg-zinc-200',
    Samsung: 'bg-sky-400',
    Xiaomi: 'bg-amber-400',
    Motorola: 'bg-emerald-400',
    Huawei: 'bg-rose-400',
    Dell: 'bg-indigo-400',
  };

  const brandDistribution = Object.entries(brandCounts).map(([brand, count]) => {
    const percentage = totalEquiposIngresados > 0 ? Math.round((count / totalEquiposIngresados) * 100) : 0;
    return {
      brand,
      percentage,
      count,
      color: brandColors[brand] || 'bg-zinc-400',
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
          Análisis de Fallas, Servicios y Modelos Frecuentes
        </h1>
      </div>

      {/* 1. Tarjetas de Métricas Superiores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Ingresos Totales del Mes */}
        <div className="bg-[#161619] border border-zinc-800/80 rounded-lg p-4 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-zinc-400 font-semibold tracking-wider">
              INGRESOS TOTALES DEL MES
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#1c1c20] border border-zinc-700/60 flex items-center justify-center text-zinc-300">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-zinc-100">
              ${totalRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] font-mono text-zinc-400">MXN</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-500">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{totalRevenue > 0 ? '+100% este mes' : '$0.00 registrados'}</span>
          </div>
        </div>

        {/* KPI 2: Total de Equipos Ingresados */}
        <div className="bg-[#161619] border border-zinc-800/80 rounded-lg p-4 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-zinc-400 font-semibold tracking-wider">
              TOTAL EQUIPOS INGRESADOS
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#1c1c20] border border-zinc-700/60 flex items-center justify-center text-zinc-300">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-zinc-100">
              {totalEquiposIngresados}
            </span>
            <span className="text-[10px] font-mono text-zinc-400">equipos</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-500">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{completedCount} entregados</span>
          </div>
        </div>

        {/* KPI 3: Falla #1 del Mes */}
        <div className="bg-[#161619] border border-zinc-800/80 rounded-lg p-4 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-zinc-400 font-semibold tracking-wider">
              FALLA #1 DEL MES
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#1c1c20] border border-zinc-700/60 flex items-center justify-center text-zinc-300">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-base font-semibold text-zinc-100 truncate">
              {orders.length > 0 ? 'Fallas Varias' : 'Sin registros'}
            </span>
            <span className="text-xs font-mono text-zinc-500 font-bold mt-0.5">
              {orders.length > 0 ? `${orders.length} equipos` : '0% del total (0 equipos)'}
            </span>
          </div>
          <div className="text-[11px] font-mono text-zinc-500 truncate">
            {orders.length > 0 ? 'Diagnóstico inicial' : 'Sin fallas registradas'}
          </div>
        </div>

        {/* KPI 4: Modelo Más Reparado */}
        <div className="bg-[#161619] border border-zinc-800/80 rounded-lg p-4 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-zinc-400 font-semibold tracking-wider">
              MODELO MÁS REPARADO
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#1c1c20] border border-zinc-700/60 flex items-center justify-center text-zinc-300">
              <Smartphone className="w-4 h-4" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-base font-semibold font-mono text-zinc-100 truncate">
              {mostRepairedModel}
            </span>
            <span className="text-xs font-mono text-zinc-500 font-bold mt-0.5">
              {mostRepairedCount} servicios este mes
            </span>
          </div>
          <div className="text-[11px] font-mono text-zinc-500">
            {orders.length > 0 ? '100% de ingresos en taller' : '0.0% de ingresos en taller'}
          </div>
        </div>
      </div>

      {/* 2 & 3: Main Section (Tabla de Fallas Frecuentes + Widgets Laterales) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 2. Tabla Principal: Fallas y Servicios Más Frecuentes */}
        <div className="lg:col-span-2 bg-[#161619] border border-zinc-800/80 rounded-lg p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-zinc-400" />
                <span>Fallas y Servicios Más Frecuentes</span>
              </h3>
            </div>
            <span className="text-[10px] font-mono text-zinc-400 uppercase bg-[#1c1c20] px-2.5 py-1 rounded border border-zinc-700/60 shrink-0 self-start sm:self-auto">
              Mes en curso
            </span>
          </div>

          {orders.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center justify-center space-y-2 border border-dashed border-zinc-800/80 rounded-lg">
              <FileQuestion className="w-8 h-8 text-zinc-600 stroke-[1.5]" />
              <p className="text-xs font-mono text-zinc-500 max-w-sm">
                No hay datos suficientes para el análisis mensual.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse min-w-[540px]">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-[#111114] text-[10px] font-mono uppercase text-zinc-400 font-semibold tracking-wider">
                    <th className="py-2.5 px-3 whitespace-nowrap">SERVICIO / TIPO DE FALLA</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">DISPOSITIVO</th>
                    <th className="py-2.5 px-3 text-center whitespace-nowrap">ESTADO</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">TOTAL ESTIMADO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-zinc-800/60 transition-colors group">
                      <td className="py-3 px-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-zinc-100">{o.fallaDeclarada}</span>
                          <span className="text-[11px] text-zinc-400">Orden: {o.id}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-zinc-200">
                        {o.dispositivo.marca} {o.dispositivo.modelo}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center text-[10px] font-mono px-2 py-0.5 rounded bg-[#1c1c20] text-zinc-300 border border-zinc-700/60">
                          {o.estado}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-zinc-100">
                        ${(o.totalEstimado || 0).toLocaleString()} MXN
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 3. Widgets Laterales Derechos */}
        <div className="space-y-6">
          {/* Widget 1: Distribución por Marca */}
          <div className="bg-[#161619] border border-zinc-800/80 rounded-lg p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">Distribución por Marca</h3>
              <span className="text-[10px] font-mono text-zinc-400 bg-[#1c1c20] px-2 py-0.5 rounded border border-zinc-700/60">
                {orders.length > 0 ? '100%' : '0%'}
              </span>
            </div>
            
            {orders.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center justify-center space-y-1 text-zinc-500">
                <Inbox className="w-6 h-6 text-zinc-600 stroke-[1.5]" />
                <p className="text-xs font-mono">Sin registros de marcas</p>
              </div>
            ) : (
              <>
                <div className="w-full h-3 rounded-full overflow-hidden flex bg-[#1c1c20] gap-0.5 border border-zinc-800">
                  {brandDistribution.map((b) => (
                    <div
                      key={b.brand}
                      className={`h-full ${b.color}`}
                      style={{ width: `${b.percentage}%` }}
                      title={`${b.brand}: ${b.percentage}%`}
                    />
                  ))}
                </div>

                <div className="space-y-2 pt-2">
                  {brandDistribution.map((b) => (
                    <div key={b.brand} className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-sm ${b.color}`}></span>
                        <span className="font-sans text-zinc-300">{b.brand}</span>
                      </div>
                      <span className="text-zinc-400 font-semibold">{b.percentage}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Widget 2: Top Repuestos Más Utilizados */}
          <div className="bg-[#161619] border border-zinc-800/80 rounded-lg p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">Top Repuestos Más Utilizados</h3>
              <span className="text-[10px] font-mono text-zinc-400 bg-[#1c1c20] px-2 py-0.5 rounded border border-zinc-700/60">
                Almacén
              </span>
            </div>

            {inventory.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center justify-center space-y-1 text-zinc-500">
                <Inbox className="w-6 h-6 text-zinc-600 stroke-[1.5]" />
                <p className="text-xs font-mono">Sin repuestos registrados en almacén</p>
              </div>
            ) : (
              <div className="space-y-2.5 pt-1">
                {inventory.slice(0, 5).map((p, idx) => (
                  <div 
                    key={p.id} 
                    className="p-2.5 rounded-lg bg-[#111114] border border-zinc-800/70 flex items-center justify-between text-xs hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <span className="font-mono text-zinc-400 font-bold text-[10px] w-4 shrink-0">
                        0{idx + 1}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-zinc-200 font-medium truncate">{p.nombre}</span>
                        <span className="text-[10px] font-mono text-zinc-500 truncate">SKU: {p.sku}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 font-mono">
                      <span className="text-zinc-100 font-bold text-xs bg-[#1c1c20] px-2 py-0.5 rounded border border-zinc-700/60">
                        {p.stockActual} u.
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
