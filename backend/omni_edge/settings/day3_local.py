"""Local release demo using a dedicated PostgreSQL database and evidence directory."""
from .development import *  # noqa: F401, F403

DATABASES = {"default": {**DATABASES["default"], "NAME": "omniedge_day3_demo"}}
MEDIA_ROOT = BASE_DIR / "media" / "day3-demo"
EVIDENCE_ROOT = MEDIA_ROOT / "private_evidence"
