import React, { useState } from 'react';
import { 
  Search, 
  Plus, 
  Minus, 
  PackagePlus, 
  AlertTriangle, 
  CheckCircle, 
  Tag, 
  X, 
  Pencil, 
  Trash2, 
  Barcode, 
  ScanLine,
  Check,
  Inbox
} from 'lucide-react';
import { InventoryItem } from '../types';

interface InventoryViewProps {
  inventory: InventoryItem[];
  onUpdateStock: (itemId: string, delta: number) => void;
  onAddInventoryItem: (newItem: Omit<InventoryItem, 'id'>) => void;
  onEditInventoryItem: (updatedItem: InventoryItem) => void;
  onDeleteInventoryItem: (itemId: string) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  inventory,
  onUpdateStock,
  onAddInventoryItem,
  onEditInventoryItem,
  onDeleteInventoryItem,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<InventoryItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);

  // New item form state
  const [nombre, setNombre] = useState('');
  const [sku, setSku] = useState('');
  const [categoria, setCategoria] = useState<InventoryItem['categoria']>('Pantallas');
  const [stockActual, setStockActual] = useState(5);
  const [stockMinimo, setStockMinimo] = useState(3);
  const [costoCompra, setCostoCompra] = useState(500);
  const [precioVenta, setPrecioVenta] = useState(1200);
  const [compatibilidad, setCompatibilidad] = useState('');
  const [ubicacion, setUbicacion] = useState('Cajón A-01');

  // Edit item form state
  const [editNombre, setEditNombre] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editCategoria, setEditCategoria] = useState<InventoryItem['categoria']>('Pantallas');
  const [editStockActual, setEditStockActual] = useState(0);
  const [editStockMinimo, setEditStockMinimo] = useState(0);
  const [editCostoCompra, setEditCostoCompra] = useState(0);
  const [editPrecioVenta, setEditPrecioVenta] = useState(0);
  const [editCompatibilidad, setEditCompatibilidad] = useState('');
  const [editUbicacion, setEditUbicacion] = useState('');

  const categories = [
    'Todas',
    'Pantallas',
    'Baterías',
    'Flex y Puertos',
    'Microelectrónica/ICs',
    'Accesorios',
  ];

  const filteredInventory = inventory.filter((item) => {
    const matchesCategory =
      selectedCategory === 'Todas' || item.categoria === selectedCategory;
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !term ||
      item.nombre.toLowerCase().includes(term) ||
      item.sku.toLowerCase().includes(term) ||
      item.compatibilidad.toLowerCase().includes(term) ||
      item.ubicacion.toLowerCase().includes(term);

    return matchesCategory && matchesSearch;
  });

  const lowStockCount = inventory.filter((item) => item.stockActual <= item.stockMinimo).length;

  const handleOpenEdit = (item: InventoryItem) => {
    setItemToEdit(item);
    setEditNombre(item.nombre);
    setEditSku(item.sku);
    setEditCategoria(item.categoria);
    setEditStockActual(item.stockActual);
    setEditStockMinimo(item.stockMinimo);
    setEditCostoCompra(item.costoCompra);
    setEditPrecioVenta(item.precioVenta);
    setEditCompatibilidad(item.compatibilidad);
    setEditUbicacion(item.ubicacion);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToEdit || !editNombre.trim() || !editSku.trim()) return;

    onEditInventoryItem({
      id: itemToEdit.id,
      nombre: editNombre.trim(),
      sku: editSku.trim().toUpperCase(),
      categoria: editCategoria,
      stockActual: Number(editStockActual),
      stockMinimo: Number(editStockMinimo),
      costoCompra: Number(editCostoCompra),
      precioVenta: Number(editPrecioVenta),
      compatibilidad: editCompatibilidad.trim() || 'General',
      ubicacion: editUbicacion.trim() || 'Almacén',
    });

    setItemToEdit(null);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete) {
      onDeleteInventoryItem(itemToDelete.id);
      setItemToDelete(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !sku.trim()) return;

    onAddInventoryItem({
      nombre: nombre.trim(),
      sku: sku.trim().toUpperCase(),
      categoria,
      stockActual: Number(stockActual),
      stockMinimo: Number(stockMinimo),
      costoCompra: Number(costoCompra),
      precioVenta: Number(precioVenta),
      compatibilidad: compatibilidad.trim() || 'General',
      ubicacion: ubicacion.trim() || 'Almacén',
    });

    // Reset & close
    setNombre('');
    setSku('');
    setCompatibilidad('');
    setIsAddModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
              Control de Inventario y Repuestos
            </h1>
            {lowStockCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-rose-950/40 text-rose-300 border border-rose-900/50">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
                {lowStockCount} con stock bajo
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Refacciones, pantallas OLED, baterías OEM, integrados y consumibles de taller CelMart.
          </p>
        </div>

        <button
          id="btn-add-inventory-modal"
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 bg-zinc-100 hover:bg-white text-zinc-900 px-3.5 py-2 rounded-lg font-semibold text-xs shadow-sm transition-all shrink-0 self-start sm:self-auto"
        >
          <PackagePlus className="w-4 h-4" />
          <span>Nuevo Repuesto</span>
        </button>
      </div>

      {/* Filter and Search Bar with Barcode Scanner Indicator */}
      <div className="bg-[#161619] border border-zinc-800/80 rounded-lg p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 no-scrollbar">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                  isSelected
                    ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
                    : 'bg-[#1c1c20] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 border border-zinc-700/60'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Search with Barcode Scanner Support */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar SKU, código de barras o escanear..."
              className="w-full bg-[#1c1c20] text-zinc-100 placeholder-zinc-400 text-xs pl-8 pr-9 py-1.5 rounded-lg border border-zinc-700/60 focus:outline-none focus:border-zinc-500 font-sans"
            />
            {/* Barcode Scanner icon inside search bar */}
            <div 
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-help"
              title="Lector USB / Pistola de código de barras activa"
            >
              <Barcode className="w-4 h-4 text-zinc-400" />
            </div>
          </div>

          <div 
            className="hidden sm:flex items-center gap-1 px-2 py-1.5 bg-[#1c1c20] border border-zinc-700/60 rounded-lg text-[10px] font-mono text-zinc-400 whitespace-nowrap"
            title="El campo de búsqueda detecta pulsos de pistola lectora de código de barras USB"
          >
            <ScanLine className="w-3.5 h-3.5 text-emerald-400" />
            <span>Escáner USB Activo</span>
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-[#161619] border border-zinc-800/80 rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800/80 bg-[#111114]">
                <th className="py-2.5 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold">
                  REPUESTO / SKU / CÓDIGO DE BARRAS
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold">
                  CATEGORÍA
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold">
                  COMPATIBILIDAD / UBICACIÓN
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold">
                  PRECIO (COSTO / VENTA)
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold text-center">
                  ESTADO STOCK
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold text-center">
                  AJUSTE RÁPIDO
                </th>
                <th className="py-2.5 px-4 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold text-right">
                  ACCIONES
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-xs">
              {filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Inbox className="w-8 h-8 text-zinc-600 stroke-[1.5]" />
                      <p className="text-xs font-mono text-zinc-500 max-w-sm">
                        {inventory.length === 0
                          ? 'El inventario está vacío. Registra tu primer repuesto.'
                          : 'No se encontraron refacciones con los criterios especificados.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredInventory.map((item) => {
                  const isLowStock = item.stockActual <= item.stockMinimo;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-zinc-800/60 transition-colors group"
                    >
                      {/* Repuesto / SKU / Código de barras */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-zinc-100 group-hover:text-white">
                            {item.nombre}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
                              <Barcode className="w-3 h-3 text-zinc-500 inline" />
                              SKU: {item.sku}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Categoría */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-300 bg-[#1c1c20] border border-zinc-700/60 px-2 py-0.5 rounded">
                          {item.categoria}
                        </span>
                      </td>

                      {/* Compatibilidad & Ubicación */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="text-zinc-200 font-medium">
                            {item.compatibilidad}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400">
                            📍 {item.ubicacion}
                          </span>
                        </div>
                      </td>

                      {/* Precios */}
                      <td className="py-3 px-4 font-mono">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-400 line-through text-[11px]">
                            ${item.costoCompra}
                          </span>
                          <span className="text-zinc-100 font-bold">
                            ${item.precioVenta.toLocaleString()} MXN
                          </span>
                        </div>
                      </td>

                      {/* Stock Status Badge */}
                      <td className="py-3 px-4 text-center">
                        {isLowStock ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-rose-950/40 text-rose-300 border border-rose-900/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                            {item.stockActual} unid. (Bajo)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-[#1c1c20] text-zinc-200 border border-zinc-700/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            {item.stockActual} unid.
                          </span>
                        )}
                      </td>

                      {/* Modificadores de Stock + / - */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5 bg-[#1c1c20] p-1 rounded-lg border border-zinc-700/60">
                          <button
                            onClick={() => onUpdateStock(item.id, -1)}
                            disabled={item.stockActual <= 0}
                            title="Restar 1 unidad"
                            className="w-6 h-6 rounded bg-[#161619] hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-[#161619] text-zinc-300 flex items-center justify-center transition-colors font-mono"
                          >
                            <Minus className="w-3 h-3" />
                          </button>

                          <span className="w-7 text-center font-mono font-bold text-zinc-100 text-xs">
                            {item.stockActual}
                          </span>

                          <button
                            onClick={() => onUpdateStock(item.id, 1)}
                            title="Sumar 1 unidad"
                            className="w-6 h-6 rounded bg-[#161619] hover:bg-zinc-800 text-zinc-300 flex items-center justify-center transition-colors font-mono"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      {/* Columna Acciones: Editar (Lápiz) & Borrar (Basura) */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            title="Editar repuesto"
                            className="p-1.5 rounded-lg bg-[#1c1c20] hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 border border-zinc-700/60 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setItemToDelete(item)}
                            title="Eliminar repuesto"
                            className="p-1.5 rounded-lg bg-[#1c1c20] hover:bg-rose-950/50 text-zinc-400 hover:text-rose-400 border border-zinc-700/60 hover:border-rose-900/60 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Modal: + Nuevo Repuesto */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161619] border border-zinc-700/80 rounded-lg w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PackagePlus className="w-4 h-4 text-zinc-300" />
                <h3 className="text-sm font-semibold text-zinc-100">Registrar Refacción / Repuesto</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    DESCRIPCIÓN DEL REPUESTO *
                  </label>
                  <input
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej: Pantalla OLED iPhone 15 Pro Original"
                    className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    CÓDIGO SKU / BARRAS *
                  </label>
                  <input
                    type="text"
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="DSP-IP15P-ORG"
                    className="w-full bg-[#1c1c20] text-zinc-100 font-mono uppercase px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    CATEGORÍA
                  </label>
                  <select
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value as any)}
                    className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  >
                    <option value="Pantallas">Pantallas</option>
                    <option value="Baterías">Baterías</option>
                    <option value="Flex y Puertos">Flex y Puertos</option>
                    <option value="Microelectrónica/ICs">Microelectrónica/ICs</option>
                    <option value="Accesorios">Accesorios</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    STOCK INICIAL
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={stockActual}
                    onChange={(e) => setStockActual(Number(e.target.value))}
                    className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    STOCK MÍNIMO (ALERTA)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={stockMinimo}
                    onChange={(e) => setStockMinimo(Number(e.target.value))}
                    className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    COSTO DE COMPRA ($ MXN)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={costoCompra}
                    onChange={(e) => setCostoCompra(Number(e.target.value))}
                    className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    PRECIO AL PÚBLICO ($ MXN)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={precioVenta}
                    onChange={(e) => setPrecioVenta(Number(e.target.value))}
                    className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    COMPATIBILIDAD
                  </label>
                  <input
                    type="text"
                    value={compatibilidad}
                    onChange={(e) => setCompatibilidad(e.target.value)}
                    placeholder="iPhone 15 Pro / Pro Max"
                    className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    UBICACIÓN FÍSICA
                  </label>
                  <input
                    type="text"
                    value={ubicacion}
                    onChange={(e) => setUbicacion(e.target.value)}
                    placeholder="Cajón A-05"
                    className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
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
                  className="px-4 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 font-semibold transition-colors"
                >
                  Guardar Refacción
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Repuesto */}
      {itemToEdit && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161619] border border-zinc-700/80 rounded-lg w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-zinc-300" />
                <h3 className="text-sm font-semibold text-zinc-100">Editar Refacción ({itemToEdit.sku})</h3>
              </div>
              <button
                onClick={() => setItemToEdit(null)}
                className="text-zinc-400 hover:text-zinc-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    DESCRIPCIÓN DEL REPUESTO *
                  </label>
                  <input
                    type="text"
                    required
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none font-medium"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    CÓDIGO SKU / BARRAS *
                  </label>
                  <input
                    type="text"
                    required
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value)}
                    className="w-full bg-[#1c1c20] text-zinc-100 font-mono uppercase px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    CATEGORÍA
                  </label>
                  <select
                    value={editCategoria}
                    onChange={(e) => setEditCategoria(e.target.value as any)}
                    className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  >
                    <option value="Pantallas">Pantallas</option>
                    <option value="Baterías">Baterías</option>
                    <option value="Flex y Puertos">Flex y Puertos</option>
                    <option value="Microelectrónica/ICs">Microelectrónica/ICs</option>
                    <option value="Accesorios">Accesorios</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    STOCK ACTUAL
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editStockActual}
                    onChange={(e) => setEditStockActual(Number(e.target.value))}
                    className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    STOCK MÍNIMO (ALERTA)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editStockMinimo}
                    onChange={(e) => setEditStockMinimo(Number(e.target.value))}
                    className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    COSTO DE COMPRA ($ MXN)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editCostoCompra}
                    onChange={(e) => setEditCostoCompra(Number(e.target.value))}
                    className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    PRECIO AL PÚBLICO ($ MXN)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editPrecioVenta}
                    onChange={(e) => setEditPrecioVenta(Number(e.target.value))}
                    className="w-full bg-[#1c1c20] text-zinc-100 font-mono px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    COMPATIBILIDAD
                  </label>
                  <input
                    type="text"
                    value={editCompatibilidad}
                    onChange={(e) => setEditCompatibilidad(e.target.value)}
                    className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-mono text-[11px] mb-1">
                    UBICACIÓN FÍSICA
                  </label>
                  <input
                    type="text"
                    value={editUbicacion}
                    onChange={(e) => setEditUbicacion(e.target.value)}
                    className="w-full bg-[#1c1c20] text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700/60 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setItemToEdit(null)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 font-semibold transition-colors"
                >
                  Actualizar Refacción
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminación */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161619] border border-rose-900/60 rounded-lg w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-zinc-800 bg-rose-950/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Confirmar Eliminación</h3>
              </div>
              <button
                onClick={() => setItemToDelete(null)}
                className="text-zinc-400 hover:text-zinc-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-zinc-300">
                ¿Estás seguro de que deseas eliminar permanentemente este repuesto del inventario?
              </p>

              <div className="p-3 bg-[#111114] border border-zinc-800 rounded-lg space-y-1">
                <p className="font-semibold text-zinc-100">{itemToDelete.nombre}</p>
                <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400">
                  <span>SKU: {itemToDelete.sku}</span>
                  <span>·</span>
                  <span>Stock actual: {itemToDelete.stockActual} u.</span>
                </div>
              </div>

              <p className="text-[11px] text-zinc-400">
                Esta acción dará de baja la pieza en almacén y registrará un movimiento de ajuste.
              </p>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setItemToDelete(null)}
                  className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar Definitivamente</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
