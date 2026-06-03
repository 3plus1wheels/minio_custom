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

Run backend, frontend, and MinIO:

```bash
cp .env.example .env
docker compose -f compose.yml up --build
```

Open:

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api
- MinIO console: http://localhost:9001

MinIO login:

- Username: value of `MINIO_ROOT_USER` in `.env`
- Password: value of `MINIO_ROOT_PASSWORD` in `.env`

Share links use `MINIO_PUBLIC_ENDPOINT` from `.env`. For local development this can be `http://localhost:9000`. For deployment, set it to the public MinIO API origin users can reach, for example:

```env
MINIO_PUBLIC_ENDPOINT=https://minio.example.com
```

Do not commit `.env`. It contains the MinIO root credentials and Django signing key.

Compose stores generated data in Docker named volumes:

- `MINIO_DATA_DIR` (default `./minio-data`): object data mounted into MinIO at `/data`
- `backend_data`: SQLite database

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
