"""Read-only Windows System and Application collector for OmniEdge."""
import argparse
import base64
from datetime import datetime, timezone
import getpass
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

CHANNELS = ("System", "Application")
SEVERITY = {0: "info", 1: "critical", 2: "high", 3: "medium", 4: "info", 5: "low"}
POWERSHELL_READER = r"""
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

function Read-Events($parameters) {
    try { Get-WinEvent @parameters -ErrorAction Stop }
    catch {
        if ($_.FullyQualifiedErrorId -notlike 'NoMatchingEventsFound,*') { throw }
    }
}

$head = Read-Events @{ LogName = $channel; MaxEvents = 1 }
$latest = if ($head) { [long]$head.RecordId } else { 0 }
$reset = $null -ne $cursor -and $latest -lt $cursor
if ($null -ne $cursor -and $cursor -gt 0 -and !$reset -and $anchor) {
    $previous = Read-Events @{ LogName = $channel; FilterXPath = "*[System[EventRecordID=$cursor]]"; MaxEvents = 1 }
    $reset = $previous -and ($previous.TimeCreated.ToUniversalTime().ToString('o') -ne $anchor)
}

if ($null -eq $cursor -or $reset) {
    if ($backfill -gt 0) {
        $records = @(Read-Events @{ LogName = $channel; MaxEvents = $backfill } | Sort-Object RecordId)
    } else {
        $records = @()
    }
    $next = $latest
    $nextTime = if ($head) { $head.TimeCreated.ToUniversalTime().ToString('o') } else { $null }
} else {
    $records = @(Read-Events @{
        LogName = $channel
        FilterXPath = "*[System[EventRecordID > $cursor]]"
        Oldest = $true
        MaxEvents = $limit
    })
    $next = $cursor
    $nextTime = $anchor
}

$rows = @($records | ForEach-Object {
    $record = $_
    $message = try { $record.FormatDescription() } catch { $null }
    @{
        computer = $record.MachineName
        channel = $record.LogName
        provider = $record.ProviderName
        event_id = $record.Id
        record_id = $record.RecordId
        level = $record.Level
        occurred_at = $record.TimeCreated.ToUniversalTime().ToString('o')
        message = if ($message) { $message.Substring(0, [Math]::Min(12000, $message.Length)) } else { $null }
    }
})
@{ rows = $rows; cursor = $next; anchor = $nextTime; reset = [bool]$reset } | ConvertTo-Json -Depth 5 -Compress
"""


def now():
    return datetime.now(timezone.utc).isoformat()


def channel_name(value):
    for channel in CHANNELS:
        if channel.casefold() == value.casefold():
            return channel
    raise ValueError("Only the local System and Application channels are supported.")


def normalize(record, channel):
    actual_channel = channel_name(record["channel"])
    if actual_channel != channel:
        raise ValueError("Windows returned a record from an unexpected channel.")
    computer = record["computer"].strip()
    provider = record["provider"].strip()
    occurred = datetime.fromisoformat(record["occurred_at"].replace("Z", "+00:00"))
    if not computer or not provider or occurred.tzinfo is None:
        raise ValueError("Windows record is missing a computer, provider, or timestamp.")
    timestamp = occurred.astimezone(timezone.utc).isoformat()
    record_id = int(record["record_id"])
    event_id = int(record["event_id"])
    level = record.get("level")
    if level is not None:
        level = int(level)
    identity = json.dumps([computer.casefold(), actual_channel, record_id, record["occurred_at"]],
                          ensure_ascii=False, separators=(",", ":"))
    return {
        "external_event_id": "windows:" + hashlib.sha256(identity.encode("utf-8")).hexdigest(),
        "event_type": f"windows.{actual_channel.lower()}.{event_id}",
        "severity": SEVERITY.get(level, "info"),
        "occurred_at": timestamp,
        "message": (record.get("message") or f"{provider} event {event_id} (message unavailable)").strip()
                   or f"{provider} event {event_id} (message unavailable)",
        "metadata": {
            "computer": computer,
            "channel": actual_channel,
            "provider": provider,
            "event_id": event_id,
            "record_id": record_id,
            "level": level,
        },
    }


def read_events(channel, checkpoint, limit, backfill):
    channel = channel_name(channel)
    cursor = int(checkpoint["id"]) if checkpoint else None
    anchor = checkpoint.get("anchor") if checkpoint else None
    if anchor:
        # Reconstruct ISO text from validated ASCII timestamp characters before passing it to PowerShell.
        if any(char not in "0123456789TtZz.-+:" for char in anchor):
            raise ValueError("Invalid checkpoint timestamp.")
        datetime.fromisoformat(anchor.replace("Z", "+00:00"))
    script = (
        f"$channel='{channel}'; $cursor={cursor if cursor is not None else '$null'}; "
        f"$anchor='{anchor or ''}'; $limit={int(limit)}; $backfill={int(backfill)};\n"
        + POWERSHELL_READER
    )
    encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
            capture_output=True, encoding="utf-8", errors="replace", timeout=45,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError(f"{channel}: could not start or finish the Windows Event Log read.") from exc
    if result.returncode:
        raise RuntimeError(f"{channel}: Windows Event Log query failed. Check channel access in Event Viewer.")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{channel}: Windows returned an unreadable event batch.") from exc


def endpoint(base):
    parsed = urlsplit(base)
    if (parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username is not None
            or parsed.password is not None or parsed.query or parsed.fragment or parsed.path not in ("", "/")):
        raise ValueError("Use an API origin such as http://127.0.0.1:8000, without credentials or a path.")
    if parsed.scheme == "http" and parsed.hostname not in ("127.0.0.1", "::1", "localhost"):
        raise ValueError("Use HTTPS for a non-local API.")
    return urlunsplit((parsed.scheme, parsed.netloc, "/api/v1/ingest/events/", "", ""))


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check_connection(url, source_id, key, opener):
    request = Request(url, headers={"X-Source-Key": key, "X-Expected-Source-Id": str(source_id)}, method="HEAD")
    try:
        with opener.open(request, timeout=15) as response:
            if response.status == 204:
                return
    except HTTPError as exc:
        code = exc.code
        exc.close()
        details = {
            400: "Link a Windows Event Log source to an asset with a hostname.",
            401: "Source key is invalid, disabled, or belongs to a suspended tenant.",
            403: "The key does not match the selected source ID.",
        }
        raise RuntimeError(f"HTTP {code}. {details.get(code, 'Check the OmniEdge API URL and version.')}") from None
    except (URLError, TimeoutError):
        raise RuntimeError("Could not connect to the OmniEdge ingestion API.") from None
    raise RuntimeError("Unexpected response from the OmniEdge ingestion API.")


def send_event(url, source_id, key, payload, opener):
    request = Request(url, json.dumps(payload).encode("utf-8"), {
        "Content-Type": "application/json",
        "X-Source-Key": key,
        "X-Expected-Source-Id": str(source_id),
    })
    try:
        with opener.open(request, timeout=15) as response:
            data = json.load(response)
            if response.status == 201 and data.get("source") == source_id:
                return "created"
            if response.status == 200 and data.get("deduplicated") is True:
                return "duplicate"
    except HTTPError as exc:
        with exc:
            try:
                body = json.load(exc)
                detail = body.get("detail") if isinstance(body, dict) else None
            except (ValueError, OSError):
                detail = None
        messages = {
            400: "The API rejected the Windows event payload.",
            401: "Source key rejected. Check the key, source status, and tenant status.",
            403: "Source ID or permissions rejected. Check your source registration.",
            409: "Event ID conflicts with a different saved payload. Check the source before retrying.",
        }
        message = messages.get(exc.code, "Check the API origin and server status.")
        if exc.code == 400 and detail in (
            "Windows events require a registered Windows Event Log source with an asset.",
            "Windows computer name does not match the linked asset hostname.",
        ):
            message = detail
        raise RuntimeError(f"HTTP {exc.code}. {message}") from None
    except (URLError, TimeoutError, ValueError) as exc:
        raise RuntimeError("Could not reach the OmniEdge ingestion API or read its response.") from exc
    raise RuntimeError("The API returned an unexpected ingestion response.")


def save_state(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def collect_channel(channel, state, path, read, send, limit, backfill):
    entry = state["channels"].setdefault(channel, {})
    entry["last_attempt_at"] = now()
    sent = duplicates = 0
    try:
        batch = read(channel, entry.get("checkpoint"), limit, backfill)
        if batch["reset"]:
            print(f"{channel}: record sequence changed. Reinitializing the channel cursor.", flush=True)
            entry.pop("checkpoint", None)
            save_state(path, state)
        for record in batch["rows"]:
            disposition = send(normalize(record, channel))
            sent += disposition == "created"
            duplicates += disposition == "duplicate"
            entry["last_delivery_at"] = now()
            entry["checkpoint"] = {"id": int(record["record_id"]), "anchor": record["occurred_at"]}
            save_state(path, state)
        entry["checkpoint"] = {"id": batch["cursor"], "anchor": batch["anchor"]} if not batch["rows"] else entry["checkpoint"]
        entry.update(status="connected" if sent or duplicates else "idle",
                     last_success_at=now(), error=None)
        print(f"{channel}: {entry['status']}; {sent} saved, {duplicates} already present.", flush=True)
        return len(batch["rows"]) >= limit
    except (RuntimeError, ValueError, KeyError, TypeError) as exc:
        message = str(exc) if isinstance(exc, RuntimeError) else "Could not normalize a Windows event."
        entry.update(status="error", error=message)
        print(f"{channel}: {message}", file=sys.stderr, flush=True)
        return False
    finally:
        save_state(path, state)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--source-id", type=int, required=True)
    parser.add_argument("--channel", choices=CHANNELS, action="append")
    parser.add_argument("--interval", type=int, default=15, help="Seconds between normal polls (default: 15).")
    parser.add_argument("--batch-size", type=int, default=50)
    parser.add_argument("--backfill", type=int, default=0, help="Recent events per channel on first run (0–100).")
    parser.add_argument("--once", action="store_true", help="Run one pass over the selected channels.")
    parser.add_argument("--status", action="store_true", help="Show saved status without collecting or authenticating.")
    args = parser.parse_args()
    try:
        url = endpoint(args.api)
        if args.source_id < 1 or not 1 <= args.batch_size <= 200 or not 0 <= args.backfill <= 100 or args.interval < 1:
            raise ValueError("Use a valid source ID, batch size 1–200, backfill 0–100, and positive interval.")
        if os.name != "nt":
            raise ValueError("The reader runs on Windows 10 or 11.")
        scope = hashlib.sha256(url.encode()).hexdigest()[:12]
        path = Path(os.environ["LOCALAPPDATA"]) / "OmniEdge" / "windows-collector" / f"{scope}-{args.source_id}.json"
        if args.status:
            if path.is_file():
                print(path.read_text(encoding="utf-8"))
            else:
                print("No status recorded for this API and source.")
            return 0
        from msvcrt import LK_NBLCK, locking
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.with_suffix(".lock").open("a+b") as lock:
            if lock.tell() == 0:
                lock.write(b"0")
                lock.flush()
            lock.seek(0)
            try:
                locking(lock.fileno(), LK_NBLCK, 1)
            except OSError:
                raise ValueError("Another collector is already running for this API and source.") from None

            state = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {"channels": {}}
            key = os.environ.get("OMNIEDGE_SOURCE_KEY") or getpass.getpass("OmniEdge source key: ")
            if not key.strip() or any(char.isspace() for char in key):
                raise ValueError("Enter a valid source key without spaces.")
            opener = build_opener(ProxyHandler({}), NoRedirect())
            channels = list(dict.fromkeys(args.channel or CHANNELS))

            def send(payload):
                return send_event(url, args.source_id, key, payload, opener)

            state.update(running=True, started_at=now(), stopped_at=None)
            save_state(path, state)
            try:
                while True:
                    try:
                        check_connection(url, args.source_id, key, opener)
                    except RuntimeError as exc:
                        state.update(connection="error", connection_error=str(exc), last_check_at=now())
                        save_state(path, state)
                        print(str(exc), file=sys.stderr, flush=True)
                        if args.once:
                            return 1
                        time.sleep(args.interval)
                        continue
                    state.update(connection="connected", connection_error=None, last_check_at=now())
                    backlog = [collect_channel(channel, state, path, read_events, send,
                                               args.batch_size, args.backfill) for channel in channels]
                    if args.once:
                        return int(any(state["channels"][channel]["status"] == "error" for channel in channels))
                    time.sleep(1 if any(backlog) else args.interval)
            except KeyboardInterrupt:
                print("Collector stopped.")
                return 0
            finally:
                state.update(running=False, connection="stopped", stopped_at=now())
                save_state(path, state)
    except (OSError, ValueError, KeyError) as exc:
        print(f"Collector: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
