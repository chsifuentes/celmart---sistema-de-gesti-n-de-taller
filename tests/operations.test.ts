import assert from 'node:assert/strict';
import test from 'node:test';
import {createMockSupabaseClient} from '../src/lib/supabase';
import {
  canAssignPart,
  canTransitionOrder,
  cashNet,
  isPaymentMethod,
  ORDER_TRANSITIONS,
  PAYMENT_METHODS,
  warrantyActive,
  workshopDate,
} from '../src/lib/operations';
import type { OrderStatus } from '../src/types';
import {initialOrders} from '../src/data/initialData';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
import {Sidebar} from '../src/components/Sidebar';
test('business day follows Mexico City midnight and cash math includes opening and all three methods once',()=>{
  assert.equal(workshopDate(new Date('2026-10-31T02:00:00Z')),'2026-10-30');
  assert.equal(cashNet(100,{fecha:'x',total_efectivo:500,total_transferencia:200,total_tarjeta:75.25,gastos_repuestos:150,sin_metodo:0}),725.25);
});

test('delivered orders are terminal and cannot receive parts; warranty is always a linked reentry',()=>{
  const states = Object.keys(ORDER_TRANSITIONS) as OrderStatus[];
  for(const state of states){
    assert.equal(canTransitionOrder('Entregado',state),false,`Entregado → ${state}`);
    assert.equal(canTransitionOrder(state,'Garantía'),false,`${state} → Garantía`);
    assert.equal(canTransitionOrder(state,'Entregado'),state==='Listo',`${state} → Entregado`);
    assert.equal(canAssignPart(state),state!=='Entregado');
  }
  assert.equal(canAssignPart({...initialOrders[0],estado:'Entregado'}),false);
  assert.equal(canTransitionOrder('En Reparación','En Diagnóstico'),true);
  assert.equal(canTransitionOrder('Garantía','En Diagnóstico'),true);
  assert.equal(canTransitionOrder('Recibido','Recibido'),false);
});

test('payment method validation accepts only the three explicit collection methods',()=>{
  assert.deepEqual(PAYMENT_METHODS,['Efectivo','Transferencia','Tarjeta']);
  for(const method of PAYMENT_METHODS) assert.equal(isPaymentMethod(method),true);
  for(const method of [undefined,null,'','tarjeta','Crédito',0,{}]) assert.equal(isPaymentMethod(method),false);
});

test('card delivery contributes to the daily summary and immutable close',async()=>{
  const d=createMockSupabaseClient();
  await d.from('ordenes').insert({id:'OS-9971',estado:'Listo',total_estimado:350});
  const delivered=await d.from('ordenes').update({estado:'Entregado',metodo_pago:'Tarjeta',monto_cobrado:325}).eq('id','OS-9971');
  assert.equal(delivered.error,null);
  const summary=await d.rpc('resumen_caja',{p_fecha:workshopDate()});
  assert.equal(summary.error,null);
  assert.equal(summary.data.total_tarjeta,325);
  assert.equal(summary.data.total_efectivo,0);
  assert.equal(summary.data.total_transferencia,0);
  const closed=await d.rpc('cerrar_caja',{p_apertura:100,p_observaciones:'Incluye terminal bancaria'});
  assert.equal(closed.error,null);
  assert.equal(closed.data.total_tarjeta,325);
  assert.equal(closed.data.total_neto,425);
});
test('warranty boundaries are exact and unknown dates never become eligible',()=>{const o={...initialOrders[0],estado:'Entregado' as const,garantiaDias:1,fechaEntrega:'2026-10-01T12:00:00Z'};assert.equal(warrantyActive(o,new Date('2026-10-02T11:59:59Z')),true);assert.equal(warrantyActive(o,new Date('2026-10-02T12:00:00Z')),false);assert.equal(warrantyActive({...o,fechaEntrega:undefined}),false);});
test('warranty reentry creates sequential children without changing original money or date',async()=>{const d=createMockSupabaseClient();await d.from('ordenes').insert({id:'OS-99999',estado:'Entregado',entregado_at:new Date().toISOString(),garantia_dias:90,total_estimado:500,costo_mano_obra:500,tecnico_nombre:'Técnico anterior'});const a=await d.rpc('reingreso_garantia',{p_order_id:'OS-99999',p_motivo:'Falla recurrente'});const b=await d.rpc('reingreso_garantia',{p_order_id:'OS-99999',p_motivo:'Segunda revisión'});assert.equal(a.error,null);assert.equal(a.data.id,'OS-99999-G1');assert.equal(b.data.id,'OS-99999-G2');assert.equal(a.data.costo_mano_obra,0);assert.equal(a.data.tecnico_nombre,'Técnico anterior');const original=await d.from('ordenes').select('*').eq('id','OS-99999').single();assert.equal(original.data.total_estimado,500);});
test('consumed parts use purchase cost at assignment and decrease stock atomically',async()=>{const d=createMockSupabaseClient();await d.from('inventario').insert({id:'p4',sku:'P4',nombre:'HDMI',stock_actual:2,costo_compra:30,precio_venta:100});await d.from('ordenes').insert({id:'OS-998',estado:'En Reparación',costo_mano_obra:200,repuestos_asignados:[]});const a=await d.rpc('asignar_repuesto',{p_order_id:'OS-998',p_sku:'P4',p_cantidad:2});assert.equal(a.data.total_estimado,400);await d.from('inventario').update({costo_compra:500}).eq('id','p4');const s=await d.rpc('resumen_caja',{p_fecha:workshopDate()});assert.equal(s.data.gastos_repuestos,60);assert.ok((await d.rpc('asignar_repuesto',{p_order_id:'OS-998',p_sku:'P4',p_cantidad:1})).error);});
test('close rejects unclassified payments and duplicate closes, saves immutable day totals',async()=>{const d=createMockSupabaseClient();await d.from('ordenes').insert({id:'OS-997',estado:'Entregado',entregado_at:new Date().toISOString(),monto_cobrado:250});assert.ok((await d.rpc('cerrar_caja',{p_apertura:100,p_observaciones:''})).error);await d.from('ordenes').update({metodo_pago:'Transferencia'}).eq('id','OS-997');const c=await d.rpc('cerrar_caja',{p_apertura:100,p_observaciones:'Turno final'});assert.equal(c.error,null);assert.equal(c.data.total_neto,350);assert.ok((await d.rpc('cerrar_caja',{p_apertura:100})).error);});
test('navigation always exposes the complete workshop without a role selector',()=>{
 const html=renderToStaticMarkup(React.createElement(Sidebar,{activeTab:'dashboard',setActiveTab:()=>{},collapsed:false,setCollapsed:()=>{},activeOrdersCount:0,lowStockCount:0}));
 for(const label of ['Dashboard','Clientes','Inventario','Corte de Caja','Reportes','Configuraciones']) assert.match(html,new RegExp(label));
 assert.doesNotMatch(html,/Perfil del turno/);
});
