"""Keep OCR boxes separate and retain bounded raster coordinates for citations."""
import math


def positioned_blocks(result, width, height, prefix=''):
    blocks, warnings = [], []
    rejected = 0
    items = [] if result is None else result
    if len(items) > 1000:
        warnings.append(prefix + 'OCR 框超过 1000 个；已截断，待 OCR 复核')
    for number, item in enumerate(items[:1000], 1):
        try:
            quad, text, score = item
            score = float(score)
            if not isinstance(text, str) or not text.strip() or len(text) > 1000:
                raise ValueError('text')
            if not math.isfinite(score) or not .5 <= score <= 1 or len(quad) != 4:
                raise ValueError('confidence')
            points = []
            for point in quad:
                if len(point) != 2:
                    raise ValueError('point')
                x, y = map(float, point)
                if not all(map(math.isfinite, (x, y))) or not (0 <= x <= width and 0 <= y <= height):
                    raise ValueError('bounds')
                points.append(f'{round(x)},{round(y)}')
            location = f'{prefix}OCR 框 {number} / 置信度 {score:.3f} xy={";".join(points)}'
            if len(location) > 120:
                raise ValueError('location length')
            blocks.append((location, text.strip()))
        except (ValueError, TypeError, OverflowError):
            rejected += 1
    if rejected:
        warnings.append(f'{prefix}{rejected} 个无效或低置信度 OCR 框未入库，待 OCR 复核')
    if not blocks:
        warnings.append(prefix + 'OCR 无可用文字；不代表原图无文字，待 OCR 复核')
    return blocks, warnings
