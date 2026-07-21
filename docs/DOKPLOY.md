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
2. Select the `master` branch.
3. Use the repository root and `docker-compose.yml` as the Compose file.
4. Leave Dokploy **Auto Deploy** disabled. GitHub Actions is the deployment
   authority for this setup.

Do not configure a Dokploy deployment webhook for the same branch. Enabling
both Dokploy Auto Deploy and the GitHub workflow can create two deployments for
one push and prevents the workflow from reliably identifying the rollout it
triggered.

The Compose file contains a `build` section, so every deploy builds the image
from the exact checked-out commit rather than pulling a published image.

The `9router` service is also limited to **0.5 CPU** and **512 MB RAM** through
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

## 4. Configure GitHub Actions deployment

Create a protected GitHub Environment named `production`. Restrict it to the
`master` branch and optionally require a reviewer before production
deployments.

Add these environment values:

| Name | Kind | Value |
| --- | --- | --- |
| `DOKPLOY_API_TOKEN` | Secret | API key generated from the Dokploy profile settings |
| `DOKPLOY_URL` | Variable | Public Dokploy base URL without a trailing slash, for example `https://dokploy.example.com` |
| `DOKPLOY_COMPOSE_ID` | Variable | ID of this Compose service in Dokploy |
| `NINEROUTER_PUBLIC_URL` | Variable | Public 9Router URL used for the post-deployment health check |

Both URL variables must use HTTPS.

The API key must be allowed to deploy the Compose service and read its
deployment records. GitHub-hosted runners must be able to reach the Dokploy API
over HTTPS. If the trigger or tracking request consistently returns HTTP 403,
check whether Cloudflare bot protection is challenging Dokploy API requests.

The Compose ID can be found in the Dokploy service URL. The workflow passes it
to the action's `application_id` input because
`benbristow/dokploy-deploy-action@0.2.2` uses that input for both Applications
and Compose services. `service_type: compose` selects the Compose API.

The workflow in `.github/workflows/dokploy-deploy.yml` runs for pushes to
`master` and can also be started with **Run workflow**. It performs these steps:

1. Records the deployment IDs that already exist for the Compose service.
2. Triggers the Compose deployment with
   `benbristow/dokploy-deploy-action@0.2.2`.
3. Finds the new deployment and waits for `done`, `error`, or `cancelled`.
4. After `done`, retries `GET /api/health` until it returns `{ "ok": true }`.
5. Writes deployment metadata and the final result to the GitHub job summary.

The action itself only confirms that Dokploy accepted the deploy request with
HTTP 200. The repository's tracking script performs the actual progress and
final-status checks. It does not report a percentage or copy full Dokploy build
logs into GitHub; use the Dokploy deployment page for detailed build logs.

Production deployments are serialized. Do not manually start another deploy
for this Compose service while the GitHub workflow is running. If multiple new
deployment records appear, the workflow fails safely instead of tracking an
ambiguous deployment.

Runtime secrets such as `JWT_SECRET`, `INITIAL_PASSWORD`, `API_KEY_SECRET`, and
`MACHINE_ID_SALT` remain in Dokploy. They do not need to be copied into the
GitHub Environment.

## 5. Deploy and verify persistence

1. Run the first deployment, open `/dashboard`, and sign in.
2. Add a provider connection or a model combo, then change a setting.
3. Push a harmless commit to the configured branch.
4. Wait for the GitHub Actions deployment and health check to finish, then sign
   in again.
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
