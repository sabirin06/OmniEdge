"""
Utility helpers shared across apps.
"""
import hashlib
import secrets


def sha256_file(file_obj) -> str:
    """Return SHA-256 hex digest of a file-like object."""
    h = hashlib.sha256()
    for chunk in iter(lambda: file_obj.read(8192), b""):
        h.update(chunk)
    file_obj.seek(0)
    return h.hexdigest()


def generate_secret_key(length: int = 40) -> str:
    """Generate a URL-safe random secret key."""
    return secrets.token_urlsafe(length)


def hash_secret(secret: str) -> str:
    """One-way hash of a secret for safe storage."""
    return hashlib.sha256(secret.encode()).hexdigest()
