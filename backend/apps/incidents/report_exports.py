"""Download formats for the tenant analytics report."""
import csv
from io import BytesIO
from xml.sax.saxutils import escape

from django.http import FileResponse, HttpResponse, StreamingHttpResponse
from django.utils import timezone


def report_csv(data):
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = 'attachment; filename="omniedge-report.csv"'
    writer = csv.writer(response)
    tenant = data["tenant"]["name"]
    if tenant.lstrip().startswith(("=", "+", "-", "@")) or tenant.startswith(("\t", "\r", "\n")):
        tenant = "'" + tenant
    writer.writerow(["Tenant", tenant])
    for field, value in data["filters"].items():
        writer.writerow([field, value or "All"])
    writer.writerow([])
    writer.writerow(["Record type", "Total"])
    writer.writerows(data["totals"].items())
    writer.writerow([])
    writer.writerow(["Date", *data["series"]])
    writer.writerows([row["date"], *(row[key] for key in data["series"])] for row in data["daily"])
    writer.writerow([])
    writer.writerow(["Record type", "Dimension", "Value", "Count"])
    writer.writerows([row["type"], row["dimension"], row["value"], row["count"]] for row in data["breakdown"])
    return response


RECORD_HEADERS = ("Type", "ID", "Date and time", "Record", "Severity", "Status", "Context")


def record_values(row):
    return (
        row["record_type"].title(), row["record_id"], timezone.localtime(row["record_date"]).isoformat(timespec="seconds"),
        row["record_title"], row["record_severity"], row["record_status"], row["record_context"],
    )


def csv_safe(value):
    if isinstance(value, str) and (value.lstrip().startswith(("=", "+", "-", "@")) or value.startswith(("\t", "\r", "\n"))):
        return "'" + value
    return value


def record_csv(records):
    class Echo:
        def write(self, value):
            return value

    writer = csv.writer(Echo())

    def content():
        yield writer.writerow(RECORD_HEADERS)
        for row in records:
            yield writer.writerow(csv_safe(value) for value in record_values(row))

    return StreamingHttpResponse(
        content(), content_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="omniedge-records.csv"'},
    )


def report_pdf(data, records=None):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    output = BytesIO()
    page_size = A4 if records is None else landscape(A4)
    doc = SimpleDocTemplate(output, pagesize=page_size, title="OmniEdge Security Report")
    styles = getSampleStyleSheet()
    navy = colors.HexColor("#0b2248")
    styles["Title"].textColor = navy
    styles["Heading2"].textColor = navy
    filters = data["filters"]

    def table(rows, widths=None):
        result = Table(rows, colWidths=widths or [doc.width / len(rows[0])] * len(rows[0]), repeatRows=1, splitInRow=1)
        result.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), navy),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#eef4fc")]),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
        ]))
        return result

    story = [
        Paragraph("OmniEdge Security Report", styles["Title"]),
        Paragraph(escape(data["tenant"]["name"]), styles["Heading2"]),
        Paragraph(f'{filters["period_start"]} to {filters["period_end"]}', styles["Normal"]),
        Paragraph(escape(
            f'Type: {filters.get("report_type", "overview")} | Severity: {filters.get("severity") or "all"} | Status: {filters.get("status") or "all"}'
        ), styles["Normal"]),
        Spacer(1, 14),
    ]
    if records is None:
        story.extend([
            Paragraph("Totals", styles["Heading2"]),
            table([["Record type", "Count"], *[[key.title(), count] for key, count in data["totals"].items()]]),
            Paragraph("Breakdown", styles["Heading2"]),
            table([["Record type", "Dimension", "Value", "Count"], *[
                [row["type"].title(), row["dimension"].title(), row["value"].replace("_", " ").title(), row["count"]]
                for row in data["breakdown"]
            ]]) if data["breakdown"] else Paragraph("No matching records.", styles["Normal"]),
            Paragraph("Daily activity", styles["Heading2"]),
            table([["Date", *[key.title() for key in data["series"]]], *[
                [row["date"], *[row[key] for key in data["series"]]] for row in data["daily"]
            ]]),
        ])
    else:
        if filters.get("search"):
            story.append(Paragraph("Search: " + escape(filters["search"]), styles["Normal"]))
        story.append(Paragraph(f"Detailed records ({len(records)})", styles["Heading2"]))
        if records:
            cells = [[Paragraph(escape(str(value)).replace("\n", "<br/>"), styles["Normal"])
                      for value in record_values(row)] for row in records]
            widths = [doc.width * ratio for ratio in (.09, .06, .16, .36, .09, .10, .14)]
            story.append(table([RECORD_HEADERS, *cells], widths))
        else:
            story.append(Paragraph("No matching records.", styles["Normal"]))

    def footer(canvas, document):
        canvas.setFont("Helvetica", 9)
        canvas.setFillColor(navy)
        canvas.drawString(document.leftMargin, 34, "OmniEdge | Tenant security analytics")
        canvas.drawRightString(page_size[0] - document.rightMargin, 34, str(document.page))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    output.seek(0)
    return FileResponse(output, as_attachment=True, filename="omniedge-report.pdf" if records is None else "omniedge-records.pdf", content_type="application/pdf")
