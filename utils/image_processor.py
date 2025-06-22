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

    def _get_color_profile_info(self, icc_profile):
        """Analyse le profil ICC pour obtenir des informations détaillées"""
        try:
            if icc_profile:
                profile = ImageCms.ImageCmsProfile(icc_profile)
                return {
                    'description': profile.profile.profile_description,
                    'manufacturer': profile.profile.manufacturer,
                    'model': profile.profile.model,
                    'copyright': profile.profile.copyright,
                    'color_space': profile.profile.xcolor_space
                }
        except:
            return None
        return None

    def _convert_color_profile_if_needed(self, img, icc_profile, output_format):
        """Convertit le profil couleur si nécessaire pour le format de sortie"""
        try:
            if not icc_profile:
                return img, None
            
            profile_info = self._get_color_profile_info(icc_profile)
            if profile_info:
                logger.info(f"Original color profile: {profile_info['description']}")
            
            # Pour JPEG, convertir en sRGB si ce n'est pas déjà le cas
            if output_format in ['JPEG', 'JPG'] and profile_info:
                # Vérifier si le profil n'est pas déjà sRGB
                if 'sRGB' not in profile_info['description'] and 'sRGB' not in str(profile_info.get('model', '')):
                    logger.info("Converting to sRGB for JPEG output")
                    # Créer un profil sRGB
                    srgb_profile = ImageCms.createProfile('sRGB')
                    
                    # Convertir l'image
                    img_converted = ImageCms.profileToProfile(
                        img, 
                        ImageCms.ImageCmsProfile(icc_profile), 
                        srgb_profile,
                        renderingIntent=ImageCms.Intent.PERCEPTUAL,
                        outputMode=img.mode
                    )
                    
                    # Obtenir le profil sRGB en bytes
                    import io
                    srgb_bytes = io.BytesIO()
                    srgb_profile.save(srgb_bytes)
                    return img_converted, srgb_bytes.getvalue()
            
            # Pour les autres formats, préserver le profil original
            return img, icc_profile
            
        except Exception as e:
            logger.warning(f"Color profile conversion failed: {e}")
            return img, icc_profile

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
                
                # Informations sur le profil couleur
                profile_info = self._get_color_profile_info(icc_profile)
                if profile_info:
                    logger.info(f"Color profile detected: {profile_info['description']}")
                
                logger.info(f"Processing {original_format} image: {img.size}, mode: {original_mode}, 16-bit: {is_16bit}")
                logger.info(f"Crop settings: orientation={orientation}, zoom={zoom}, focus=({focus_x}, {focus_y})")

                w, h = img.size
                target_ratio = 2 / 3 if orientation == 'portrait' else 3 / 2

                # Correction du zoom (zoom = 1 => pas de zoom, zoom = 5 => zoom 5x)
                zoom_factor = 1.0 / max(zoom, 1e-6)

                # Calculer les dimensions de crop en gardant le ratio exact
                if orientation == 'portrait':
                    # Portrait: largeur = 2, hauteur = 3
                    if (w / h) >= target_ratio:
                        # Image plus large que le ratio cible
                        crop_h = int(h * zoom_factor)
                        crop_w = int(crop_h * target_ratio)
                    else:
                        # Image plus haute que le ratio cible
                        crop_w = int(w * zoom_factor)
                        crop_h = int(crop_w / target_ratio)
                else:
                    # Landscape: largeur = 3, hauteur = 2
                    if (w / h) >= target_ratio:
                        # Image plus large que le ratio cible
                        crop_h = int(h * zoom_factor)
                        crop_w = int(crop_h * target_ratio)
                    else:
                        # Image plus haute que le ratio cible
                        crop_w = int(w * zoom_factor)
                        crop_h = int(crop_w / target_ratio)
                
                # S'assurer que les dimensions sont exactement 2:3 ou 3:2
                if orientation == 'portrait':
                    # Forcer le ratio 2:3
                    if crop_w * 3 != crop_h * 2:
                        crop_h = int(crop_w * 3 / 2)
                else:
                    # Forcer le ratio 3:2
                    if crop_w * 2 != crop_h * 3:
                        crop_w = int(crop_h * 3 / 2)

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
                
                # Vérification finale du ratio
                final_w, final_h = cropped_img.size
                final_ratio = final_w / final_h
                expected_ratio = 2/3 if orientation == 'portrait' else 3/2
                
                logger.info(f"Crop box: {crop_box}")
                logger.info(f"Final dimensions: {final_w}x{final_h}, ratio: {final_ratio:.3f}, expected: {expected_ratio:.3f}")
                
                # Si le ratio n'est pas exact, ajuster
                if abs(final_ratio - expected_ratio) > 0.01:
                    logger.warning(f"Ratio mismatch detected, adjusting...")
                    if orientation == 'portrait':
                        # Ajuster pour avoir exactement 2:3
                        new_h = final_w * 3 // 2
                        if new_h > final_h:
                            new_w = final_h * 2 // 3
                            cropped_img = cropped_img.crop((0, 0, new_w, final_h))
                        else:
                            cropped_img = cropped_img.crop((0, 0, final_w, new_h))
                    else:
                        # Ajuster pour avoir exactement 3:2
                        new_w = final_h * 3 // 2
                        if new_w > final_w:
                            new_h = final_w * 2 // 3
                            cropped_img = cropped_img.crop((0, 0, final_w, new_h))
                        else:
                            cropped_img = cropped_img.crop((0, 0, new_w, final_h))
                    
                    final_w, final_h = cropped_img.size
                    logger.info(f"Adjusted to: {final_w}x{final_h}, ratio: {final_w/final_h:.3f}")

                # Gestion du profil couleur selon le format de sortie
                output_format = original_format
                final_img = cropped_img
                final_icc_profile = icc_profile
                
                # Conversion du profil couleur si nécessaire
                if original_format in ['HEIC', 'HEIF'] or (original_format == 'TIFF' and not is_16bit):
                    output_format = 'JPEG'
                    final_img, final_icc_profile = self._convert_color_profile_if_needed(
                        cropped_img, icc_profile, 'JPEG'
                    )
                
                # Préparation des paramètres de sauvegarde
                save_kwargs = {}
                
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

                # Préservation des profils couleur
                if final_icc_profile:
                    save_kwargs['icc_profile'] = final_icc_profile
                    logger.info("Color profile will be preserved in output")
                
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
                final_img.save(path_out, **save_kwargs)
                
                # Vérification de la taille du fichier et du profil couleur
                output_size = os.path.getsize(path_out)
                
                # Vérification du profil couleur dans le fichier de sortie
                with Image.open(path_out) as check_img:
                    output_profile = check_img.info.get('icc_profile')
                    if output_profile:
                        profile_info = self._get_color_profile_info(output_profile)
                        if profile_info:
                            logger.info(f"Output color profile: {profile_info['description']}")
                
                logger.info(f"Successfully cropped image: {final_img.size}, output size: {output_size/1024/1024:.2f} MB")
                
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
                    profile_desc = profile.profile.profile_description
                    info['color_profile'] = profile_desc
                    # Ajouter des détails supplémentaires sur le profil
                    info['color_space'] = profile.profile.xcolor_space
                    if 'sRGB' in profile_desc:
                        info['color_profile_type'] = 'sRGB'
                    elif 'Adobe RGB' in profile_desc or 'Adobe RGB' in str(profile.profile.model):
                        info['color_profile_type'] = 'Adobe RGB'
                    elif 'ProPhoto' in profile_desc:
                        info['color_profile_type'] = 'ProPhoto RGB'
                    elif 'Display P3' in profile_desc or 'P3' in profile_desc:
                        info['color_profile_type'] = 'Display P3'
                    else:
                        info['color_profile_type'] = 'Custom'
                except:
                    info['color_profile'] = 'Present (unable to read)'
                    info['color_profile_type'] = 'Unknown'
            else:
                info['color_profile'] = 'None'
                info['color_profile_type'] = 'None'

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