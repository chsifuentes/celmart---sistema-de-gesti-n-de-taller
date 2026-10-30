
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

Si la API falla o tarda más de 10 segundos, queda disponible el mensaje con fallback manual. El modal reserva la pestaña durante el toque y, si el navegador la bloquea, ofrece un enlace `wa.me` explícito. No hay reintentos automáticos de envío porque una respuesta interrumpida puede haber sido aceptada por el proveedor. Revisa WhatsApp antes de reenviar un mensaje cuyo resultado sea incierto.

## Fase 3: configuración global, seguimiento, QR y PWA

`configuracion_taller` conserva un único registro `default` con `config_json` y una fecha `updated_at` asignada por servidor. La primera sesión autenticada inicializa ese registro desde su caché existente; después, Supabase es la fuente compartida y `localStorage` acelera la carga o sirve de fallback si falla la red. Guardar hace un `upsert`, y Realtime actualiza las otras sesiones. Un formulario que ya se está editando conserva el borrador y avisa si llega una configuración externa; exige cargarla antes de guardar. Si dos guardados llegan exactamente a la vez, permanece el último JSON guardado.

El enlace `https://TU-DOMINIO/?track=OS-2401` abre el portal sin login. La entrada pública se carga por separado y consulta exclusivamente `get_order_tracking(p_order_id)`: una función SQL con proyección explícita por folio exacto. No concede lectura anónima de `ordenes` ni de `configuracion_taller`. La respuesta excluye PIN/patrón, IMEI, nombre/correo completo, teléfono completo, notas internas y claves API; sólo conserva los últimos cuatro dígitos del teléfono. Las fotos de evidencia del bucket público, la falla y el presupuesto forman parte del seguimiento solicitado.

Los eventos públicos de Realtime sólo contienen el folio y provocan una nueva consulta filtrada; nunca transmiten filas privadas. El portal también resincroniza al recuperar foco/conexión y cada 15 segundos mientras está visible. La función `SECURITY DEFINER` tiene `search_path` vacío, parámetros acotados y permisos de ejecución explícitos; los triggers privilegiados viven en un esquema privado no expuesto.

Los comprobantes de 58/80 mm incluyen un QR SVG generado localmente con `qrcode.react`, margen blanco y el enlace legible como alternativa. La variable `{{link_seguimiento}}` está disponible en las plantillas de WhatsApp. Las plantillas personalizadas existentes se conservan; se puede insertar la variable desde Configuraciones.

Para entregar, la app exige el estado **Listo**. El primer cambio a **Entregado** registra `ordenes.entregado_at` desde el servidor y conserva esa fecha frente a cambios posteriores. Las órdenes históricas ya entregadas mantienen fecha desconocida; no se inventa una. El tablero, el expediente y el ticket ofrecen enviar el comprobante final y la garantía en un toque, por API o con WhatsApp manual como respaldo.

La PWA utiliza `manifest.json`, iconos CM en SVG/PNG y modo `standalone`. En Android usa **Instalar aplicación / Añadir a pantalla de inicio**; en iOS, **Compartir → Añadir a pantalla de inicio**. El service worker sólo conserva iconos, manifest y la página de desconexión. No almacena respuestas de Supabase, datos del taller, fotos ni mensajes, y no permite operaciones offline con información desactualizada.
