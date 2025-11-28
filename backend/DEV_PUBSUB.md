# Local Pub/Sub Developer Guide (backend)

This file documents the quick, verified steps to run the local Pub/Sub emulator, initialize topics/subscriptions and verify subscribers for the `backend` service.

Prerequisites
- Docker Desktop (or Docker + docker-compose v2)
- Node.js 18+ (only required for local/host commands)

Recommended (containerized) flow

1. From repo root, bring up everything:

```bash
docker compose up -d --build
```

2. Confirm the emulator is running and the API is available on `localhost:8085`:

```bash
docker logs --tail 50 pubsub-emulator
# look for: "Server started, listening on 8085"
```

3. Initialize topics & subscriptions (idempotent):

```bash
export PUBSUB_EMULATOR_HOST=localhost:8085
export PUBSUB_PROJECT=test-project
cd backend
npm run init-pubsub
```

Expected output will indicate whether topics/subscriptions already exist or were created.

4. Publish a quick test message:

```bash
npm run publish-test
# Expected: Published test message id: <n>
```

5. Verify subscribers received messages (from repo root):

```bash
docker logs --tail 200 orders_subscriber
docker logs --tail 200 notifications_subscriber
docker logs --tail 200 inventory_subscriber
```

Host-based (optional) flow

1. Start the emulator via docker (compose handles this), then from `backend/`:

```bash
export PUBSUB_EMULATOR_HOST=localhost:8085
export PUBSUB_PROJECT=test-project
npm install
npm run start    # start backend server
# or run subscribers individually
npm run start-subscriber
npm run start-notifications-subscriber
npm run start-inventory-subscriber

# then init and publish as above
npm run init-pubsub
npm run publish-test
```

Proto toolchain (build instructions)

We use `protobufjs` (pbjs/pbts) to generate JS + TypeScript declarations without requiring `protoc`.

Proto files are canonical in the repository root `proto/` (shared across services). From `backend/` run:

```bash
# install dev deps (one-time)
npm install

# generate JS + .d.ts into `backend/src/gen`
npm run proto:build

# clean generated artifacts
npm run proto:clean
```

Recommendation: do not commit generated `src/gen` files — generate in CI as part of the build. If your team prefers to commit generated artifacts to reduce friction, document that choice explicitly in this file.


Troubleshooting
- If you see `ALREADY_EXISTS` during init: that's fine — the script is idempotent and will handle it.
- If a subscriber reports `Resource not found (resource=orders-sub)`, ensure `PUBSUB_EMULATOR_HOST` is exported in the environment where the subscriber runs and re-run `npm run init-pubsub`.
- If ports conflict, note the emulator dashboard is mapped to `localhost:8081` and the emulator API to `localhost:8085` in `docker-compose.yml`.

Contact
- If anything is unclear or the team wants this added to the repo README, I can create a short `DEV.md` and link to this file.
