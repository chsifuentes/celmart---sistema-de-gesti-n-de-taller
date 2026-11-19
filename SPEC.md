# CelMart — Contrato SDD, Etapas 1 y 2

Este archivo es la fuente de verdad del producto. Una implementación, refactorización o prueba que contradiga este contrato debe corregirse antes de publicar. Los cambios de contrato requieren una solicitud explícita y una revisión de sus pruebas; no se justifican por conveniencia de implementación.

## SPEC 1.1 — Design System y arquitectura

- Estilo **Linear / Claude Dark Industrial**, compacto y legible; no introducir espacios vacíos, superficies decorativas ni controles de configuración en el Header.
- Canvas `#0c0c0e`; superficies/paneles `#161619`; headers/subpaneles `#111114`; inputs/controles `#1c1c20`.
- Bordes `border-zinc-800/80`; hover `border-zinc-700`. Los colores semánticos se reservan para urgencia, estado, garantía y errores.
- Fuente operativa **Plus Jakarta Sans**, base `text-xs`. **JetBrains Mono** / `font-mono` para folios, IMEI, SKU, precios y tiempos.
- Primarios compactos: `px-3.5 py-2 text-xs font-semibold`. Prohibidos los primarios blancos gigantes `w-full bg-zinc-100` en vistas de escritorio. Un formulario móvil o un comprobante imprimible no determina el diseño del tablero de escritorio.
- Header del sistema: una fila de 64 px, búsqueda, switch Recepción/Taller, notificaciones, nueva orden, avatar y candado. La píldora offline sólo aparece si corresponde. WhatsApp se configura exclusivamente en Configuraciones.
- Todos los integrantes autenticados acceden al Dashboard completo, Clientes, Inventario, Corte de Caja, Reportes y Configuraciones; no hay selector de roles ni variantes degradadas de las tablas.
- No crear archivos de microcomponentes para controles sencillos. Ubicación, operaciones de una orden y conexión WhatsApp viven dentro del contexto que los utiliza. Mantener componentes de vista, expedientes y comprobantes con responsabilidad real; no consolidar repositorios o algoritmos independientes por simple conteo de archivos.
- La definición SQL canónica y ejecutable es **`supabase_schema.sql`**, idempotente. No mantener scripts de fases sueltos ni otra copia SQL divergente. Conservar los datos y el historial de migración ya aplicado en el servidor.

## SPEC 1.2 — Límite de autenticación

1. `main.tsx` selecciona la entrada antes de montar el taller: con `?track=...` se monta **únicamente** `PublicOrderTracker`, incluido el manejo de un folio inválido. Sin ese parámetro se monta el taller protegido.
2. `App.tsx` inicia `isAuthenticated = false`. Ni la caché de órdenes ni `celmart_offline_identity` autorizan el acceso al Dashboard.
3. Sólo una sesión no nula devuelta por `supabase.auth.getSession()` habilita la restauración; una respuesta tardía no puede anular un logout o un inicio de sesión más reciente. Un error, timeout o ausencia de sesión mantiene `LoginView`.
4. El login explícito usa `signInWithPassword`, comprueba que exista una sesión y vincula su usuario antes de habilitar el taller. Un error mantiene el formulario y sus valores, sin simular éxito.
5. Mock: un navegador nuevo devuelve `session: null`. Restaurar requiere una bandera explícita creada por un login y una sesión mock válida; una identidad/caché antigua por sí sola no basta. No aceptar credenciales vacías ni guardar la contraseña.
6. El candado visible del Header cierra inmediatamente el taller, invalida restauraciones pendientes, limpia identidad y banderas de sesión, descarta selecciones y borradores privados en memoria y solicita `supabase.auth.signOut`. No se espera a la red para volver a `LoginView`.
7. Conservar los cambios offline ya persistidos para su cuenta original: cerrar sesión no equivale a borrar una cola pendiente. No enviar nuevas operaciones desde una sesión bloqueada. La caché sólo se vuelve a mostrar tras verificar la sesión.
8. Sin red, una sesión verificable por el SDK puede dar acceso al caché. Si el SDK no puede verificarla, prevalece el guardián: el caché no es una credencial alternativa. El seguimiento público nunca devuelve PIN/patrón, notas internas ni datos completos de contacto.

## SPEC 1.3 — Laboratorio & Mesa de Trabajo

### Barra operativa

Una fila compacta adaptable: a la izquierda `Laboratorio & Mesa de Trabajo`, filtros `Todos los activos`, `Mis asignados`, `🔥 Urgentes`; a la derecha técnico activo y `+ Recepción Rápida`. En móvil se permite acomodar controles sin desbordamiento horizontal. No hay una barra blanca central de ancho completo.

### Tablero

- Escritorio (`lg`, 1024 px o más): ancho disponible completo, `lg:grid-cols-3`, tres columnas simultáneas; no ocultar columnas por una pestaña móvil ni centrar la vista en una columna angosta.
- Móvil (`< lg`): tres tabs compactos, un toque cambia la columna visible.
- `📥 Por Diagnosticar`: Recibido y En Diagnóstico. Los reingresos en estado Garantía también entran aquí, conservando su distintivo y vínculo.
- `🔬 En Mesa / Espera`: En Reparación, Esperando Repuesto y Esperando Presupuesto.
- `✅ Listos para Entrega`: Listo. Entregado sale del tablero; conserva su expediente y la acción de comprobante final.
- Los filtros y la búsqueda se combinan; Mis asignados requiere un técnico seleccionado, sin inferirlo del nombre de una cuenta. La urgencia se ordena primero dentro de cada columna.

### Tarjeta compacta

1. Folio mono, badge de categoría, tiempo y punto de urgencia.
2. Marca/modelo semibold y cliente. Pulsar el cuerpo abre el expediente completo; evitar botones interactivos anidados.
3. Píldoras mono de PIN/patrón y ubicación editable en línea; falla a una línea truncada con su texto completo accesible.
4. Miniaturas y barra de acciones compactas: +Foto, Etiqueta, WA, avance lógico de estado. Las acciones no disparan el click del cuerpo. Conservar la captura trasera, compresión WebP y guardas contra doble guardado.
5. No inventar fechas históricas: el ingreso utiliza su fecha registrada y la alerta >48 h depende de un cambio de estado verificable. Notas, fotos o ubicaciones no reinician esa fecha.

## SPEC 1.4 — Consolidación sin regresiones

- Eliminar `LocationControl.tsx`, `OrderOperations.tsx`, `WhatsAppConnectionControl.tsx` tras integrar su comportamiento, sin imports residuales.
- Conservar cobros, garantías, refacciones y validaciones de entrega; compresión WebP, galerías, QR SVG, seguimiento público y WhatsApp API/manual con timeout existente.
- Conservar caché, cola FIFO durable, idempotencia de servidor, separación por cuenta, reintentos y resolución explícita de conflictos. No borrar trabajo pendiente para simplificar el logout.
- SQL maestro completo para una instalación nueva y para una base existente; repetirlo no elimina datos, duplica triggers/políticas ni rebaja controles de acceso.

## SPEC 2.1 — Estados y entrega financiera

- `operations.ts` define la máquina de estados que comparten las vistas y la cola offline. Las correcciones entre estados operativos siguen disponibles; `Entregado` es terminal y `Garantía` se crea mediante un reingreso vinculado, nunca como cambio normal de la orden original.
- La entrega sólo parte de `Listo`. Una orden entregada no admite cambios normales de estado ni asignación/edición de refacciones. La acción de reingreso valida la garantía y crea una suborden; no altera la fecha, el pago ni el presupuesto originales.
- Solicitar `Entregado` desde tabla, expediente o laboratorio pasa por la misma coordinación. Si falta un método de pago, se abre una confirmación compacta con **Total a Cobrar** editable, `💵 Efectivo`, `🏦 Transferencia`, `💳 Tarjeta` y **Confirmar Entrega e Imprimir Garantía**.
- Método e importe válidos, fecha de entrega y estado se guardan en una operación atómica; no se deja una orden cobrada y sin entregar por un fallo intermedio. El servidor fija la fecha definitiva; una repetición de la misma operación no cobra ni entrega por segunda vez. Un descuento final modifica el monto efectivamente cobrado y conserva el presupuesto como referencia.
- Los importes admiten cero, deben ser finitos y no negativos. Los únicos métodos admitidos son `Efectivo`, `Transferencia` y `Tarjeta`. El corte del día de Ciudad de México suma los tres por la fecha real de entrega; un corte histórico sin columna de tarjeta se interpreta con cero, sin inventar ingresos.
- El comprobante conserva el QR y la garantía existentes. El formulario de entrega usa panel `#161619`, controles `#1c1c20`, bordes `border-zinc-800/80` y botones compactos; no agrega controles permanentes al Header.

## SPEC 2.2 — Asignación transaccional de refacciones y Kardex

- Antes de asignar una pieza, verificar stock positivo y cantidad entera mayor que cero; la cantidad solicitada no puede exceder las existencias. Un faltante se explica claramente y no modifica orden, stock ni movimientos.
- Una asignación confirmada descuenta la cantidad del inventario, agrega la pieza a la orden y registra un movimiento `salida` con motivo **`Asignado a orden OS-XXXX ({modelo})`**. El movimiento conserva folio, ítem, cantidad y costo de compra al momento del consumo; los movimientos históricos `consumo` siguen siendo legibles.
- Orden, existencias, consumo y Kardex se actualizan dentro de la misma transacción de Supabase, con bloqueo de filas. Dos dispositivos no pueden consumir la misma última pieza. La identidad de una operación offline evita descontar o registrar dos veces al reintentar tras perder la respuesta.
- El precio de venta multiplicado por cantidad incrementa el presupuesto de la orden; el costo de compra se conserva separado para el corte y el margen. Una nueva asignación no recalcula ni elimina otros importes o descuentos previos.
- Retirar una refacción de una orden activa revierte su asignación: repone la cantidad al inventario, registra `entrada` con motivo **`Retirado de orden OS-XXXX`** y descuenta su precio asignado del presupuesto. Se conserva la trazabilidad y el costo original; la restitución también es transaccional e idempotente. Una orden entregada no admite esta operación.
- Sin conexión se conserva la operación en la cola y se proyectan juntos los cambios locales de orden, stock y Kardex. Al sincronizar, el servidor vuelve a validar el stock y el estado: un conflicto queda visible y pendiente de resolución, sin sobrescribir datos de otro dispositivo ni inventar existencias.

## SPEC 2.3 — Venta Rápida Mostrador (POS)

- Inventario y Corte de Caja ofrecen **`⚡ Venta Rápida Mostrador`** como acción compacta. El POS abre un modal con búsqueda por nombre/SKU, selección de un ítem disponible, cantidad y método de pago entre Efectivo, Transferencia y Tarjeta; no agrega una barra permanente al Header.
- Sólo se venden cantidades enteras positivas que no excedan el stock. El servidor utiliza el precio de venta y costo de compra vigentes, conserva sus snapshots y calcula el importe; no acepta un precio inventado por otro dispositivo o una caché antigua.
- Una venta descuenta existencias, registra su salida en Kardex y guarda el ingreso de mostrador en una sola transacción, sin crear una orden de servicio. Reintentar una venta confirmada conserva su identidad y no duplica stock ni ingreso.
- El corte suma los ingresos de mostrador por método y día de Ciudad de México, junto con las entregas. El costo del inventario vendido y las devoluciones se reflejan en sus movimientos; el cierre conserva su fotografía histórica y no se reescribe por un retorno posterior.
- Se permite imprimir un ticket compacto opcional de mostrador. Una venta offline permanece en la cola durable con su salida e ingreso proyectados; los comprobantes locales se identifican como pendientes hasta confirmar con Supabase. Un conflicto se muestra y no se presenta como una venta confirmada.

## SPEC 2.4 — Búsqueda global con teclado

- `Ctrl+K` y `⌘K` enfocan el buscador existente, sin agregar controles ni cambiar la fila compacta del Header. Los atajos y Enter no interrumpen una composición IME en curso.
- Enter sobre un folio exacto abre su expediente, incluidos `OS-XXXX`, folios offline con sufijo y subórdenes `-G1`, `-G2`, etc. La comparación normaliza espacios y mayúsculas sin confundir una coincidencia parcial con un folio exacto.
- Enter sobre un SKU exacto abre Inventario y filtra ese repuesto. Una búsqueda libre mantiene el filtrado actual de clientes/equipos; no dispara una venta ni altera existencias.

## Criterios de aceptación y publicación

- Pruebas de sesión nula, sesión demorada, identidad obsoleta, error/timeout, login explícito, logout inmediato, recarga después de logout y seguimiento público independiente.
- Pruebas de agrupación Kanban de todos los estados, tres columnas simultáneas de escritorio, tabs móviles, filtros, acciones y edición inline sin pérdida de borradores.
- Pruebas de ausencia de imports/archivos redundantes y de SQL canónico idempotente; mantener pruebas de persistencia, medios, offline y privacidad.
- Pruebas de estado terminal, reingreso separado, entrega con los tres métodos, descuento final y corte con tarjeta; ningún cambio de vista elude la confirmación financiera.
- Pruebas de asignación sin stock, cantidad múltiple, consumo concurrente de la última pieza, rollback e idempotencia del Kardex, incluida su proyección y sincronización offline.
- Pruebas de retiro/restock y reversión de costo, venta de mostrador sin orden ficticia, stock insuficiente, ingresos por los tres métodos y reintentos sin duplicados.
- Pruebas DOM de `Ctrl+K`/`⌘K`, Enter con folio o SKU exactos, protección IME y limpieza de listeners; conservar el Header de una sola fila sin selectores extra.
- `npm test`, `npm run lint` (TypeScript estricto) y `npm run build` deben pasar antes de publicar en `main`. Verificar visualmente laboratorio en escritorio y móvil y confirmar el resultado del despliegue.
