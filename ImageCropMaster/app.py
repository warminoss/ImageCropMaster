import os
import logging
from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)

app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-key-change-in-production")

app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500 Mo

# Adapte ces chemins à ton NAS
app.config['UPLOAD_FOLDER'] = "/volume1/homes/Web_App/uploads"
app.config['PROCESSED_FOLDER'] = "/volume1/homes/Web_App/processed"

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['PROCESSED_FOLDER'], exist_ok=True)

try:
    import routes  # routes doit faire `from app import app`
except Exception as e:
    logger.error(f"Erreur import routes : {e}")

if __name__ == "__main__":
    port = 5050
    logger.info(f"Démarrage Flask sur http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
