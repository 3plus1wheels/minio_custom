# MinIO S3 Wrapper

Two-folder scaffold:

- `backend/`: Django REST API with JWT auth and MinIO-backed bucket/object endpoints.
- `frontend/`: Vite React shell for later screenshot-driven UI work.

## Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver
```

Run tests:

```bash
cd backend
.venv/bin/python manage.py test
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## Docker Compose

Run backend, frontend, PostgreSQL 17, and MinIO:

```bash
cp .env.example .env
docker compose -f compose.yml up --build
```

Open:

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api
- MinIO console: http://localhost:9001
- PostgreSQL: localhost:5432

Create the first root app user after the stack is running:

```bash
docker compose -f compose.yml exec backend python manage.py createsuperuser
```

Log in to the frontend with that account. Open the `Admin` tab to create normal users and assign visibility grants.

App roles:

- `superuser`: full root access, including admins and all storage.
- `admin`: manages editor/viewer users and visibility grants; cannot manage superusers.
- `editor`: reads and writes only granted buckets or prefixes.
- `viewer`: reads only granted buckets or prefixes.

Visibility grants:

- Target can be a role or a specific user.
- Blank prefix means the whole bucket.
- `write` implies `read`.
- Editor/viewer accounts see no buckets until an admin or superuser grants access.

MinIO login:

- Username: value of `MINIO_ROOT_USER` in `.env`
- Password: value of `MINIO_ROOT_PASSWORD` in `.env`

PostgreSQL login:

- Host: `localhost`
- Port: value of `POSTGRES_HOST_PORT` in `.env`, default `5432`
- Maintenance database: value of `POSTGRES_DB` in `.env`, default `minio_custom`
- Username: value of `POSTGRES_USER` in `.env`
- Password: value of `POSTGRES_PASSWORD` in `.env`

pgAdmin 4 setup:

1. Right-click `Servers`.
2. Select `Register` > `Server...`.
3. On `General`, set `Name` to `minio_custom`.
4. On `Connection`, set:
   - `Host name/address`: `localhost`
   - `Port`: value of `POSTGRES_HOST_PORT` in `.env`
   - `Maintenance database`: value of `POSTGRES_DB` in `.env`
   - `Username`: value of `POSTGRES_USER` in `.env`
   - `Password`: value of `POSTGRES_PASSWORD` in `.env`
5. Click `Save`.
6. Expand `Servers > minio_custom > Databases > minio_custom > Schemas > public > Tables`.

If local PostgreSQL already uses port `5432`, set `POSTGRES_HOST_PORT=5433` in `.env` and use port `5433` in pgAdmin. Red X icons on other pgAdmin databases usually mean stale or disconnected entries; they are unrelated to this Docker database.

Share links use `MINIO_PUBLIC_ENDPOINT` from `.env`. For local development this can be `http://localhost:9000`. For deployment, set it to the public MinIO API origin users can reach, for example:

```env
MINIO_PUBLIC_ENDPOINT=https://minio.example.com
```

Do not commit `.env`. It contains the MinIO root credentials and Django signing key.

Compose stores generated data in Docker named volumes:

- `MINIO_DATA_DIR` (default `./minio-data`): object data mounted into MinIO at `/data`
- `postgres_data`: PostgreSQL database cluster

The backend now uses PostgreSQL only. The Compose stack creates the database and user from the `POSTGRES_*` environment values on first startup, then `backend/entrypoint.sh` runs Django migrations.

For production on a dedicated server, set `MINIO_DATA_DIR` to a stable host path such as `/srv/minio/data` or `/mnt/minio-data`. The local `minio-data/` folder is ignored by git. Docker pulls the MinIO image locally; image layers stay outside the repository.

Windows Server production example:

```env
MINIO_DATA_DIR=D:/minio/data
```

Create the folder before starting Compose:

```powershell
mkdir D:\minio\data
docker compose -f compose.yml up -d --build
```

Back up the `D:\minio\data` folder. Avoid using `./minio-data` in production because the project folder can move or be replaced during deploys.
