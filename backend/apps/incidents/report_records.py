"""Searchable report records backed by a single ordered SQL union."""
from django.db.models import CharField, F, Q, Value
from django.db.models.functions import Coalesce

from .reporting import report_queries


RECORD_COLUMNS = (
    "record_type", "record_id", "record_date", "record_title",
    "record_severity", "record_status", "record_context",
)
RECORD_SORTS = tuple(key for column in RECORD_COLUMNS for key in (column, f"-{column}"))


def detailed_records(tenant, filters):
    search = filters.get("search", "")
    queries = []
    for key, records, stamp, severity, has_status in report_queries(
        tenant, filters["period_start"], filters["period_end"],
        filters.get("report_type", "overview"), filters.get("severity", ""), filters.get("status", ""),
    ):
        title, context = {
            "events": ("message", "event_type"),
            "alerts": ("title", "rule__name"),
            "incidents": ("title", "reference"),
        }[key]
        if search:
            matches = Q(**{f"{title}__icontains": search}) | Q(**{f"{context}__icontains": search})
            if search.isascii() and search.isdecimal() and len(search) < 19:
                matches |= Q(pk=int(search))
            records = records.filter(matches)
        queries.append(records.annotate(
            record_type=Value(key, output_field=CharField()),
            record_id=F("pk"),
            record_date=F(stamp),
            record_title=F(title),
            record_severity=F(severity),
            record_status=F("status") if has_status else Value("", output_field=CharField()),
            record_context=Coalesce(F(context), Value(""), output_field=CharField()),
        ).values(*RECORD_COLUMNS))
    first, *rest = queries
    result = first.union(*rest, all=True) if rest else first
    return result.order_by(filters.get("ordering", "-record_date"), "record_type", "record_id")
