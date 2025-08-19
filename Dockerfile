FROM python:3.12-slim

# libs nécessaires pour Pillow + HEIF
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo libpng16-16 libwebp7 libtiff6 libheif1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8080
ENV PYTHONUNBUFFERED=1

# forme shell pour que $PORT soit bien pris en compte
CMD gunicorn -b 0.0.0.0:$PORT -w 2 app:app
