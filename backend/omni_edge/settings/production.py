"""
Production settings for OmniEdge.
"""
import os
from .base import *  # noqa: F401, F403

DEBUG = False

SECRET_KEY = os.environ["SECRET_KEY"]

def env_list(name):
    return [entry.strip() for entry in os.environ.get(name, "").split(",") if entry.strip()]


ALLOWED_HOSTS = env_list("ALLOWED_HOSTS")
EVIDENCE_ROOT = os.environ.get("EVIDENCE_ROOT", EVIDENCE_ROOT)

def parse_db_url(url):
    from urllib.parse import unquote, urlparse
    parsed = urlparse(url)
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname,
        "PORT": str(parsed.port or 5432),
        "CONN_MAX_AGE": 60,
        "OPTIONS": {"connect_timeout": 10, "sslmode": os.environ.get("DATABASE_SSLMODE", "require")},
    }

DATABASES = {"default": parse_db_url(os.environ["DATABASE_URL"])}

# Security
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")

# Email
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", 587))
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")

DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "")

ACCOUNT_TRUST_PROXY_IP = os.environ.get("ACCOUNT_TRUST_PROXY_IP", "false").lower() == "true"
