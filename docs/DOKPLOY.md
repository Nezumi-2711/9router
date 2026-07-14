# Deploying 9Router with Dokploy

This guide deploys 9Router from this Git repository and keeps its application
data through every rebuild and container replacement.

## Persistence design

The Compose stack mounts the named Docker volume `9router-data` at `/app/data`.
`DATA_DIR` is explicitly set to that location. The application stores its
SQLite database, generated JWT secret, database migration backups, tunnel
state, and other runtime state there.

```text
Docker volume: 9router-data
Container path: /app/data
Database:       /app/data/db/data.sqlite
Backups:        /app/data/db/backups/
JWT secret:     /app/data/jwt-secret
```

Dokploy replaces the container when a new commit is deployed; named Docker
volumes survive that operation. **Do not change `DATA_VOLUME_NAME` after the
first successful deployment**, or Dokploy will mount a new, empty volume.

## 1. Create the Dokploy application

1. Create a **Compose** application in Dokploy and connect this repository.
2. Select the branch that should deploy (for example, `main`).
3. Use the repository root and `docker-compose.yml` as the Compose file.
4. Enable automatic deployment on pushes for the selected branch.

The Compose file contains a `build` section, so every deploy builds the image
from the exact checked-out commit rather than pulling a published image.

The `9router` service is also limited to **0.5 CPU** and **2 GB RAM** through
the Compose `deploy.resources.limits` configuration. The limit is per
`9router` container instance; the optional `headroom` sidecar has independent
resource usage.

## 2. Configure environment variables

In the Dokploy application's **Environment** settings, add the following
values. Keep these values in Dokploy; do not commit an `.env` file.

| Variable | Required | Value |
| --- | --- | --- |
| `JWT_SECRET` | Yes | A unique random value, for example `openssl rand -hex 32` |
| `INITIAL_PASSWORD` | Yes | A strong password used for the first login |
| `API_KEY_SECRET` | Yes | A unique random value, for example `openssl rand -hex 32` |
| `MACHINE_ID_SALT` | Yes | A unique random value, for example `openssl rand -hex 32` |
| `DATA_VOLUME_NAME` | Recommended | `9router-data` — choose a unique stable name per environment |
| `AUTH_COOKIE_SECURE` | Recommended | `true` when serving through an HTTPS domain |
| `IMAGE_TAG` | Optional | A stable label such as `dokploy` |

`DATA_DIR`, `PORT`, `HOSTNAME`, and `NODE_ENV` are intentionally fixed in
`docker-compose.yml`; do not override them in Dokploy.

The bundled `headroom` service is retained for token compression. It does not
hold 9Router application data. To use a different Headroom endpoint, set
`HEADROOM_URL` in Dokploy.

## 3. Attach a domain

Add the application's public domain in Dokploy and target the `9router`
service on internal port `20128`. Let Dokploy/Traefik terminate TLS. With TLS
enabled, retain `AUTH_COOKIE_SECURE=true`.

## 4. Deploy and verify persistence

1. Run the first deployment, open `/dashboard`, and sign in.
2. Add a provider connection or a model combo, then change a setting.
3. Push a harmless commit to the configured branch.
4. Wait for Dokploy's automatic deployment to finish and sign in again.
5. Verify the provider, combo, and setting are still present.

If the dashboard is empty after a redeploy, check that the running service has
both `DATA_DIR=/app/data` and the original `DATA_VOLUME_NAME`. Do not delete
the `9router-data` Docker volume when deleting/recreating the application.

## Backup and restore

The data volume is persistent but is not a backup. Take regular, off-host
copies of the entire `/app/data` directory, especially
`/app/data/db/data.sqlite`. Include the `jwt-secret` file so existing browser
sessions remain valid after a disaster recovery.

Before a manual restore:

1. Stop the Dokploy application so SQLite is not being written.
2. Restore the saved contents into the existing `DATA_VOLUME_NAME` volume.
3. Ensure the restored files are writable by the container's `node` user.
4. Start the application and confirm `/api/health` returns `{ "ok": true }`.

Never run two 9Router containers against the same SQLite volume at once.
SQLite is suitable for this single-instance deployment, not shared multi-node
storage.
