import os
import time
import logging
from flask import Flask, request, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix
from routes import bp as routes_bp

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("image-api")

# ── App (force templates/static) ───────────────────────────────────────────────
app = Flask(__name__, template_folder="templates", static_folder="static")
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# ── Stockage éphémère Cloud Run (/tmp uniquement) ─────────────────────────────
UPLOAD_DIR = "/tmp/uploads"
PROCESSED_DIR = "/tmp/processed"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

app.config["UPLOAD_FOLDER"] = UPLOAD_DIR
app.config["PROCESSED_FOLDER"] = PROCESSED_DIR
app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("MAX_UPLOAD_MB", "50")) * 1024 * 1024

# TTL (durée de vie) des fichiers éphémères pour le petit garbage collector
TMP_TTL_SECONDS = int(os.environ.get("TMP_TTL_SECONDS", "1800"))  # 30 min par défaut

# ── GC des fichiers temporaires ────────────────────────────────────────────────
def _gc_tmp(root: str, ttl_seconds: int) -> None:
    """Supprime silencieusement les fichiers plus vieux que ttl_seconds."""
    now = time.time()
    try:
        for d, _, files in os.walk(root):
            for f in files:
                p = os.path.join(d, f)
                try:
                    if now - os.path.getmtime(p) > ttl_seconds:
                        os.remove(p)
                except Exception:
                    pass
    except Exception:
        pass

@app.before_request
def _gc_hook():
    # petit ménage avant chaque requête
    _gc_tmp(UPLOAD_DIR, TMP_TTL_SECONDS)
    _gc_tmp(PROCESSED_DIR, TMP_TTL_SECONDS)

# ── Anti-cache pour les binaires (preview/download) ───────────────────────────
API_PREFIX = "/api"

@app.after_request
def _no_store_for_binary(resp):
    """
    On ne met 'no-store' que sur /api/preview/* et /api/download/*,
    pour ne pas impacter les assets du front.
    """
    try:
        path = request.path or ""
        if path.startswith(f"{API_PREFIX}/preview/") or path.startswith(f"{API_PREFIX}/download/"):
            resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0, private"
            resp.headers["Pragma"] = "no-cache"
            resp.headers["Expires"] = "0"
    except Exception:
        pass
    return resp

# ── Routes (blueprint) montées sous /api ──────────────────────────────────────
app.register_blueprint(routes_bp, url_prefix=API_PREFIX)

# ── Root ping simple (utile pour Cloud Run) ───────────────────────────────────
@app.get("/")
def root():
    return jsonify(ok=True, message="ImageCropMaster API", health=f"{API_PREFIX}/health")

# ── Healthcheck ───────────────────────────────────────────────────────────────
@app.get(f"{API_PREFIX}/health")
def health():
    return {
        "ok": True,
        "upload_dir": UPLOAD_DIR,
        "processed_dir": PROCESSED_DIR,
        "ttl_seconds": TMP_TTL_SECONDS,
    }

# ── Local dev ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    log.info(f"Démarrage Flask sur 0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
