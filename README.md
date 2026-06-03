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

Do not commit `.env`. It contains the MinIO root credentials and Django signing key.

Compose stores generated data in Docker named volumes:

- `minio_data`: object data
- `backend_data`: SQLite database

These volumes are not committed to git. Git stores only Docker/Compose config. Docker pulls the MinIO image locally; image layers and bucket data stay outside the repository.
