"""
Itinerary export — iCalendar (.ics) and plain-text/PDF-ready output.

The .ics generator is pure Python (no dependencies) and produces a valid
VCALENDAR that imports into Google/Apple/Outlook calendars.
"""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from pydantic import BaseModel, Field


class ExportEvent(BaseModel):
    title: str = Field(..., max_length=200)
    day: int = Field(default=1, ge=1, le=60)     # day N of the trip
    start_time: str = Field(default="09:00")     # HH:MM
    duration_min: int = Field(default=120, ge=0, le=1440)
    location: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=1000)


class ExportInput(BaseModel):
    title: str = Field(default="My Trip", max_length=200)
    start_date: str = Field(default_factory=lambda: date.today().isoformat())
    events: list[ExportEvent] = Field(default_factory=list, max_length=200)


def _esc(text: str) -> str:
    # ICS properties are CRLF-delimited, so a raw \r or \n in user text would end
    # the property early and let the rest be read as forged calendar fields.
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\r", "\\n")
        .replace("\n", "\\n")
    )


def build_ics(inp: ExportInput) -> str:
    try:
        base = datetime.fromisoformat(inp.start_date)
    except ValueError:
        base = datetime.combine(date.today(), datetime.min.time())

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//TripMind//Itinerary//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_esc(inp.title)}",
    ]
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")

    for idx, ev in enumerate(inp.events):
        try:
            hh, mm = map(int, ev.start_time.split(":"))
        except ValueError:
            hh, mm = 9, 0
        start = base + timedelta(days=ev.day - 1, hours=hh, minutes=mm)
        end = start + timedelta(minutes=ev.duration_min)
        lines += [
            "BEGIN:VEVENT",
            f"UID:tripmind-{stamp}-{idx}@tripmind.app",
            f"DTSTAMP:{stamp}",
            f"DTSTART:{start.strftime('%Y%m%dT%H%M%S')}",
            f"DTEND:{end.strftime('%Y%m%dT%H%M%S')}",
            f"SUMMARY:{_esc(ev.title)}",
        ]
        if ev.location:
            lines.append(f"LOCATION:{_esc(ev.location)}")
        if ev.notes:
            lines.append(f"DESCRIPTION:{_esc(ev.notes)}")
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines)
