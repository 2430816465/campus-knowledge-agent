"""Bounded OCR of body-referenced Word rasters, never external resources.

Coordinates describe the original embedded raster, not Word page geometry.
OCR is candidate text; arrows, layout and relationships are not inferred.
"""
from hashlib import sha256
from io import BytesIO
import math

R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
V = '{urn:schemas-microsoft-com:vml}'
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
MAX_IMAGES, MAX_PIXELS, MAX_TOTAL_PIXELS = 20, 25_000_000, 100_000_000
MAX_BOXES, MAX_TOTAL_BOXES = 1000, 5000


def _transformed(node):
    parent = node.getparent()
    while parent is not None and parent.tag not in (W+'p', W+'body'):
        for child in parent.iter():
            if child.tag == A+'srcRect' and any(value not in ('0', '') for value in child.attrib.values()):
                return True
            if child.tag == A+'xfrm' and any(child.get(key, '0') not in ('0', 'false', 'False', '')
                    for key in ('rot', 'flipH', 'flipV')):
                return True
            if child.tag == V+'shape' and 'rotation' in child.get('style', '').lower():
                return True
        parent = parent.getparent()
    return False


def extract_docx_images(doc, ocr):
    import numpy as np
    from PIL import Image
    blocks, warnings, cache = [], [], {}
    total_pixels = total_boxes = references = 0
    for node in doc.element.body.iter():
        if node.tag not in (A+'blip', V+'imagedata'):
            continue
        references += 1
        if references > MAX_IMAGES:
            warnings.append('Word 图像超过 20 个引用；已截断，待 OCR 复核')
            break
        label = f'Word 图像 {references}'
        try:
            rid = node.get(R+'embed') or node.get(R+'id')
            if not rid or node.get(R+'link'):
                raise ValueError('外部或缺失图像关系')
            relation = doc.part.rels[rid]
            if relation.is_external or not relation.target_part.content_type.startswith('image/'):
                raise ValueError('非本地栅格图像关系')
            if _transformed(node):
                raise ValueError('裁切、翻转或旋转图像需渲染核对')
            blob = relation.target_part.blob
            digest = sha256(blob).hexdigest()
            if digest not in cache:
                raster_blob,render_note=blob,''
                from .wmf_bitmap import MAGIC,render_bitmap_wmf
                if blob.startswith(MAGIC):
                    raster_blob,render_note=render_bitmap_wmf(blob,min(MAX_PIXELS,MAX_TOTAL_PIXELS-total_pixels))
                with Image.open(BytesIO(raster_blob)) as image:
                    width, height = image.size
                    pixels = width * height
                    if (image.format not in ('PNG', 'JPEG', 'WEBP', 'BMP', 'TIFF', 'GIF')
                            or getattr(image, 'n_frames', 1) != 1
                            or min(width, height) < 1 or max(width, height) > 20000
                            or pixels > MAX_PIXELS or total_pixels + pixels > MAX_TOTAL_PIXELS):
                        raise ValueError('不支持的图像或超出像素预算')
                    total_pixels += pixels
                    # Existing RapidOCR raster entry point uses OpenCV BGR.
                    raster = np.asarray(image.convert('RGB'))[:, :, ::-1].copy()
                result = ocr(raster)
                result = [] if result is None else result
                if len(result) > MAX_BOXES or total_boxes + len(result) > MAX_TOTAL_BOXES:
                    raise ValueError('OCR 框超出预算')
                total_boxes += len(result)
                accepted, rejected = [], 0
                for item in result:
                    try:
                        quad, text, score = item
                        score = float(score)
                        if not isinstance(text, str) or not text.strip() or len(text) > 1000:
                            raise ValueError('invalid text')
                        if not math.isfinite(score) or not 0.5 <= score <= 1 or len(quad) != 4:
                            raise ValueError('invalid confidence')
                        points = []
                        for point in quad:
                            if len(point) != 2:
                                raise ValueError('invalid point')
                            x, y = map(float, point)
                            if not all(map(math.isfinite, (x,y))) or not (0 <= x <= width and 0 <= y <= height):
                                raise ValueError('invalid bounds')
                            points.append(f'{round(x)},{round(y)}')
                        # Confidence does not establish reading direction.
                        # A curved/vertical seal can score highly with wrong text.
                        for start,end in ((quad[0],quad[1]),(quad[3],quad[2])):
                            dx,dy=float(end[0])-float(start[0]),float(end[1])-float(start[1])
                            if dx<=1 or abs(dy)>dx*math.tan(math.radians(10)):
                                raise ValueError('unverified text orientation')
                        accepted.append((text.strip(), score, ';'.join(points)))
                    except (ValueError, TypeError, OverflowError):
                        rejected += 1
                cache[digest] = accepted, rejected, render_note
            accepted, rejected, render_note = cache[digest]
            if len(blocks) + len(accepted) > MAX_TOTAL_BOXES:
                raise ValueError('重复图像引用的 OCR 框超出文件预算')
            coordinate_note=render_note or '坐标为原图像素'
            warnings.append(f'{label} 原图 SHA256={digest}；本地 OCR 候选，{coordinate_note}；日期、资格等需原图复核，不推断箭头或布局关系')
            if rejected:
                warnings.append(f'{label} 有 {rejected} 个无效、低置信度或方向未核实框，待 OCR 复核')
            if not accepted:
                warnings.append(f'{label} OCR 未识别到文字；不代表原图没有文字，待 OCR 复核')
            for index, (text, score, points) in enumerate(accepted, 1):
                marker='WMF ' if render_note else ''
                location = f'{label} SHA={digest[:12]} / {marker}OCR {index} conf={score:.3f} xy={points}'
                assert len(location) <= 120
                blocks.append((location, text))
        except Exception as exc:
            # Preserve successfully parsed body text when a raster fails.
            warnings.append(f'{label} 待 OCR 复核：{type(exc).__name__}: {str(exc)[:100]}')
    return blocks, warnings
