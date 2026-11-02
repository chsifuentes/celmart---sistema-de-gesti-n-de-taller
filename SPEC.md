# CelMart — Contrato SDD, Etapa 1

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

## Criterios de aceptación y publicación

- Pruebas de sesión nula, sesión demorada, identidad obsoleta, error/timeout, login explícito, logout inmediato, recarga después de logout y seguimiento público independiente.
- Pruebas de agrupación Kanban de todos los estados, tres columnas simultáneas de escritorio, tabs móviles, filtros, acciones y edición inline sin pérdida de borradores.
- Pruebas de ausencia de imports/archivos redundantes y de SQL canónico idempotente; mantener pruebas de persistencia, medios, offline y privacidad.
- `npm test`, `npm run lint` (TypeScript estricto) y `npm run build` deben pasar antes de publicar en `main`. Verificar visualmente laboratorio en escritorio y móvil y confirmar el resultado del despliegue.
