# Servidor portátil de WhatsApp para CelMart

## Iniciar

Requisito: Docker Desktop (Windows/macOS) o Docker Engine con Compose v2 (Linux), con el motor abierto. Ejecuta `iniciar.bat` o `./iniciar.sh` desde esta carpeta. La primera ejecución genera claves aleatorias en `.env`; después las conserva. Se publican API 8080, PostgreSQL y Redis internos; sólo 8080 se enlaza al equipo.

La imagen Evolution v2.3.7 está fijada por digest. Las rutas y el entorno se basan en las fuentes oficiales:
- https://github.com/EvolutionAPI/evolution-api/blob/main/docker-compose.yaml
- https://github.com/EvolutionAPI/evolution-api/blob/main/.env.example
- https://github.com/EvolutionAPI/evolution-api/blob/main/src/api/routes/instance.router.ts
- https://github.com/EvolutionAPI/evolution-api/blob/main/src/api/routes/sendMessage.router.ts

El arranque no envía mensajes ni crea cuentas. Crea una instancia `celmart` con `POST /instance/create` (header `apikey` con la clave de `.env`) y cuerpo `{"instanceName":"celmart","integration":"WHATSAPP-BAILEYS","qrcode":true}`. Conecta el QR desde los dispositivos vinculados de WhatsApp. Si necesitas regenerarlo consulta `GET /instance/connect/celmart`. También puedes administrarlo con Evolution Manager compatible. Conserva la clave de instancia devuelta por Evolution para configurar el acceso del frontend.

## Usarlo desde CelMart en Vercel / celulares

En Configuraciones elige **Evolution API directo**, URL base HTTPS del servidor, API Key e instancia `celmart`. El endpoint de envío se construye como `/message/sendText/celmart` y la conexión se verifica en `/instance/connectionState/celmart`. El modo Webhook mantiene el contrato de versiones anteriores. Evolution directo envía texto con el enlace de seguimiento para consultar las fotos; no adjunta las fotos como medios separados.

`http://localhost:8080` sirve para administrar la API en esa PC. Para la app HTTPS de Vercel o los celulares necesitas una URL **HTTPS** que llegue a esta computadora mediante tu proxy/túnel, y `CORS_ORIGIN` con el origen de CelMart. `localhost` en un celular apunta al celular, no a la PC. No desactives las protecciones del navegador: si bloquea HTTP/CORS se usa wa.me. El enlace de red puede actualizarse en la configuración compartida al cambiar de computadora.

El enlace está limitado a 127.0.0.1 por defecto, adecuado para un proxy local. Si tu proxy está en otro equipo configura `BIND_ADDRESS` según tu red. Modifica `SERVER_URL` si usas un dominio HTTPS y ejecuta el script otra vez para recrear el contenedor con ese entorno.

## Cambiar de computadora sin perder la sesión

1. Ejecuta `docker compose down` en la PC original y espera a que termine. No uses `down -v` ni borres la carpeta de datos.
2. Copia **toda** la carpeta `whatsapp-server`, incluyendo `.env` y `sesion_whatsapp`, al nuevo equipo con Docker. Incluye PostgreSQL, Redis y `instances`; copiar sólo el QR/instances no conserva el estado completo.
3. Ejecuta el script en el nuevo equipo y actualiza su URL HTTPS en CelMart si cambió. Usa la misma versión/arquitectura compatible de Docker/PostgreSQL; para cambiar arquitectura exporta/restaura la base con herramientas de PostgreSQL.
4. No levantes la misma sesión en las dos computadoras a la vez. WhatsApp puede requerir volver a vincular si revoca la sesión.

`sesion_whatsapp` y `.env` están excluidos de Git. Copiarlos a otro equipo es parte del traslado; nunca los publiques en GitHub.

## Respaldo manual y límites

El frontend espera como máximo 1,5 s por intento, sin reintentos automáticos. Si falla, prepara wa.me en una pestaña reservada durante el toque. Cuando el navegador bloquea ventanas emergentes ofrece un enlace manual explícito. En avisos automáticos en segundo plano, donde no existe un gesto para abrir pestañas, el respaldo aparece en el modal de WhatsApp. Un timeout puede ocurrir después de que el proveedor recibió el mensaje: revisa WhatsApp antes de confirmar el envío manual.

El indicador verde de Evolution exige una instancia en estado `open`; en Webhook confirma accesibilidad HTTP, no la entrega al teléfono. Los scripts configuran reinicio automático tras reiniciar Docker; el equipo y Docker deben estar encendidos para enviar por API.
