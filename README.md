
# CelMart — gestión de taller

## Preparar Supabase y ejecutar

1. Ejecutar, en orden, `supabase_migration.sql`, `supabase_phase2_compatibility.sql` y `supabase_phase3.sql` en el proyecto Supabase que ya contiene `ordenes`, `inventario`, `clientes` y `tecnicos`. Son repetibles. Completan campos, historial, configuración compartida y seguimiento público seguro.
2. Copiar `.env.example` a `.env.local` y configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con la URL y clave pública del proyecto. Nunca usar una clave `service_role` en el cliente.
3. Ejecutar `npm ci`, `npm run lint`, `npm test` y `npm run build`. Para desarrollo: `npm run dev`.
4. Iniciar sesión con los usuarios existentes. Las políticas RLS existentes de `ordenes` e `inventario` deben permitir a esos usuarios leer y modificar las filas del taller; la migración conserva esas políticas.

La migración crea el bucket público `taller-media` y las políticas públicas de lectura/escritura solicitadas, limitadas a ese bucket. Agrega `ordenes` e `inventario` a `supabase_realtime` sin quitar otras tablas.

## Funcionalidad incluida

- Persistencia de categoría, checklist completo, notas, repuestos, total estimado, fotos e imagen de inventario, con lectura compatible con columnas nulas. Un checklist anterior sin detalle se muestra como **sin comprobar**.
- Actualización Realtime de órdenes, inventario, técnicos y movimientos entre sesiones, con limpieza de suscripciones y resincronización al recuperar conexión/foco. El expediente abierto utiliza la orden actualizada.
- Recepción con seis categorías y sus checklists; captura con cámara trasera o selección de archivos; galería de evidencia y fotos durante la reparación.
- Compresión nativa en el navegador a WebP, máximo 1200 px de ancho, calidad 0.72 y proporción conservada, antes de subir a Storage. El tamaño depende del contenido: aproximadamente 50 KB es una referencia, no un límite garantizado.
- Las notas, repuestos y fotos se guardan con comparación de la versión anterior y reintentos para evitar sobrescribir cambios simultáneos. Los repuestos y el total se actualizan en una misma escritura de la orden. Su movimiento de inventario es una escritura separada; si falla, se muestra el aviso sin repetir la asignación.
- Los errores de guardado conservan los datos del formulario y se muestran al usuario.

Sin credenciales se activa el modo demostración: tablas guardadas en `localStorage`, fotos WebP como DataURL y Realtime simulado. Las pestañas del mismo navegador comparten datos; la sincronización entre dispositivos requiere Supabase. El compresor también devuelve DataURL cuando el navegador está offline; esto permite probarlo localmente, pero no es una cola de sincronización offline para un proyecto real.

## Verificación

`npm test` cubre el cliente mock, compresión, lectura de datos anteriores y escrituras concurrentes de notas, fotos y repuestos. `npm run lint` ejecuta TypeScript con las definiciones oficiales de React 19; `npm run build` genera el bundle de producción.

Para verificar Supabase después de ejecutar la migración, abrir dos sesiones del taller: crear una orden con checklist y foto, añadir notas/repuestos/fotos desde ambas sesiones, comprobar que el expediente abierto se actualiza y recargar. Revisar también altas/cambios/bajas de inventario en la otra sesión. La cámara del teléfono requiere HTTPS o un contexto local seguro.

## Fase 2: trabajo en PC y celular

El Header permite elegir **Recepción** o **Modo Taller** en cualquier pantalla. Si no hay una preferencia guardada, los anchos menores de 768 px comienzan en Taller. La elección se conserva en ese navegador; no cambia por girar el teléfono.

El tablero de Taller muestra **En cola**, **En mesa** y **Listos**, con búsqueda, folio, categoría, falla, PIN/patrón y fotos. Permite avanzar estados, guardar notas rápidas, fotografiar evidencia y abrir WhatsApp. Los borradores y cargas se conservan al cambiar de cola o buscar. **Recibir Equipo Exprés** abre el asistente y la cámara trasera desde el mismo toque; si se cancela la cámara, el formulario sigue disponible. La impresión no se activa por defecto en recepción exprés.

El inventario mantiene su tabla de administración e incorpora miniaturas. Los formularios de alta y edición aceptan una URL de imagen, pegar una imagen con Ctrl+V, tomar una foto o seleccionar un archivo. Las imágenes propias pasan por compresión WebP; los enlaces externos se conservan como enlaces y no ocupan Storage.

## WhatsApp API / webhook opcional

En **Configuraciones → Automatización WhatsApp API / Webhook** se guardan la activación, URL, API Key e instancia en la configuración compartida de Supabase, accesible sólo para usuarios autenticados del taller. Sin una URL activa se conserva el flujo `wa.me`. El botón **Probar conexión** realiza `HEAD`: comprueba accesibilidad desde ese navegador, no envía mensajes ni garantiza que las credenciales de mensajería sean válidas. Una ruta sólo POST puede responder 405 a esa comprobación.

El endpoint debe aceptar el siguiente contrato JSON por POST:

```json
{
  "phone": "5215512345678",
  "message": "Actualización de la orden",
  "orderId": "OS-2401",
  "instance": "celmart",
  "mediaUrls": ["https://…/evidencia.webp"]
}
```

Se envía la clave configurada en `apikey` y `Authorization: Bearer …`. La URL corresponde al webhook/adaptador del proveedor elegido (Evolution API, WAHA o WhatsApp Cloud API), que transforma este contrato al formato específico del proveedor. Debe permitir CORS para el dominio de la app y los headers anteriores; la clave configurada debe estar destinada a ese acceso desde navegador.

Con la automatización activada, las altas y los cambios de estado guardados por esta sesión generan una solicitud en segundo plano. La entrega ofrece su propio botón de comprobante final y garantía, evitando un segundo aviso genérico. Recibir un evento Realtime no vuelve a enviar mensajes. Una respuesta 2xx se registra como **aceptación por API**, sin afirmar entrega al teléfono. El modal de WhatsApp también utiliza el mismo servicio con el texto editado por el usuario.

Si la API falla o tarda más de 1.5 segundos, queda disponible el mensaje con fallback manual. El modal reserva la pestaña durante el toque y, si el navegador la bloquea, ofrece un enlace `wa.me` explícito. No hay reintentos automáticos de envío porque una respuesta interrumpida puede haber sido aceptada por el proveedor. Revisa WhatsApp antes de reenviar un mensaje cuyo resultado sea incierto.

## Fase 3: configuración global, seguimiento, QR y PWA

`configuracion_taller` conserva un único registro `default` con `config_json` y una fecha `updated_at` asignada por servidor. La primera sesión autenticada inicializa ese registro desde su caché existente; después, Supabase es la fuente compartida y `localStorage` acelera la carga o sirve de fallback si falla la red. Guardar hace un `upsert`, y Realtime actualiza las otras sesiones. Un formulario que ya se está editando conserva el borrador y avisa si llega una configuración externa; exige cargarla antes de guardar. Si dos guardados llegan exactamente a la vez, permanece el último JSON guardado.

El enlace `https://TU-DOMINIO/?track=OS-2401` abre el portal sin login. La entrada pública se carga por separado y consulta exclusivamente `get_order_tracking(p_order_id)`: una función SQL con proyección explícita por folio exacto. No concede lectura anónima de `ordenes` ni de `configuracion_taller`. La respuesta excluye PIN/patrón, IMEI, nombre/correo completo, teléfono completo, notas internas y claves API; sólo conserva los últimos cuatro dígitos del teléfono. Las fotos de evidencia del bucket público, la falla y el presupuesto forman parte del seguimiento solicitado.

Los eventos públicos de Realtime sólo contienen el folio y provocan una nueva consulta filtrada; nunca transmiten filas privadas. El portal también resincroniza al recuperar foco/conexión y cada 15 segundos mientras está visible. La función `SECURITY DEFINER` tiene `search_path` vacío, parámetros acotados y permisos de ejecución explícitos; los triggers privilegiados viven en un esquema privado no expuesto.

Los comprobantes de 58/80 mm incluyen un QR SVG generado localmente con `qrcode.react`, margen blanco y el enlace legible como alternativa. La variable `{{link_seguimiento}}` está disponible en las plantillas de WhatsApp. Las plantillas personalizadas existentes se conservan; se puede insertar la variable desde Configuraciones.

Para entregar, la app exige el estado **Listo**. El primer cambio a **Entregado** registra `ordenes.entregado_at` desde el servidor y conserva esa fecha frente a cambios posteriores. Las órdenes históricas ya entregadas mantienen fecha desconocida; no se inventa una. El tablero, el expediente y el ticket ofrecen enviar el comprobante final y la garantía en un toque, por API o con WhatsApp manual como respaldo.

La PWA utiliza `manifest.json`, iconos CM y modo `standalone`. En Android usa **Instalar aplicación / Añadir a pantalla de inicio**; en iOS, **Compartir → Añadir a pantalla de inicio**. El service worker conserva el App Shell compilado (HTML, JavaScript, CSS e iconos), incluidos los módulos de Recepción y Taller. No almacena respuestas de Supabase, WhatsApp ni fotos de clientes en Cache Storage. Los datos privados y la cola se conservan por separado en el almacenamiento local de la sesión autorizada, como se explica abajo.


## Fase 4: caja y garantías

Aplicar `supabase_phase4.sql` después de las migraciones anteriores. TypeScript se valida ahora con `strict: true`.

Recepción registra método (Efectivo/Transferencia) e importe en la ficha antes de entregar. El corte utiliza fecha de entrega y día de Ciudad de México, y bloquea el cierre si existen entregas de hoy sin clasificar. Las entregas históricas no reciben métodos inventados: se regularizan desde su ficha. El neto es apertura + efectivo + transferencias − costo de piezas consumidas; incluye dinero bancario, no sólo billetes en caja. Cada fecha tiene un único cierre, con autor de sesión y valores calculados por servidor. Se conserva el ticket del día para imprimir en58/80mm. Una caja cerrada impide nuevas entregas y consumos de piezas ese mismo día; cierra al terminar el turno. Las operaciones usan el mismo bloqueo transaccional para evitar movimientos simultáneos omitidos.

Asignar una pieza desde la orden descuenta stock, guarda su costo de compra de ese momento y registra el movimiento en una transacción. La evolución posterior del precio de compra no altera el corte. Los consumos históricos anteriores a esta versión, sin costo registrado, no se estiman. Los ajustes manuales del almacén no representan asignaciones a una reparación y no forman parte de este costo.

Para una garantía, buscar el folio original, abrir la ficha y escribir el motivo. La vigencia se verifica nuevamente en servidor, desde la entrega y sus días de garantía. Se crea OS-XXXX-G1/G2 sin modificar el cobro original, con mano de obra cero y asignación al técnico anterior. La nota, el distintivo púrpura, la alerta de cabecera y Realtime notifican el reingreso dentro del taller; no se envían mensajes externos al técnico. La garantía no se renueva a través de subórdenes encadenadas.

Todos los integrantes autenticados del taller comparten la interfaz completa: Dashboard, Clientes, Inventario, Corte de Caja, Reportes y Configuraciones. No hay selector ni restricciones de perfiles de turno. Se conserva el acceso autenticado de Supabase; los visitantes del seguimiento público no acceden a datos internos.

## Mesa de trabajo, servidor portátil y etiquetas

Ejecutar `supabase_phase5.sql` después de las migraciones anteriores. Guarda `ubicacion_fisica` y `estado_actualizado_at` en órdenes. La fecha de estado es autoritativa y sólo cambia al cambiar de estado; notas, fotos y ubicaciones no reinician la alerta de 48 h. No se inventan fechas de estado para órdenes históricas. El ingreso utiliza `created_at` real.

En Modo Taller, activar **Mis Equipos Asignados** y seleccionar ahí el técnico. La selección es explícita por turno: no se deduce la identidad a partir de un correo ni de un perfil. La ubicación se edita desde tarjeta o expediente y se sincroniza por Realtime.

**Imprimir Etiqueta de Equipo** abre la vista de 50×30mm/58mm, con QR SVG local, folio/fecha, modelo/cliente, ubicación y PIN/patrón. La etiqueta es de uso físico interno del taller: el QR público sigue excluyendo las claves y ubicaciones. El tamaño 50×30mm puede recortar textos largos; 58 mm admite su contenido completo. Usar escala 100 % y el papel correcto en el controlador térmico.

WhatsApp dispone de modo compartido Automático/Manual únicamente en Configuraciones, con comprobación periódica y límite de respuesta de 1,5 s. El servidor y las instrucciones para trasladar la sesión están en `whatsapp-server/README.md`. Requiere Docker en la PC elegida; no forma parte del alojamiento estático de Vercel. Si se usa Evolution directo, la URL es la base HTTPS, no la ruta de envío. Los webhooks previos siguen funcionando con su contrato original.

El Header conserva una sola fila de 64 px: búsqueda, switch Recepción/Taller, notificaciones, nueva orden y cuenta CM. Las miniaturas de inventario son de 36 px; la tabla completa conserva el desplazamiento horizontal en pantallas estrechas.

## Operación Offline-First y sincronización

La migración `supabase/migrations/20261031072357_offline_operations.sql` agrega el protocolo autenticado `apply_offline_operation` y su registro de idempotencia en el esquema privado. Debe aplicarse después de las fases anteriores. No se abren permisos anónimos ni se cambia la proyección privada del seguimiento; sólo se amplía su validación de folios.

`celmart_cache_orders`, `celmart_cache_inventory`, `celmart_cache_clients` y `celmart_cache_movements` son espejos de lectura. El gestor `offlineSync.ts` conserva en `celmart_sync_queue` un documento versionado con la base confirmada, la cuenta propietaria y las operaciones FIFO pendientes. Esa escritura es atómica y ocurre **antes** de notificar a React. Al hidratar o confirmar una operación, se vuelve a proyectar la cola sobre la base: una lectura atrasada o un evento Realtime no puede borrar notas, fotos o ajustes aún pendientes. Se usan Web Locks para serializar pestañas compatibles; cada dispositivo tiene su propia cola persistente.

Se admite sin red: recibir/imprimir una orden y su QR; cambiar estado; registrar notas, ubicación, fotos WebP, cobros y piezas; ajustar stock; crear/editar repuestos; y registrar clientes. Los folios nuevos tienen un sufijo aleatorio estable (`OS-2404-A1B2C3D4`), incluso al trabajar conectado: evita colisiones entre recepciones simultáneas y conserva exactamente el folio/QR ya impreso. El número inicial sigue avanzando con las órdenes vistas por ese dispositivo. Las órdenes y garantías anteriores siguen siendo válidas.

Al recuperar red, iniciar/reanudar la app o volver a enfocar la ventana, se procesa la cola en orden. Si la API cae aunque `navigator.onLine` siga en `true`, se conserva el cambio y se reintenta periódicamente. Una foto DataURL WebP se sube a `taller-media` con una ruta determinista por operación antes de guardar su URL. La operación y su resultado se registran en una misma transacción Postgres: si se pierde la respuesta, repetir el ID devuelve la confirmación sin duplicar notas, entregas ni movimientos. El stock se ajusta por delta bajo bloqueo de fila, conservando las modificaciones de otros dispositivos. Al vaciar la cola se refrescan todas las listas, con paginación para superar el límite de 1.000 filas por respuesta.

La píldora de la cabecera sólo aparece sin conexión o con trabajo pendiente. Al tocarla se consulta el estado y se puede reintentar. Un rechazo real (por ejemplo stock insuficiente, SKU duplicado, estado cambiado por otra persona o caja cerrada) **no se elimina ni se sobrescribe**: detiene la cola y muestra el motivo en ese pequeño panel. Sólo una decisión explícita y confirmada de **Conservar datos del servidor** descarta el cambio rechazado; si era un alta local, también se retiran sus cambios dependientes para evitar referencias huérfanas. Los fallos de red nunca habilitan el descarte automático.

Para preparar cada equipo, abrir la app una vez con internet e iniciar sesión. En una PWA existente, cerrar sus ventanas y volver a abrir con conexión permite activar el nuevo service worker: no se fuerza una recarga que pierda formularios en edición ni se mezclan versiones de assets. Después se puede recargar la aplicación sin internet usando la sesión local previamente autorizada. El primer acceso en un dispositivo nuevo requiere red. Cerrar sesión bloquea el acceso local; una cola pendiente sólo se puede enviar con su cuenta original. La sincronización continúa mientras la app está abierta o cuando se vuelve a abrir, no con la aplicación completamente cerrada.

El navegador debe permitir almacenamiento persistente. Si se agota su cuota, el cambio nuevo se rechaza claramente antes de alterar la vista; se conservan las operaciones ya guardadas. No borrar los datos del sitio ni desinstalar el navegador con cambios pendientes. Las imágenes ya alojadas en internet pueden requerir red si no están en la caché normal del navegador; las fotos locales pendientes siempre conservan su DataURL. Las fechas locales de estado/entrega son provisionales hasta la confirmación con el reloj del servidor. Los avisos WhatsApp pendientes no se envían retroactivamente de forma automática: se conserva el envío manual del comprobante una vez sincronizada la entrega.

Cierre de caja, validación de garantías, borrados, administración de técnicos y cambios de configuración requieren conexión; las restricciones financieras del servidor siguen vigentes. El diario local no permite saltarse una caja cerrada ni garantizar disponibilidad de stock que otra persona haya consumido mientras no había conexión.
