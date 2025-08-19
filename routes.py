import os
import uuid
import logging
from flask import Blueprint, render_template, request, jsonify, send_file, current_app
from werkzeug.utils import secure_filename
from utils.image_processor import ImageProcessor, get_image_info
from PIL import Image
from pillow_heif import register_heif_opener

logger = logging.getLogger(__name__)
register_heif_opener()  # Enable HEIC/HEIF support in Pillow

# Blueprint (évite l'import circulaire avec app)
bp = Blueprint("main", __name__)

# Formats autorisés (dont WebP/HEIC/HEIF)
ALLOWED_EXTENSIONS = {"tiff", "tif", "png", "jpg", "jpeg", "heic", "heif", "webp"}

MIME_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "tif": "image/tiff",
    "tiff": "image/tiff",
    "webp": "image/webp",
}

def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def is_valid_image_format(filepath: str) -> bool:
    try:
        with Image.open(filepath) as img:
            img.verify()
        return True
    except Exception:
        return False

# ────────────────────────────────────────────────────────────────────────────────
# Pages / Vue
# ────────────────────────────────────────────────────────────────────────────────

@bp.route("/")
def index():
    return render_template("index.html")

# ────────────────────────────────────────────────────────────────────────────────
# Upload
# ────────────────────────────────────────────────────────────────────────────────

@bp.route("/upload", methods=["POST"])
def upload_file():
    try:
        logger.info("Upload request received")
        logger.info(f"Request files: {list(request.files.keys())}")

        if "file" not in request.files:
            logger.error("No file in request")
            return jsonify({"error": "No file selected"}), 400

        file = request.files["file"]
        logger.info(f"File received: {file.filename}, size: {file.content_length}")

        if not file.filename:
            logger.error("Empty filename")
            return jsonify({"error": "No file selected"}), 400

        if not allowed_file(file.filename):
            logger.error(f"Invalid file format: {file.filename}")
            return jsonify({"error": "Invalid file format. Please upload TIFF, PNG, JPEG, HEIC, or WebP files."}), 400

        filename = f"{uuid.uuid4()}_{secure_filename(file.filename)}"
        upload_dir = current_app.config["UPLOAD_FOLDER"]
        filepath = os.path.join(upload_dir, filename)
        file.save(filepath)
        file_size = os.path.getsize(filepath)
        logger.info(f"File saved successfully, size: {file_size} bytes")

        ext = filename.rsplit(".", 1)[-1].lower()

        # Conversion HEIC/HEIF → JPEG pour l’aperçu uniquement
        preview_filename = filename
        preview_filepath = filepath

        if ext in ["heic", "heif"]:
            logger.info("Detected HEIC/HEIF format, creating JPEG preview...")
            image = Image.open(filepath)
            preview_filename = filename.rsplit(".", 1)[0] + "_preview.jpg"
            preview_filepath = os.path.join(upload_dir, preview_filename)
            image.save(preview_filepath, format="JPEG", quality=95)
            logger.info(f"Preview created as {preview_filename}")

        if not is_valid_image_format(filepath):
            logger.error("Invalid image format after validation")
            os.remove(filepath)
            if preview_filepath != filepath and os.path.exists(preview_filepath):
                os.remove(preview_filepath)
            return jsonify({"error": "Invalid or corrupted image file"}), 400

        logger.info("Getting image information...")
        image_info = get_image_info(filepath)
        logger.info(f"Image info retrieved: {image_info}")

        return jsonify({
            "success": True,
            "filename": filename,
            "preview_filename": preview_filename,
            "image_info": image_info
        })

    except Exception as e:
        logger.error(f"Upload error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

# ────────────────────────────────────────────────────────────────────────────────
# Preview
# ────────────────────────────────────────────────────────────────────────────────

@bp.route("/preview/<filename>")
def preview_image(filename):
    try:
        filepath = os.path.join(current_app.config["UPLOAD_FOLDER"], filename)

        if "_preview.jpg" in filename and os.path.exists(filepath):
            return send_file(filepath, mimetype="image/jpeg")

        if not os.path.exists(filepath):
            return jsonify({"error": "File not found"}), 404

        ext = filename.rsplit(".", 1)[-1].lower()
        mimetype = MIME_TYPES.get(ext, "image/jpeg")
        return send_file(filepath, mimetype=mimetype)

    except Exception as e:
        logger.error(f"Preview error: {str(e)}")
        return jsonify({"error": "Preview failed"}), 500

# ────────────────────────────────────────────────────────────────────────────────
# Process
# ────────────────────────────────────────────────────────────────────────────────

@bp.route("/process", methods=["POST"])
def process_image():
    try:
        data = request.get_json(force=True, silent=False)
        filename = data.get("filename")
        focus_x = float(data.get("focus_x", 0.5))
        focus_y = float(data.get("focus_y", 0.5))
        zoom = float(data.get("zoom", 1.0))
        orientation = data.get("orientation", "portrait")

        if not filename:
            return jsonify({"error": "No filename provided"}), 400

        input_path = os.path.join(current_app.config["UPLOAD_FOLDER"], filename)
        if not os.path.exists(input_path):
            return jsonify({"error": "Input file not found"}), 404

        base_name, extension = os.path.splitext(filename)
        crop_suffix = "2x3" if orientation == "portrait" else "3x2"

        # extension de sortie
        output_ext = extension
        with Image.open(input_path) as img:
            is_16bit_tiff = img.format == "TIFF" and img.mode in ["I;16", "I;16L", "I;16B"]
            if not is_16bit_tiff and extension.lower() in [".tif", ".tiff", ".heic", ".heif"]:
                output_ext = ".jpg"

        output_filename = f"{base_name}_cropped_{crop_suffix}{output_ext}"
        output_path = os.path.join(current_app.config["PROCESSED_FOLDER"], output_filename)

        logger.info(f"Starting image processing: {input_path} -> {output_path}")
        processor = ImageProcessor()

        try:
            success = processor.crop_image(
                input_path,
                output_path,
                focus_x=focus_x,
                focus_y=focus_y,
                zoom=zoom,
                orientation=orientation,
            )

            if not success:
                logger.error("Image processing returned failure")
                return jsonify({"error": "Image processing failed"}), 500

            if not os.path.exists(output_path):
                logger.error("Output file was not created")
                return jsonify({"error": "Processing failed - output file not created"}), 500

            logger.info("Getting processed image info...")
            processed_info = get_image_info(output_path)

        except Exception as proc_error:
            logger.error(f"Processing exception: {str(proc_error)}")
            return jsonify({"error": f"Processing failed: {str(proc_error)}"}), 500

        return jsonify({
            "success": True,
            "output_filename": output_filename,
            "processed_info": processed_info
        })

    except Exception as e:
        logger.error(f"Processing error: {str(e)}")
        return jsonify({"error": f"Processing failed: {str(e)}"}), 500

# ────────────────────────────────────────────────────────────────────────────────
# Download
# ────────────────────────────────────────────────────────────────────────────────

@bp.route("/download/<filename>")
def download_file(filename):
    try:
        filepath = os.path.join(current_app.config["PROCESSED_FOLDER"], filename)
        if not os.path.exists(filepath):
            return jsonify({"error": "File not found"}), 404

        ext = filename.rsplit(".", 1)[-1].lower()
        mimetype = MIME_TYPES.get(ext, "application/octet-stream")

        return send_file(
            filepath,
            as_attachment=True,
            download_name=filename,
            mimetype=mimetype,
        )
    except Exception as e:
        logger.error(f"Download error: {str(e)}")
        return jsonify({"error": "Download failed"}), 500

# ────────────────────────────────────────────────────────────────────────────────
# Cleanup
# ────────────────────────────────────────────────────────────────────────────────

@bp.route("/cleanup", methods=["POST"])
def cleanup_files():
    try:
        data = request.get_json(force=True, silent=False)
        filenames = data.get("filenames", [])

        cleaned_count = 0
        upload_dir = current_app.config["UPLOAD_FOLDER"]
        processed_dir = current_app.config["PROCESSED_FOLDER"]

        for filename in filenames:
            # fichier uploadé
            upload_path = os.path.join(upload_dir, filename)
            if os.path.exists(upload_path):
                os.remove(upload_path)
                cleaned_count += 1

            # preview éventuel
            base_name, _ = os.path.splitext(filename)
            preview_path = os.path.join(upload_dir, f"{base_name}_preview.jpg")
            if os.path.exists(preview_path):
                os.remove(preview_path)
                cleaned_count += 1

            # fichiers traités (toutes les orientations/formats usuels)
            for suffix in ["_cropped_2x3", "_cropped_3x2"]:
                for ext in [".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"]:
                    processed_filename = f"{base_name}{suffix}{ext}"
                    processed_path = os.path.join(processed_dir, processed_filename)
                    if os.path.exists(processed_path):
                        os.remove(processed_path)
                        cleaned_count += 1

        return jsonify({"success": True, "cleaned_files": cleaned_count})

    except Exception as e:
        logger.error(f"Cleanup error: {str(e)}")
        return jsonify({"error": "Cleanup failed"}), 500
