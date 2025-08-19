FROM python:3.12-slim

# dépendances systèmes pour pillow + heif
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo libpng16-16 libwebp7 libtiff6 libheif1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# copie des requirements (⚠️ le fichier du repo doit s’appeler requirements.txt en minuscules)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8080
# logs envoyés immédiatement (utile sur Cloud Run)
ENV PYTHONUNBUFFERED=1

CMD ["gunicorn", "-b", "0.0.0.0:${PORT}", "-w", "2", "app:app"]
