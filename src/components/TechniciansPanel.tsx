import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Inbox, 
  Pencil, 
  Trash2, 
  X, 
  Check, 
  AlertTriangle, 
  ChevronDown,
  Wrench
} from 'lucide-react';
import { Technician } from '../types';

export const SPECIALTY_PRESETS = [
  'Microelectrónica y Placas',
  'Pantallas y Baterías',
  'Diagnóstico y Software',
  'Reballing e Integrados',
  'Carga y Puertos',
  'Accesorios y Mantenimiento'
];

interface TechniciansPanelProps {
  technicians: Technician[];
  onSelectTechnician?: (techName: string) => void;
  onAddTechnician?: (newTech: Omit<Technician, 'id' | 'ordenesActivas'>) => void;
  onEditTechnician?: (tech: Technician) => void;
  onDeleteTechnician?: (techId: string) => void;
  onUpdateTechnicianStatus?: (techId: string, status: Technician['estado']) => void;
  onUpdateTechnicianSpecialty?: (techId: string, specialty: string) => void;
}

export const TechniciansPanel: React.FC<TechniciansPanelProps> = ({
  technicians,
  onSelectTechnician,
  onAddTechnician,
  onEditTechnician,
  onDeleteTechnician,
  onUpdateTechnicianStatus,
  onUpdateTechnicianSpecialty,
}) => {
  // Modal states
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingTech, setEditingTech] = useState<Technician | null>(null);
  const [techToDelete, setTechToDelete] = useState<Technician | null>(null);

  // Quick inline toggle dropdowns
  const [openStatusDropdownTechId, setOpenStatusDropdownTechId] = useState<string | null>(null);
  const [openSpecialtyDropdownTechId, setOpenSpecialtyDropdownTechId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    nombre: '',
    especialidad: SPECIALTY_PRESETS[0],
    estado: 'Disponible' as Technician['estado'],
    capacidadMaxima: 5,
    salarioFijo: 16000,
  });
  const [formError, setFormError] = useState('');

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

  const handleOpenAddModal = () => {
    setEditingTech(null);
    setFormData({
      nombre: '',
      especialidad: SPECIALTY_PRESETS[0],
      estado: 'Disponible',
      capacidadMaxima: 5,
      salarioFijo: 16000,
    });
    setFormError('');
    setIsAddEditModalOpen(true);
  };

  const handleOpenEditModal = (tech: Technician) => {
    setEditingTech(tech);
    setFormData({
      nombre: tech.nombre,
      especialidad: tech.especialidad,
      estado: tech.estado,
      capacidadMaxima: tech.capacidadMaxima || 5,
      salarioFijo: tech.salarioFijo || 16000,
    });
    setFormError('');
    setIsAddEditModalOpen(true);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      setFormError('El nombre del técnico es obligatorio');
      return;
    }
    if (!formData.especialidad.trim()) {
      setFormError('La especialidad es obligatoria');
      return;
    }

    if (editingTech) {
      if (onEditTechnician) {
        onEditTechnician({
          ...editingTech,
          nombre: formData.nombre.trim(),
          especialidad: formData.especialidad.trim(),
          estado: formData.estado,
          capacidadMaxima: Number(formData.capacidadMaxima) || 5,
          salarioFijo: Number(formData.salarioFijo) || 16000,
        });
      }
    } else {
      if (onAddTechnician) {
        onAddTechnician({
          nombre: formData.nombre.trim(),
          iniciales: '',
          especialidad: formData.especialidad.trim(),
          estado: formData.estado,
          capacidadMaxima: Number(formData.capacidadMaxima) || 5,
          horasPromedio: 2.5,
          efectividad: 98,
          salarioFijo: Number(formData.salarioFijo) || 16000,
          avatarBg: 'bg-blue-600',
        });
      }
    }

    setIsAddEditModalOpen(false);
  };

  return (
    <div className="bg-[#161619] border border-zinc-800/80 rounded-lg p-5 space-y-4 shadow-sm relative">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">Técnicos Disponibles</h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#1c1c20] text-zinc-300 border border-zinc-700/60 font-semibold">
            {freeTechsCount} libres
          </span>
        </div>

        {/* Add Technician button */}
        <button
          id="btn-add-technician"
          type="button"
          onClick={handleOpenAddModal}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1c1c20] hover:bg-zinc-800 text-zinc-200 text-xs font-semibold border border-zinc-700/70 hover:border-zinc-500 transition-colors shadow-xs"
          title="Agregar nuevo técnico al taller"
        >
          <UserPlus className="w-3.5 h-3.5 text-zinc-300" />
          <span>Nuevo</span>
        </button>
      </div>

      {/* Technicians List or Empty State */}
      {technicians.length === 0 ? (
        <div className="py-8 text-center flex flex-col items-center justify-center space-y-2 border border-dashed border-zinc-800/80 rounded-lg p-4">
          <Inbox className="w-5 h-5 text-zinc-600 stroke-[1.5]" />
          <p className="text-xs font-mono text-zinc-400">No hay técnicos registrados</p>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="text-xs text-zinc-200 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-md border border-zinc-700 transition-colors font-medium"
          >
            + Agregar Primer Técnico
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {technicians.map((tech) => {
            const loadPercent = Math.min(100, Math.round((tech.ordenesActivas / (tech.capacidadMaxima || 5)) * 100));
            return (
              <div
                key={tech.id}
                className="group hover:bg-zinc-800/40 p-2.5 -mx-2 rounded-lg transition-colors border border-transparent hover:border-zinc-800/80"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {/* Avatar with Quick Status Toggle */}
                    <div className="relative shrink-0 mt-0.5">
                      <div className={`w-8 h-8 rounded-full ${tech.avatarBg || 'bg-[#1c1c20]'} border border-zinc-700/70 flex items-center justify-center text-xs font-mono font-semibold text-zinc-100`}>
                        {tech.iniciales}
                      </div>

                      {/* Status indicator dot / quick toggle */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenStatusDropdownTechId(openStatusDropdownTechId === tech.id ? null : tech.id);
                          setOpenSpecialtyDropdownTechId(null);
                        }}
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-[#161619] cursor-pointer hover:scale-125 transition-transform ${getStatusDot(
                          tech.estado
                        )}`}
                        title={`Estado: ${tech.estado}. Clic para cambiar rápido.`}
                      />

                      {/* Quick status dropdown */}
                      {openStatusDropdownTechId === tech.id && (
                        <div 
                          onClick={(e) => e.stopPropagation()}
                          className="absolute left-0 mt-1.5 w-36 rounded-lg bg-[#1a1a1e] border border-zinc-700 shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100"
                        >
                          <div className="px-2.5 py-1 text-[10px] font-mono uppercase text-zinc-400 border-b border-zinc-800">
                            Cambiar Estatus
                          </div>
                          {(['Disponible', 'Ocupado', 'Ausente'] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => {
                                if (onUpdateTechnicianStatus) {
                                  onUpdateTechnicianStatus(tech.id, st);
                                }
                                setOpenStatusDropdownTechId(null);
                              }}
                              className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-zinc-800 flex items-center gap-2 ${
                                tech.estado === st ? 'text-zinc-100 font-semibold bg-zinc-800/60' : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              <span className={`w-2 h-2 rounded-full ${getStatusDot(st)}`} />
                              <span>{st}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span 
                          onClick={() => onSelectTechnician && onSelectTechnician(tech.nombre)}
                          className="text-xs font-semibold text-zinc-100 group-hover:text-white transition-colors truncate cursor-pointer hover:underline"
                          title="Filtrar reparaciones de este técnico"
                        >
                          {tech.nombre}
                        </span>
                      </div>

                      {/* Dynamic Specialty dropdown */}
                      <div className="relative mt-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenSpecialtyDropdownTechId(openSpecialtyDropdownTechId === tech.id ? null : tech.id);
                            setOpenStatusDropdownTechId(null);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 text-left truncate max-w-full group/spec"
                          title="Clic para cambiar especialidad rápidamente"
                        >
                          <span className="truncate">{tech.especialidad}</span>
                          <ChevronDown className="w-2.5 h-2.5 text-zinc-500 group-hover/spec:text-zinc-300 shrink-0" />
                        </button>

                        {openSpecialtyDropdownTechId === tech.id && (
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            className="absolute left-0 mt-1 w-52 rounded-lg bg-[#1a1a1e] border border-zinc-700 shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100"
                          >
                            <div className="px-2.5 py-1 text-[10px] font-mono uppercase text-zinc-400 border-b border-zinc-800">
                              Cambiar Especialidad
                            </div>
                            {SPECIALTY_PRESETS.map((spec) => (
                              <button
                                key={spec}
                                type="button"
                                onClick={() => {
                                  if (onUpdateTechnicianSpecialty) {
                                    onUpdateTechnicianSpecialty(tech.id, spec);
                                  } else if (onEditTechnician) {
                                    onEditTechnician({ ...tech, especialidad: spec });
                                  }
                                  setOpenSpecialtyDropdownTechId(null);
                                }}
                                className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-zinc-800 truncate ${
                                  tech.especialidad === spec ? 'text-zinc-100 font-semibold bg-zinc-800/60' : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                              >
                                {spec}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side: Load and actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs font-mono font-medium text-zinc-300 mr-1.5">
                      {tech.ordenesActivas}/{tech.capacidadMaxima}
                    </span>

                    {/* Edit button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditModal(tech);
                      }}
                      className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/60 transition-colors"
                      title="Editar datos del técnico"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTechToDelete(tech);
                      }}
                      className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                      title="Eliminar técnico"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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

      {/* Modal: Crear / Editar Técnico */}
      {isAddEditModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setIsAddEditModalOpen(false)}
        >
          <div 
            className="bg-[#161619] border border-zinc-700/80 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200">
                  <Wrench className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-zinc-100">
                  {editingTech ? 'Editar Técnico' : 'Registrar Nuevo Técnico'}
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => setIsAddEditModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4">
              {formError && (
                <div className="p-2 rounded bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Nombre */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej. Luis Morales"
                  className="w-full bg-[#1c1c20] text-zinc-100 text-xs px-3 py-2 rounded-lg border border-zinc-700/70 focus:outline-none focus:border-zinc-400"
                  required
                />
              </div>

              {/* Especialidad */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Especialidad Principal *
                </label>
                <input
                  type="text"
                  value={formData.especialidad}
                  onChange={(e) => setFormData({ ...formData, especialidad: e.target.value })}
                  placeholder="Ej. Microelectrónica y Placas"
                  className="w-full bg-[#1c1c20] text-zinc-100 text-xs px-3 py-2 rounded-lg border border-zinc-700/70 focus:outline-none focus:border-zinc-400 mb-2"
                  required
                />
                {/* Specialty quick pills */}
                <div className="flex flex-wrap gap-1.5">
                  {SPECIALTY_PRESETS.map((spec) => (
                    <button
                      key={spec}
                      type="button"
                      onClick={() => setFormData({ ...formData, especialidad: spec })}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                        formData.especialidad === spec
                          ? 'bg-zinc-200 text-zinc-950 font-semibold border-zinc-200'
                          : 'bg-[#1c1c20] text-zinc-400 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {spec}
                    </button>
                  ))}
                </div>
              </div>

              {/* Estado */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Estado Inicial
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Disponible', 'Ocupado', 'Ausente'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFormData({ ...formData, estado: st })}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors ${
                        formData.estado === st
                          ? 'bg-[#222228] text-white border-zinc-500 shadow-xs'
                          : 'bg-[#1c1c20] text-zinc-400 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${getStatusDot(st)}`} />
                      <span>{st}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Capacidad Máxima */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Capacidad Simultánea
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    value={formData.capacidadMaxima}
                    onChange={(e) => setFormData({ ...formData, capacidadMaxima: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                    className="w-full bg-[#1c1c20] text-zinc-100 text-xs px-3 py-2 rounded-lg border border-zinc-700/70 focus:outline-none focus:border-zinc-400"
                  />
                  <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">Órdenes a la vez</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Salario Base Mensual
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">$</span>
                    <input
                      type="number"
                      step="500"
                      value={formData.salarioFijo}
                      onChange={(e) => setFormData({ ...formData, salarioFijo: parseInt(e.target.value, 10) || 0 })}
                      className="w-full bg-[#1c1c20] text-zinc-100 text-xs pl-6 pr-3 py-2 rounded-lg border border-zinc-700/70 focus:outline-none focus:border-zinc-400 font-mono"
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">MXN / mes</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsAddEditModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700/80 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-950 bg-zinc-100 hover:bg-white transition-colors shadow-sm"
                >
                  {editingTech ? 'Guardar Cambios' : 'Registrar Técnico'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminación de Técnico */}
      {techToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setTechToDelete(null)}
        >
          <div 
            className="bg-[#161619] border border-zinc-700/80 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-full bg-rose-950/60 border border-rose-800/60 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1.5 flex-1 min-w-0">
                <h3 className="text-base font-bold text-zinc-100">
                  ¿Eliminar a {techToDelete.nombre}?
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Estás a punto de eliminar a este técnico del taller CelMart.
                </p>
                <div className="bg-[#1c1c20] border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-400 font-mono space-y-1 mt-1">
                  <div>Especialidad: <span className="text-zinc-200">{techToDelete.especialidad}</span></div>
                  <div>Órdenes activas: <span className="text-zinc-200">{techToDelete.ordenesActivas}</span></div>
                </div>
                <p className="text-[11px] text-rose-400 font-mono pt-1">
                  Las órdenes de reparación previamente asignadas a este técnico se mantendrán en el sistema.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setTechToDelete(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700/80 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteTechnician) {
                    onDeleteTechnician(techToDelete.id);
                  }
                  setTechToDelete(null);
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar Técnico</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
