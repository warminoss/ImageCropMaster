import os
import logging
from PIL import Image, ImageCms, ImageOps
from PIL.ExifTags import TAGS
from pillow_heif import register_heif_opener

register_heif_opener()
logger = logging.getLogger(__name__)

class ImageProcessor:
    def __init__(self):
        self.supported_formats = {
            'TIFF': {'extensions': ['.tiff', '.tif'], 'preserve_profile': True},
            'PNG': {'extensions': ['.png'], 'preserve_profile': True},
            'JPEG': {'extensions': ['.jpg', '.jpeg'], 'preserve_profile': True},
            'HEIC': {'extensions': ['.heic', '.heif'], 'preserve_profile': True},
            'WEBP': {'extensions': ['.webp'], 'preserve_profile': True}
        }

    def _get_exif_orientation(self, img):
        """Récupère l'orientation EXIF de l'image"""
        try:
            exif = img.getexif()
            for tag_id, value in exif.items():
                tag = TAGS.get(tag_id, tag_id)
                if tag == 'Orientation':
                    return value
        except:
            pass
        return 1

    def _apply_exif_orientation(self, img):
        """Applique la rotation selon l'orientation EXIF"""
        orientation = self._get_exif_orientation(img)
        
        # Mapping des orientations EXIF
        orientation_methods = {
            2: [Image.FLIP_LEFT_RIGHT],
            3: [Image.ROTATE_180],
            4: [Image.FLIP_TOP_BOTTOM],
            5: [Image.FLIP_LEFT_RIGHT, Image.ROTATE_90],
            6: [Image.ROTATE_270],
            7: [Image.FLIP_LEFT_RIGHT, Image.ROTATE_270],
            8: [Image.ROTATE_90],
        }
        
        if orientation in orientation_methods:
            for method in orientation_methods[orientation]:
                img = img.transpose(method)
            logger.info(f"Applied EXIF orientation correction: {orientation}")
        
        return img

    def crop_image(self, path_in, path_out, focus_x=0.5, focus_y=0.5, zoom=1.0, orientation='portrait'):
        try:
            with Image.open(path_in) as img:
                # Sauvegarde des métadonnées originales
                original_format = img.format
                original_mode = img.mode
                icc_profile = img.info.get('icc_profile')
                exif_data = img.info.get('exif')
                
                # Applique la rotation EXIF avant le traitement
                img = self._apply_exif_orientation(img)
                
                # Pour TIFF 16-bit, préserver le mode
                is_16bit = original_mode in ['I;16', 'I;16L', 'I;16B']
                
                logger.info(f"Processing {original_format} image: {img.size}, mode: {original_mode}, 16-bit: {is_16bit}")
                logger.info(f"Crop settings: orientation={orientation}, zoom={zoom}, focus=({focus_x}, {focus_y})")

                w, h = img.size
                target_ratio = 2 / 3 if orientation == 'portrait' else 3 / 2

                # Correction du zoom
                zoom_factor = 1.0 / max(zoom, 1e-6)

                if (w / h) >= target_ratio:
                    crop_h = int(h / zoom_factor)
                    crop_w = int(crop_h * target_ratio)
                else:
                    crop_w = int(w / zoom_factor)
                    crop_h = int(crop_w / target_ratio)

                # Calcul du centre et des bordures
                center_x = int(w * focus_x)
                center_y = int(h * focus_y)

                left = max(0, center_x - crop_w // 2)
                top = max(0, center_y - crop_h // 2)
                right = min(w, left + crop_w)
                bottom = min(h, top + crop_h)

                # Ajustement des bordures si nécessaire
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

                # Préparation des paramètres de sauvegarde
                save_kwargs = {}
                output_format = original_format
                
                # Gestion spécifique par format
                if original_format == 'TIFF':
                    if is_16bit:
                        # Préserver le TIFF 16-bit
                        save_kwargs.update({
                            'format': 'TIFF',
                            'compression': 'tiff_lzw',
                            'save_all': True
                        })
                        # S'assurer que le nom de sortie est en .tif
                        if not path_out.lower().endswith(('.tif', '.tiff')):
                            path_out = path_out.rsplit('.', 1)[0] + '.tif'
                    else:
                        # TIFF 8-bit -> JPEG haute qualité
                        output_format = 'JPEG'
                        save_kwargs.update({
                            'format': 'JPEG',
                            'quality': 98,
                            'optimize': True,
                            'progressive': True,
                            'subsampling': 0  # 4:4:4 pour la meilleure qualité
                        })
                        if not path_out.lower().endswith(('.jpg', '.jpeg')):
                            path_out = path_out.rsplit('.', 1)[0] + '.jpg'
                
                elif original_format == 'PNG':
                    # PNG -> PNG avec compression minimale
                    save_kwargs.update({
                        'format': 'PNG',
                        'optimize': False,
                        'compress_level': 1
                    })
                
                elif original_format in ['JPEG', 'JPG']:
                    save_kwargs.update({
                        'format': 'JPEG',
                        'quality': 98,
                        'optimize': True,
                        'progressive': True,
                        'subsampling': 0
                    })
                
                elif original_format in ['HEIC', 'HEIF']:
                    # HEIC -> JPEG haute qualité
                    output_format = 'JPEG'
                    save_kwargs.update({
                        'format': 'JPEG',
                        'quality': 98,
                        'optimize': True,
                        'progressive': True,
                        'subsampling': 0
                    })
                    if path_out.lower().endswith(('.heic', '.heif')):
                        path_out = path_out.rsplit('.', 1)[0] + '.jpg'
                
                elif original_format == 'WEBP':
                    save_kwargs.update({
                        'format': 'WEBP',
                        'quality': 98,
                        'method': 6,  # Meilleure compression
                        'lossless': False
                    })

                # Préservation des profils couleur et EXIF
                if icc_profile:
                    save_kwargs['icc_profile'] = icc_profile
                
                # Pour JPEG, on supprime l'orientation EXIF car on l'a déjà appliquée
                if output_format in ['JPEG', 'JPG'] and exif_data:
                    try:
                        # Créer une copie modifiable des données EXIF
                        from PIL.Image import Exif
                        exif = Exif()
                        exif.load(exif_data)
                        # Réinitialiser l'orientation à 1 (normale)
                        if 0x0112 in exif:  # 0x0112 est le tag Orientation
                            exif[0x0112] = 1
                        save_kwargs['exif'] = exif.tobytes()
                    except:
                        # Si on ne peut pas modifier, on omet l'EXIF
                        logger.warning("Could not modify EXIF orientation tag")

                # Sauvegarde avec les paramètres optimaux
                cropped_img.save(path_out, **save_kwargs)
                
                # Vérification de la taille du fichier
                output_size = os.path.getsize(path_out)
                logger.info(f"Successfully cropped image: {cropped_img.size}, output size: {output_size/1024/1024:.2f} MB")
                
                return True

        except Exception as e:
            logger.error(f"Error cropping image: {str(e)}", exc_info=True)
            return False

def get_image_info(image_path):
    try:
        with Image.open(image_path) as img:
            # Appliquer l'orientation EXIF pour obtenir les bonnes dimensions
            processor = ImageProcessor()
            orientation = processor._get_exif_orientation(img)
            if orientation != 1:
                img = processor._apply_exif_orientation(img)
            
            info = {
                'filename': os.path.basename(image_path),
                'format': img.format,
                'mode': img.mode,
                'size': img.size,
                'width': img.width,
                'height': img.height,
                'aspect_ratio': round(img.width / img.height, 3),
                'file_size': os.path.getsize(image_path),
                'exif_orientation': orientation
            }

            # Détection du type de couleur et profondeur
            if img.mode in ['I;16', 'I;16L', 'I;16B']:
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

            # Profil couleur
            if 'icc_profile' in img.info:
                try:
                    profile = ImageCms.ImageCmsProfile(img.info['icc_profile'])
                    info['color_profile'] = profile.profile.profile_description
                except:
                    info['color_profile'] = 'Present (unable to read)'
            else:
                info['color_profile'] = 'None'

            # Taille lisible
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
            img.verify()
        return True
    except Exception as e:
        logger.error(f"Invalid image format: {str(e)}")
        return False