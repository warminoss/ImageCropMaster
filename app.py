import os
import logging
from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix
from routes import bp as routes_bp

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app)

# Cloud Run : seul espace d’écriture = /tmp
UPLOAD_DIR = "/tmp/uploads"
PROCESSED_DIR = "/tmp/processed"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

app.config["UPLOAD_FOLDER"] = UPLOAD_DIR
app.config["PROCESSED_FOLDER"] = PROCESSED_DIR
app.config["MAX_CONTENT_LENGTH"] = int(os.environ.get("MAX_UPLOAD_MB", "50")) * 1024 * 1024

# Enregistrer le blueprint
app.register_blueprint(routes_bp)

@app.get("/api/health")
def health():
    return {"ok": True, "upload_dir": UPLOAD_DIR, "processed_dir": PROCESSED_DIR}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
