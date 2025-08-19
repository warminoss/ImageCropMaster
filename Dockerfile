FROM python:3.12-slim

# dépendances systèmes pour pillow + heif
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo libpng16-16 libwebp7 libtiff6 libheif1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# copie des requirements (⚠️ mets bien en minuscules dans ton repo : requirements.txt)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8080
ENV PYTHONUNBUFFERED=1   # logs envoyés immédiatement (utile sur Cloud Run)

CMD ["gunicorn", "-b", "0.0.0.0:${PORT}", "-w", "2", "app:app"]
