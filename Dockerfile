FROM python:3.12-slim

# dépendances systèmes pour pillow + heif
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo libpng16-16 libwebp7 libtiff6 libheif1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8080
CMD ["gunicorn", "-b", "0.0.0.0:${PORT}", "-w", "2", "app:app"]
