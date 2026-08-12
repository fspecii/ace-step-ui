# VEMO Frontend Integration

VEMO uses a separated architecture so the customer-facing frontend can be redesigned independently from the AI music engine.

## Architecture

```text
myvemo.online
    |
    v
VEMO API
    |
    +-- Auth / Users
    +-- Songs / Library
    +-- Playlists / Likes / Comments
    +-- Generation Queue
    +-- Uploads / Storage
    |
    v
ACE-Step 1.5 (private GPU service)
```

ACE-Step must not be called directly from the browser. The frontend communicates only with the VEMO API.

## Free Product Rule

VEMO is being built as a free product. Do not add billing, subscriptions, credits, paid tiers, checkout flows, usage-based payment gates, or payment-provider dependencies.

Operational protections such as queueing, abuse prevention, rate limiting, and fair-use safeguards may be implemented without creating paid access tiers.

## Production Origins

Recommended production setup:

- Frontend: `https://myvemo.online`
- API: `https://api.myvemo.online`
- ACE-Step: private/internal URL such as `http://gpu-worker:8001`

The backend environment should contain:

```env
NODE_ENV=production
SERVICE_NAME=VEMO API
FRONTEND_URL=https://myvemo.online
FRONTEND_URLS=https://myvemo.online
ACESTEP_API_URL=http://gpu-worker:8001
JWT_SECRET=<long-random-secret>
```

## Core Frontend API Surface

### Authentication

- `GET /api/auth/auto`
- `POST /api/auth/setup`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`

### Music Generation

- `POST /api/generate`
- `GET /api/generate/status/:jobId`
- `GET /api/generate/history`
- `POST /api/generate/upload-audio`
- `POST /api/generate/format`

Recommended frontend flow:

1. User completes the Create form.
2. Frontend sends `POST /api/generate`.
3. API returns a generation job ID.
4. Frontend polls `GET /api/generate/status/:jobId`.
5. Display queued/running progress.
6. When the job succeeds, load the generated track into the user's library/player.

### Songs / Library

- `GET /api/songs`
- `GET /api/songs/public`
- `GET /api/songs/public/featured`
- `GET /api/songs/:id`
- `POST /api/songs`
- `PATCH /api/songs/:id`
- `DELETE /api/songs/:id`
- `POST /api/songs/:id/like`
- `PATCH /api/songs/:id/privacy`
- `POST /api/songs/:id/play`

### Users

- `GET /api/users/:username`
- `GET /api/users/:username/songs`
- `GET /api/users/:username/playlists`
- `GET /api/users/public/featured`
- `PATCH /api/users/me`

### Playlists

- `POST /api/playlists`
- `GET /api/playlists`
- `GET /api/playlists/:id`
- `POST /api/playlists/:id/songs`
- `DELETE /api/playlists/:id/songs/:songId`

## Frontend Product Structure

Recommended navigation for the remixed frontend:

- Home
- Create
- Discover
- Library
- Playlists
- Studio
- Profile

Keep the default Create experience simple. Advanced ACE-Step controls should live behind an Advanced section so new users are not overwhelmed.

## Phase Plan

### Phase 1 — Backend separation

- Rename/rebrand backend as VEMO.
- Make frontend origin configurable.
- Keep ACE-Step private behind VEMO.
- Document API contract.
- Keep product free with no billing code.

### Phase 2 — Frontend remix

- Import/recreate the `myvemo.online` frontend source.
- Connect Create, Library, Player, Discover, Profile, and Playlists to VEMO APIs.
- Remove mock/static data.

### Phase 3 — Production deployment

- Deploy the frontend.
- Deploy the VEMO API separately from the GPU worker.
- Configure domain routing, HTTPS, environment variables, persistent database, and audio storage.

### Phase 4 — Studio features

- Reference audio.
- Audio cover/remix.
- Repainting/extend workflows.
- Stem extraction.
- Audio editor.
- Advanced generation controls.

### Phase 5 — Scale and reliability

- Move from SQLite to PostgreSQL when necessary.
- Move audio from local disk to durable object storage/CDN.
- Add queue protections, monitoring, backups, and abuse prevention while keeping VEMO free.
