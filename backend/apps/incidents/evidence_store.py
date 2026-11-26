"""Private evidence storage.

EVIDENCE_STORAGE=filesystem (default) writes files under EVIDENCE_ROOT, as before.
EVIDENCE_STORAGE=database keeps the bytes in PostgreSQL (EvidenceBlob) for hosts
such as Render's free tier, whose container filesystem is wiped on every deploy.
"""
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from django.conf import settings

DB_PREFIX = "db:"


def using_database():
    return getattr(settings, "EVIDENCE_STORAGE", "filesystem") == "database"


def save(chunks):
    """Store the uploaded chunks and return the value for Evidence.stored_path."""
    key = uuid4().hex
    if using_database():
        from .models import EvidenceBlob
        EvidenceBlob.objects.create(key=key, data=b"".join(chunks))
        return DB_PREFIX + key
    root = Path(settings.EVIDENCE_ROOT)
    root.mkdir(parents=True, exist_ok=True)
    stored_path = root / key
    try:
        with stored_path.open("xb") as dest:
            for chunk in chunks:
                dest.write(chunk)
    except Exception:
        stored_path.unlink(missing_ok=True)
        raise
    return str(stored_path)


def save_bytes_with_key(key, data):
    """Idempotently store fixed bytes (used by the demo seed). Returns stored_path."""
    if using_database():
        from .models import EvidenceBlob
        EvidenceBlob.objects.get_or_create(key=key, defaults={"data": data})
        return DB_PREFIX + key
    return None


def remove(stored_path):
    if not stored_path:
        return
    if stored_path.startswith(DB_PREFIX):
        from .models import EvidenceBlob
        EvidenceBlob.objects.filter(key=stored_path[len(DB_PREFIX):]).delete()
    else:
        Path(stored_path).unlink(missing_ok=True)


def open_for_download(stored_path):
    """Return a binary file object for the evidence, or None if it is missing or outside storage."""
    if stored_path.startswith(DB_PREFIX):
        from .models import EvidenceBlob
        blob = EvidenceBlob.objects.filter(key=stored_path[len(DB_PREFIX):]).first()
        return BytesIO(bytes(blob.data)) if blob else None
    path = Path(stored_path).resolve()
    roots = (Path(settings.EVIDENCE_ROOT).resolve(), (Path(settings.MEDIA_ROOT) / "evidence").resolve())
    if not any(path.is_relative_to(root) for root in roots) or not path.is_file():
        return None
    return path.open("rb")
