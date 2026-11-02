# Despliegue en servidor

La demo en vivo está desplegada así: el mismo `compose.yaml` en un servidor Linux con Docker, detrás del Traefik que ya tenía el servidor, y con el correo real enviado por MailerSend.

## Pasos

1. Instalar Docker con Compose y clonar el repositorio.
2. Crear el archivo privado `.env` con secretos aleatorios:

   ```sh
   python3 backend/tests/setup_env.py
   ```

3. Apuntar un dominio a la IP del servidor y completar `.env`:

   ```sh
   APP_DOMAIN=carga.ejemplo.com
   # Datos del Traefik existente (se ven con docker inspect de su contenedor)
   TRAEFIK_NETWORK=nombre_de_la_red_de_traefik
   TRAEFIK_CERTRESOLVER=nombre_del_resolver
   TRAEFIK_ENTRYPOINT=websecure
   # Correo real (credenciales SMTP de MailerSend y remitente verificado)
   MAILERSEND_SMTP_USER=...
   MAILERSEND_SMTP_PASSWORD=...
   MAILERSEND_FROM=...
   NOTIFICATION_TEST_RECIPIENT=...
   ```

4. Arrancar:

   ```sh
   docker compose -f compose.yaml -f compose.traefik.yaml -f compose.mailersend.yaml up -d --build --wait --wait-timeout 600
   ```

Traefik obtiene el certificado HTTPS en la primera visita al dominio.

## Qué queda expuesto

Solo el contenedor `web` (nginx) se conecta a la red de Traefik. PostgreSQL, RabbitMQ, SeaweedFS, los microservicios y sus endpoints internos quedan en una red privada, sin puertos publicados. Los paneles de RabbitMQ y Mailpit solo escuchan en `127.0.0.1` del servidor y se consultan por túnel SSH. `compose.traefik.yaml` también fija límites de memoria para convivir con otros servicios del servidor.

## Servidor sin proxy

Si el servidor no tiene Traefik ni otro proxy en los puertos 80/443, `compose.server.yaml` añade Caddy, que gestiona HTTPS por su cuenta:

```sh
docker compose -f compose.yaml -f compose.server.yaml -f compose.mailersend.yaml up -d --build --wait --wait-timeout 600
```

## Operación

- `docker compose ... down` detiene la solución y conserva los datos. `down -v` los borra.
- Hacer backups de PostgreSQL y SeaweedFS y probar su restauración: un volumen persistente no es un backup.
- No ejecutar las pruebas de recuperación sobre el entorno activo. `scripts/verify_local.py` crea su propio proyecto temporal.
- El usuario de base de datos es compartido para simplificar la evaluación. En producción, separar credenciales y privilegios por servicio.
