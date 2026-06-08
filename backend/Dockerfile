FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod 755 /app/entrypoint.sh

COPY . .

EXPOSE 8000

ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]
