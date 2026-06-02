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
