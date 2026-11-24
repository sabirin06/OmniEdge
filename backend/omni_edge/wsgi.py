"""
WSGI config for OmniEdge project.
"""
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "omni_edge.settings.development")

application = get_wsgi_application()
