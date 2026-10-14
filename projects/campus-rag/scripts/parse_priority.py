"""Snapshot-only ordering; never mutate the crawler's frontier priority."""
from pathlib import PurePosixPath
from urllib.parse import urlsplit

POLICY = 'images_then_pdf_word_v1'


def resource_group(row):
    # A .png URL returning an HTML error must not become an OCR request.
    if 'html' in (row['mime'] or '').lower():
        return 'other'
    suffix = PurePosixPath(urlsplit(row['final_url'] or row['url']).path).suffix.lower()
    if suffix in {'.png', '.jpg', '.jpeg', '.webp'}:
        return 'image'
    if suffix == '.pdf':
        return 'pdf'
    if suffix in {'.docx', '.doc'}:
        return 'word'
    return 'other'


def prioritize(rows):
    # Stable sorting preserves existing depth/priority ordering inside a type.
    # Body association and permission checks remain in import_archive.
    rank = {'image': 0, 'pdf': 1, 'word': 2, 'other': 3}
    return sorted(rows, key=lambda row: rank[resource_group(row)])
