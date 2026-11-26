"""
Production settings for OmniEdge.
"""
import os
from .base import *  # noqa: F401, F403


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name):
    return [entry.strip() for entry in os.environ.get(name, "").split(",") if entry.strip()]


DEBUG = env_bool("DEBUG", False)

SECRET_KEY = os.environ.get("SECRET_KEY") or os.environ["DJANGO_SECRET_KEY"]

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS")
EVIDENCE_ROOT = os.environ.get("EVIDENCE_ROOT", EVIDENCE_ROOT)
EVIDENCE_STORAGE = os.environ.get("EVIDENCE_STORAGE", EVIDENCE_STORAGE).strip().lower()
STATIC_ROOT = os.environ.get("STATIC_ROOT", STATIC_ROOT)
MEDIA_ROOT = os.environ.get("MEDIA_ROOT", MEDIA_ROOT)

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

# Security. HTTPS_ENABLED stays False until a TLS certificate is in place, so the
# first start over plain HTTP works. The forwarded protocol header is trusted only
# because the API is reachable solely through the Nginx reverse proxy.
HTTPS_ENABLED = env_bool("HTTPS_ENABLED", True)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = HTTPS_ENABLED
SECURE_REDIRECT_EXEMPT = [r"^api/v1/health/$"]
SESSION_COOKIE_SECURE = HTTPS_ENABLED
CSRF_COOKIE_SECURE = HTTPS_ENABLED
SECURE_HSTS_SECONDS = 31536000 if HTTPS_ENABLED else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = HTTPS_ENABLED
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")

# Hosting platforms provide the public hostname: Hugging Face Spaces sets SPACE_HOST
# (e.g. user-omniedge.hf.space) and Render sets RENDER_EXTERNAL_HOSTNAME.
for _platform_host in (os.environ.get("SPACE_HOST", ""), os.environ.get("RENDER_EXTERNAL_HOSTNAME", "")):
    _platform_host = _platform_host.strip()
    if not _platform_host:
        continue
    if _platform_host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(_platform_host)
    if f"https://{_platform_host}" not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(f"https://{_platform_host}")

# Email
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT") or 587)
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")

DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "")

ACCOUNT_TRUST_PROXY_IP = env_bool("ACCOUNT_TRUST_PROXY_IP", False)

# Logs go to stdout/stderr so `docker compose logs` shows them.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {"django": {"handlers": ["console"], "level": "INFO", "propagate": False}},
}
