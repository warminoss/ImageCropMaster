import os
import logging
from PIL import Image, ImageCms
from PIL.ExifTags import TAGS
from pillow_heif import register_heif_opener

# Register HEIF opener to handle HEIC/HEIF files
register_heif_opener()

logger = logging.getLogger(__name__)

def select_best_frame(img):
    if getattr(img, "n_frames", 1) > 1:
        best_frame = 0
        max_area = 0
        for i in range(img.n_frames):
            img.seek(i)
            w, h = img.size
            if w * h > max_area:
                best_frame = i
                max_area = w * h
        img.seek(best_frame)
    else:
        img.seek(0)

class ImageProcessor:
    """
    Professional image processor for high-quality cropping with JPEG output
    """

    def __init__(self):
        self.supported_formats = {
            'TIFF': {'extensions': ['.tiff', '.tif']},
            'PNG': {'extensions': ['.png']},
            'JPEG': {'extensions': ['.jpg', '.jpeg']},
            'HEIC': {'extensions': ['.heic', '.heif']},
            'MPO': {'extensions': ['.mpo']}
        }

    def crop_image(self, path_in, path_out, focus_x=0.5, focus_y=0.5, zoom=1.0, orientation='portrait'):
        try:
            with Image.open(path_in) as img:
                img_format_before = img.format

                # Skip selecting best frame for JPEG (to avoid false MPO detection)
                if img_format_before != 'JPEG':
                    select_best_frame(img)

                original_mode = img.mode
                icc_profile = img.info.get('icc_profile')
                exif_data = img.info.get('exif')

                logger.info(f"Processing {img_format_before} image: {img.size}, mode: {original_mode}")
                logger.info(f"Crop settings: orientation={orientation}, zoom={zoom}, focus=({focus_x}, {focus_y})")

                w, h = img.size
                target_ratio = 2 / 3 if orientation == 'portrait' else 3 / 2

                # Zoom correction (zoom=2 means crop is 2x smaller)
                zoom_factor = 1.0 / max(zoom, 1e-6)
                if (w / h) >= target_ratio:
                    crop_h = int(h / zoom_factor)
                    crop_w = int(crop_h * target_ratio)
                else:
                    crop_w = int(w / zoom_factor)
                    crop_h = int(crop_w / target_ratio)

                crop_w = min(crop_w, w)
                crop_h = min(crop_h, h)

                center_x = int(w * focus_x)
                center_y = int(h * focus_y)

                left = max(0, center_x - crop_w // 2)
                top = max(0, center_y - crop_h // 2)
                right = min(w, left + crop_w)
                bottom = min(h, top + crop_h)

                if right > w:
                    left = w - crop_w
                    right = w
                if bottom > h:
                    top = h - crop_h
                    bottom = h
                if left < 0:
                    right = crop_w
                    left = 0
                if top < 0:
                    bottom = crop_h
                    top = 0

                crop_box = (left, top, right, bottom)
                cropped_img = img.crop(crop_box)

                # Always force JPEG output
                path_out = path_out.rsplit('.', 1)[0] + '.jpg'
                save_kwargs = {
                    'format': 'JPEG',
                    'quality': 95,
                    'optimize': False,
                    'progressive': True
                }

                if icc_profile:
                    save_kwargs['icc_profile'] = icc_profile
                if exif_data:
                    save_kwargs['exif'] = exif_data

                cropped_img = cropped_img.convert("RGB")
                cropped_img.save(path_out, **save_kwargs)
                logger.info(f"Successfully cropped image: {cropped_img.size}")
                return True

        except Exception as e:
            logger.error(f"Error cropping image: {str(e)}")
            return False

def get_image_info(image_path):
    try:
        with Image.open(image_path) as img:
            format_before = img.format
            if format_before != 'JPEG':
                select_best_frame(img)

            info = {
                'filename': os.path.basename(image_path),
                'format': format_before,
                'mode': img.mode,
                'size': img.size,
                'width': img.width,
                'height': img.height,
                'aspect_ratio': round(img.width / img.height, 3),
                'file_size': os.path.getsize(image_path)
            }

            if img.mode == 'I;16':
                info['bit_depth'] = 16
                info['color_type'] = 'Grayscale 16-bit'
            elif img.mode == 'RGB':
                info['bit_depth'] = 8
                info['color_type'] = 'RGB 8-bit'
            elif img.mode == 'RGBA':
                info['bit_depth'] = 8
                info['color_type'] = 'RGBA 8-bit'
            elif img.mode == 'L':
                info['bit_depth'] = 8
                info['color_type'] = 'Grayscale 8-bit'
            else:
                info['bit_depth'] = 'Unknown'
                info['color_type'] = img.mode

            if 'icc_profile' in img.info:
                try:
                    profile = ImageCms.ImageCmsProfile(img.info['icc_profile'])
                    info['color_profile'] = profile.profile.profile_description
                except:
                    info['color_profile'] = 'Present (unable to read)'
            else:
                info['color_profile'] = 'None'

            size_bytes = info['file_size']
            if size_bytes < 1024:
                info['file_size_human'] = f"{size_bytes} B"
            elif size_bytes < 1024**2:
                info['file_size_human'] = f"{size_bytes/1024:.1f} KB"
            elif size_bytes < 1024**3:
                info['file_size_human'] = f"{size_bytes/(1024**2):.1f} MB"
            else:
                info['file_size_human'] = f"{size_bytes/(1024**3):.1f} GB"

            return info

    except Exception as e:
        logger.error(f"Error getting image info: {str(e)}")
        return {'error': f"Unable to read image information: {str(e)}"}

def is_valid_image_format(image_path):
    try:
        with Image.open(image_path) as img:
            if img.format not in ['TIFF', 'PNG', 'JPEG', 'HEIF', 'MPO']:
                return False
            img.verify()
            return True
    except Exception as e:
        logger.error(f"Invalid image format: {str(e)}")
        return False
