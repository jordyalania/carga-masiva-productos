# Migraciones PostgreSQL

Las aplicaciones ejecutan automáticamente las migraciones al arrancar. `migrate.sql` exporta el mismo SQL con historial y bloqueo transaccional para uso con psql:

```sh
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U app -d cargas < backend/database/migrate.sql
```

El script es idempotente respecto al ledger `platform.migrations`. No guarda ni crea contraseñas de usuario. Auth crea la cuenta inicial desde el entorno privado durante el arranque.

Regenerar al cambiar SQL de migraciones: `python3 scripts/export_migrations.py`. Verificar que el cambio se entregue como una nueva versión de migración; no editar una versión ya aplicada a un entorno existente.
