import os
import uuid
import logging
from flask import render_template, request, jsonify, send_file
from werkzeug.utils import secure_filename
from app import app
from utils.image_processor import ImageProcessor, get_image_info
from PIL import Image
from pillow_heif import register_heif_opener

logger = logging.getLogger(__name__)
register_heif_opener()  # Enable HEIC/HEIF support in Pillow

ALLOWED_EXTENSIONS = {'tiff', 'tif', 'png', 'jpg', 'jpeg', 'heic', 'heif'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def is_valid_image_format(filepath):
    try:
        with Image.open(filepath) as img:
            img.verify()
        return True
    except Exception:
        return False

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        logger.info("Upload request received")
        logger.info(f"Request files: {list(request.files.keys())}")

        if 'file' not in request.files:
            logger.error("No file in request")
            return jsonify({'error': 'No file selected'}), 400

        file = request.files['file']
        logger.info(f"File received: {file.filename}, size: {file.content_length}")

        if not file.filename or file.filename == '':
            logger.error("Empty filename")
            return jsonify({'error': 'No file selected'}), 400

        if not allowed_file(file.filename):
            logger.error(f"Invalid file format: {file.filename}")
            return jsonify({'error': 'Invalid file format. Please upload TIFF, PNG, or JPEG files.'}), 400

        filename = str(uuid.uuid4()) + '_' + secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        file_size = os.path.getsize(filepath)
        logger.info(f"File saved successfully, size: {file_size} bytes")

        ext = filename.rsplit(".", 1)[-1].lower()

        if ext in ["heic", "heif"]:
            logger.info("Detected HEIC/HEIF format, converting to JPG with pillow-heif...")
            image = Image.open(filepath)
            new_filename = filename.rsplit(".", 1)[0] + ".jpg"
            new_filepath = os.path.join(app.config['UPLOAD_FOLDER'], new_filename)
            image.save(new_filepath, format="JPEG")
            logger.info(f"HEIC converted and saved as {new_filename}")

            os.remove(filepath)
            filename = new_filename
            filepath = new_filepath

        if not is_valid_image_format(filepath):
            logger.error("Invalid image format after validation")
            os.remove(filepath)
            return jsonify({'error': 'Invalid or corrupted image file'}), 400

        logger.info("Getting image information...")
        image_info = get_image_info(filepath)
        logger.info(f"Image info retrieved: {image_info}")

        return jsonify({
            'success': True,
            'filename': filename,
            'image_info': image_info
        })

    except Exception as e:
        logger.error(f"Upload error: {str(e)}", exc_info=True)
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

@app.route('/preview/<filename>')
def preview_image(filename):
    try:
        ext = filename.rsplit(".", 1)[-1].lower()
        if ext in ["heic", "heif"]:
            filename = filename.rsplit(".", 1)[0] + ".jpg"

        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404

        return send_file(filepath, mimetype='image/jpeg')
    except Exception as e:
        logger.error(f"Preview error: {str(e)}")
        return jsonify({'error': 'Preview failed'}), 500

@app.route('/process', methods=['POST'])
def process_image():
    try:
        data = request.get_json()
        filename = data.get('filename')
        focus_x = float(data.get('focus_x', 0.5))
        focus_y = float(data.get('focus_y', 0.5))
        zoom = float(data.get('zoom', 1.0))
        orientation = data.get('orientation', 'portrait')

        if not filename:
            return jsonify({'error': 'No filename provided'}), 400

        input_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if not os.path.exists(input_path):
            return jsonify({'error': 'Input file not found'}), 404

        base_name = os.path.splitext(filename)[0]
        extension = os.path.splitext(filename)[1]
        crop_suffix = "2x3" if orientation == 'portrait' else "3x2"
        output_filename = f"{base_name}_cropped_{crop_suffix}{extension}"
        output_path = os.path.join(app.config['PROCESSED_FOLDER'], output_filename)

        logger.info(f"Starting image processing: {input_path} -> {output_path}")
        processor = ImageProcessor()

        try:
            success = processor.crop_image(
                input_path, output_path,
                focus_x=focus_x, focus_y=focus_y,
                zoom=zoom, orientation=orientation
            )

            if not success:
                logger.error("Image processing returned failure")
                return jsonify({'error': 'Image processing failed'}), 500

            if not os.path.exists(output_path):
                logger.error("Output file was not created")
                return jsonify({'error': 'Processing failed - output file not created'}), 500

            logger.info("Getting processed image info...")
            processed_info = get_image_info(output_path)

        except Exception as proc_error:
            logger.error(f"Processing exception: {str(proc_error)}")
            return jsonify({'error': f'Processing failed: {str(proc_error)}'}), 500

        return jsonify({
            'success': True,
            'output_filename': output_filename,
            'processed_info': processed_info
        })

    except Exception as e:
        logger.error(f"Processing error: {str(e)}")
        return jsonify({'error': f'Processing failed: {str(e)}'}), 500

@app.route('/download/<filename>')
def download_file(filename):
    try:
        filepath = os.path.join(app.config['PROCESSED_FOLDER'], filename)
        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404

        return send_file(filepath, as_attachment=True, download_name=filename)
    except Exception as e:
        logger.error(f"Download error: {str(e)}")
        return jsonify({'error': 'Download failed'}), 500

@app.route('/cleanup', methods=['POST'])
def cleanup_files():
    try:
        data = request.get_json()
        filenames = data.get('filenames', [])

        cleaned_count = 0
        for filename in filenames:
            upload_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            if os.path.exists(upload_path):
                os.remove(upload_path)
                cleaned_count += 1

            base_name = os.path.splitext(filename)[0]
            extension = os.path.splitext(filename)[1]
            processed_filename = f"{base_name}_cropped_2x3{extension}"
            processed_path = os.path.join(app.config['PROCESSED_FOLDER'], processed_filename)
            if os.path.exists(processed_path):
                os.remove(processed_path)
                cleaned_count += 1

        return jsonify({
            'success': True,
            'cleaned_files': cleaned_count
        })

    except Exception as e:
        logger.error(f"Cleanup error: {str(e)}")
        return jsonify({'error': 'Cleanup failed'}), 500
