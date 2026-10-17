#!/usr/bin/env python3
"""Resolve one saved, content-scoped download. Python 3.10+, no packages required.

JSON stdin: {"title": "The Trap", "link": {"url": "...", "kind": "download",
"scope": "episode", "season": 1, "episode": 1, "resolution": 720, "codec": "H.264"}}
Run --serve for an authenticated worker; never crawls or imports on startup.
"""
import argparse
import base64
import codecs
import datetime as dt
import hmac
from html.parser import HTMLParser
import json
import os
import re
import ssl
import sys
import threading
import time
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener

MAX_HTML = 3 * 1024 * 1024
MAX_INPUT = 32 * 1024
STORAGE = re.compile(r"(?:pub-[a-f0-9]{32}\.r2\.dev|[a-f0-9]{32}\.r2\.cloudflarestorage\.com|video-downloads\.googleusercontent\.com)")


def safe_url(value):
    try:
        url = urlsplit(value)
        if url.scheme != "https" or not url.hostname or url.username or url.password or url.port not in (None, 443) or url.fragment:
            return None
        return url
    except (TypeError, ValueError):
        return None


def storage_url(value):
    url = safe_url(value)
    return value if url and STORAGE.fullmatch(url.hostname) and url.path not in ("", "/") else None


def greenmotors_url(value):
    url = safe_url(value)
    if not url or url.netloc not in ("greenmotors.club", "greenmotors.cc") or url.path != "/" or not re.fullmatch(r"id=[^&]+", url.query):
        return False
    token = unquote(url.query[3:])
    return 8 <= len(token) <= 8192 and bool(re.fullmatch(r"[A-Za-z0-9+/_=-]+", token))


def supported(link):
    url = safe_url(link.get("url"))
    return bool(url and link.get("kind") == "download" and link.get("scope") in ("movie", "episode", "season") and (
        greenmotors_url(link.get("url")) or (not url.query and (
            url.hostname == "hubcloud.ist" and re.fullmatch(r"/drive/[a-z0-9]+/?", url.path) or
            url.hostname == "hubdrive.pics" and re.fullmatch(r"/file/\d+/?", url.path) or
            url.hostname in ("hubcdn.club", "hubcdn.wiki") and re.fullmatch(r"/file/[a-zA-Z0-9]+/?", url.path)))))


def normalize(value):
    value = "".join(c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c)).lower()
    return " ".join("".join(c if c.isalnum() else " " for c in value).split())


def matches(filename, link, title):
    if not filename or len(filename) > 1000 or any(ord(c) < 32 or ord(c) == 127 or c in "/\\" for c in filename):
        return False
    if not re.search(r"\.(mp4|webm|mkv|mov|avi|zip|rar|7z)$", filename, re.I) or not normalize(filename).startswith(normalize(title) + " "):
        return False
    release_year = link.get("releaseYear")
    if link["scope"] == "movie" and release_year is not None:
        if type(release_year) is not int or not normalize(filename).startswith(normalize(title) + " " + str(release_year) + " "):
            return False
    filename = filename.replace("_", ".")
    episodes = list(re.finditer(r"\bS(\d{1,3})[._ -]?E(\d{1,4})(?:\s*[-–]\s*E?(\d{1,4}))?\b", filename, re.I))
    if link["scope"] == "episode" and (len(episodes) != 1 or int(episodes[0][1]) != link.get("season") or
                                       int(episodes[0][2]) != link.get("episode") or episodes[0][3]):
        return False
    if link["scope"] == "season":
        season = re.search(r"\bS(\d{1,3})\b", filename, re.I)
        if episodes or not season or int(season[1]) != link.get("season"):
            return False
    if link["scope"] == "movie" and episodes:
        return False
    quality = re.search(r"\b(360|480|576|720|1080|1440|2160|4320)p\b", filename, re.I)
    if link.get("resolution") is not None and (not quality or int(quality[1]) != link["resolution"]):
        return False
    patterns = {"HEVC": r"\b(HEVC|x265|h[._ -]?265)\b", "H.264": r"\b(x264|h[._ -]?264)\b", "AV1": r"\bAV1\b"}
    return link.get("codec") not in patterns or bool(re.search(patterns[link["codec"]], filename, re.I))


class Anchors(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.links.append(dict(attrs))


class InlineScripts(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=False)
        self.scripts, self.capture, self.parts = [], False, []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.capture, self.parts = "src" not in dict(attrs), []

    def handle_data(self, value):
        if self.capture:
            self.parts.append(value)

    def handle_endtag(self, tag):
        if tag == "script":
            if self.capture:
                self.scripts.append("".join(self.parts))
            self.capture, self.parts = False, []


class ArchiveAnchors(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.links, self.stack = [], []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        inside = bool(self.stack and self.stack[-1][1]) or "entry-content" in attrs.get("class", "").split()
        blocked = tag in ("nav", "header", "footer", "aside") or attrs.get("id") == "comments" or "comments" in attrs.get("class", "").split()
        if blocked or any(item[2] for item in self.stack):
            inside, blocked = False, True
        if inside and tag == "a":
            self.links.append(attrs)
        if tag not in ("area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"):
            self.stack.append((tag, inside, blocked))

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break


def strict_base64(value):
    if not isinstance(value, str) or not value or len(value) > 8192 or not re.fullmatch(r"[A-Za-z0-9+/]*={0,2}", value):
        raise ValueError("Invalid redirect data")
    raw = base64.b64decode(value, validate=True)
    if base64.b64encode(raw).decode("ascii") != value:
        raise ValueError("Invalid redirect encoding")
    return raw.decode("utf-8")


def greenmotors_destination(html):
    if len(html) > 1_000_000:
        return None
    tokens = set()
    pattern = r"\bs\s*\(\s*(['\"])o\1\s*,\s*(['\"])([A-Za-z0-9+/=]{1,8192})\2\s*,\s*180\s*\*\s*1000\s*\)"
    for script in InlineScripts(html).scripts:
        tokens.update(match[3] for match in re.finditer(pattern, script))
    if len(tokens) != 1:
        return None
    try:
        raw = strict_base64(codecs.decode(strict_base64(strict_base64(next(iter(tokens)))), "rot_13"))
        value = json.loads(raw)
        if not isinstance(value, dict) or set(value) != {"w", "l", "o"} or type(value["w"]) is not int or not 0 <= value["w"] <= 120 or value["l"] != "https://greenmotors.cc/homelander/":
            return None
        if any(len(re.findall('"' + key + r'"\s*:', raw)) != 1 for key in ("w", "l", "o")):
            return None
        destination = strict_base64(value["o"])
        allowed = r"https://(?:hblinks\.lol/archives/[1-9]\d*|hubcloud\.ist/drive/[a-z0-9]+/?|hubdrive\.pics/file/\d+/?|hubcdn\.(?:club|wiki)/file/[A-Za-z0-9]+/?)"
        return destination if re.fullmatch(allowed, destination) else None
    except (ValueError, UnicodeError, TypeError):
        return None


def greenmotors_archive(html):
    destination = greenmotors_destination(html)
    return destination if destination and re.fullmatch(r"https://hblinks\.lol/archives/[1-9]\d*", destination) else None


def archive_mirrors(html, archive):
    if len(html) > 1_000_000 or not re.fullmatch(r"https://hblinks\.lol/archives/[1-9]\d*", archive):
        return []
    mirrors = []
    for node in ArchiveAnchors(html).links:
        value = urljoin(archive, node.get("href", ""))
        if supported({"url": value, "kind": "download", "scope": "movie"}) and not greenmotors_url(value) and value not in mirrors:
            mirrors.append(value)
    return mirrors[:10]


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Network:
    def __init__(self):
        self.deadline = time.monotonic() + 22
        context = ssl.create_default_context()
        # Python.org macOS installations may not have run Install Certificates.
        # Add system/custom CA bundles while keeping certificate verification on.
        for bundle in (os.environ.get("WATCH_SOURCE_CA_BUNDLE"), os.environ.get("NODE_EXTRA_CA_CERTS"), "/etc/ssl/cert.pem"):
            if bundle and os.path.isfile(bundle):
                context.load_verify_locations(cafile=bundle)
        self.opener = build_opener(NoRedirect(), HTTPSHandler(context=context))

    def open(self, url, method="GET", headers=None):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Resolver time limit reached")
        request = Request(url, method=method, headers={"User-Agent": "MovieReckon-PythonResolver/1.0", **(headers or {})})
        try:
            return self.opener.open(request, timeout=min(8, remaining))
        except HTTPError as error:
            return error

    def document(self, url):
        origin = urlsplit(url).netloc
        for _ in range(4):
            with self.open(url, headers={"Accept": "text/html,application/xhtml+xml"}) as response:
                if response.status in (301, 302, 303, 307, 308):
                    next_url = urljoin(url, response.headers.get("Location", ""))
                    parsed = safe_url(next_url)
                    if not parsed or parsed.netloc != origin:
                        raise ValueError("Provider redirect is outside the supported origin")
                    url = next_url
                    continue
                if response.status != 200 or response.headers.get_content_type() not in ("text/html", "application/xhtml+xml"):
                    raise ValueError("Provider did not return an available HTML page")
                if int(response.headers.get("Content-Length", "0")) > MAX_HTML:
                    raise ValueError("Provider page is too large")
                chunks, size = [], 0
                while True:
                    if time.monotonic() >= self.deadline:
                        raise TimeoutError("Resolver time limit reached")
                    chunk = response.read(min(65536, MAX_HTML + 1 - size))
                    if not chunk:
                        return b"".join(chunks).decode("utf-8", errors="replace")
                    size += len(chunk)
                    if size > MAX_HTML:
                        raise ValueError("Provider page is too large")
                    chunks.append(chunk)
        raise ValueError("Provider sent too many redirects")

    def probe(self, url):
        signed = "X-Amz-Signature" in parse_qs(urlsplit(url).query)
        with self.open(url, method="GET" if signed else "HEAD", headers={"Range": "bytes=0-0"} if signed else {}) as response:
            # Some storage servers disable HEAD even when GET works.
            if signed or response.status not in (405, 501):
                return response.status, response.headers
        with self.open(url, method="GET", headers={"Range": "bytes=0-0"}) as response:
            # Read headers only, then close; never consume the media body.
            return response.status, response.headers


def cdn_file(html):
    candidates = set()
    for value in re.findall(r"https://inventoryidea\.com/\?r=[A-Za-z0-9+/=%_-]+", html)[:10]:
        try:
            encoded = unquote(urlsplit(value).query[2:])
            if len(encoded) > 12000 or not re.fullmatch(r"[A-Za-z0-9+/=_-]+", encoded):
                continue
            decoded = safe_url(base64.b64decode(encoded, altchars=b"-_").decode("utf-8"))
            if not decoded or decoded.netloc != "hubcdn.club" or decoded.path != "/dl/":
                continue
            query = parse_qs(decoded.query)
            if set(query) != {"link"} or len(query["link"]) != 1:
                continue
            final = storage_url(query["link"][0])
            if final:
                candidates.add(final)
        except (ValueError, UnicodeError):
            continue
    return next(iter(candidates)) if len(candidates) == 1 else None


def probe_file(url, link, title, network):
    status, headers = network.probe(url)
    filename = headers.get_filename()
    if filename is None and not headers.get("Content-Disposition"):
        filename = unquote(urlsplit(url).path.rsplit("/", 1)[-1])
    if isinstance(filename, tuple):
        from email.utils import collapse_rfc2231_value
        filename = collapse_rfc2231_value(filename)
    content_type = headers.get_content_type().lower()
    if status not in (200, 206) or not matches(filename, link, title) or not re.fullmatch(
            r"video/[a-z0-9.+-]+|application/(octet-stream|zip|x-zip-compressed|x-rar-compressed|vnd\.rar|x-7z-compressed)", content_type):
        return None
    now = dt.datetime.now(dt.timezone.utc)
    query = parse_qs(urlsplit(url).query)
    expires = None
    if "X-Amz-Date" in query and "X-Amz-Expires" in query:
        try:
            seconds = int(query["X-Amz-Expires"][0])
            if not 0 < seconds <= 604800:
                return None
            expires = dt.datetime.strptime(query["X-Amz-Date"][0], "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc) + dt.timedelta(seconds=seconds)
            if expires <= now + dt.timedelta(seconds=30):
                return None
        except ValueError:
            return None
    size = headers.get("Content-Length")
    if status == 206:
        found = re.search(r"/(\d+)$", headers.get("Content-Range", ""))
        size = found[1] if found else None
    size = int(size) if size and size.isdigit() and 0 < int(size) <= 2**53 - 1 else None
    return {"url": url, "filename": filename, "sizeBytes": size, "contentType": content_type,
            "checkedAt": now.isoformat().replace("+00:00", "Z"), "expiresAt": expires.isoformat().replace("+00:00", "Z") if expires else None}


def resolve(payload, network=None):
    if not isinstance(payload, dict):
        raise ValueError("Expected a title/link object")
    title, link = payload.get("title"), payload.get("link")
    if not isinstance(title, str) or not title.strip() or len(title) > 500 or not isinstance(link, dict) or not supported(link):
        raise ValueError("Provide a title and a supported saved download link")
    if link["scope"] in ("episode", "season") and (type(link.get("season")) is not int or link["season"] < 0):
        raise ValueError("Provide the selected season")
    if link["scope"] == "episode" and (type(link.get("episode")) is not int or link["episode"] < 1):
        raise ValueError("Provide the selected episode")
    network = network or Network()
    original = urlsplit(link["url"])
    if greenmotors_url(link["url"]):
        destination = greenmotors_destination(network.document("https://greenmotors.cc/?" + original.query))
        if not destination:
            return []
        mirrors = archive_mirrors(network.document(destination), destination) if urlsplit(destination).netloc == "hblinks.lol" else [destination]
        files, seen = [], set()
        for mirror in mirrors:
            try:
                for result in resolve({"title": title, "link": {**link, "url": mirror}}, network):
                    destination = urlsplit(result["url"])
                    key = (destination.netloc, destination.path, result["filename"], result["sizeBytes"])
                    if key not in seen:
                        seen.add(key)
                        files.append(result)
            except (OSError, ValueError, URLError):
                continue
        return files[:8]
    if original.hostname in ("hubcdn.club", "hubcdn.wiki"):
        final = cdn_file(network.document("https://hubcdn.wiki" + original.path))
        candidates = [final] if final else []
    else:
        cloud = {link["url"].rstrip("/")} if original.hostname == "hubcloud.ist" else {
            node["href"].rstrip("/") for node in Anchors(network.document(link["url"])).links if
            re.fullmatch(r"https://hubcloud\.ist/drive/[a-z0-9]+/?", node.get("href", ""))}
        if len(cloud) != 1:
            return []
        cloud = next(iter(cloud))
        buttons = [node["href"] for node in Anchors(network.document(cloud)).links if node.get("id") == "download" and node.get("href")]
        if len(buttons) != 1:
            return []
        next_url = safe_url(buttons[0])
        query = parse_qs(next_url.query) if next_url else {}
        if not next_url or next_url.netloc != "gamerxyt.com" or next_url.path != "/hubcloud.php" or set(query) != {"host", "id", "token"} or any(len(v) != 1 for v in query.values()) or query["host"] != ["hubcloud"] or query["id"] != [urlsplit(cloud).path.split("/")[-1]]:
            return []
        candidates = [node["href"] for node in Anchors(network.document(buttons[0])).links if node.get("id") in ("s3", "fsl") and storage_url(node.get("href", ""))]
    files = []
    for url in list(dict.fromkeys(candidates))[:2]:
        try:
            result = probe_file(url, link, title, network)
            if result:
                files.append(result)
        except (OSError, ValueError, URLError):
            continue
    return files


def serve(host, port):
    secret = os.environ.get("WATCH_SOURCE_PYTHON_SECRET", "")
    if len(secret) < 32:
        raise ValueError("Set WATCH_SOURCE_PYTHON_SECRET to at least 32 characters")
    capacity = threading.BoundedSemaphore(2)

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/resolve":
                self.send_error(404)
                return
            if not hmac.compare_digest(self.headers.get("Authorization", "").encode(), ("Bearer " + secret).encode()):
                self.send_error(401)
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self.send_error(400)
                return
            if not 0 < size <= MAX_INPUT:
                self.send_error(400)
                return
            if not capacity.acquire(blocking=False):
                self.send_error(429)
                return
            try:
                payload = json.loads(self.rfile.read(size))
                result = json.dumps({"downloads": resolve(payload)}).encode()
                self.send_response(200)
            except (ValueError, OSError, URLError):
                result = b'{"error":"Unable to resolve this file from the provider"}'
                self.send_response(503)
            finally:
                capacity.release()
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(result)))
            self.end_headers()
            self.wfile.write(result)

    ThreadingHTTPServer((host, port), Handler).serve_forever()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stdin", action="store_true", help="Read one title/link JSON object from stdin")
    parser.add_argument("--serve", action="store_true", help="Run the authenticated worker")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    try:
        if args.serve:
            serve(args.host, args.port)
        else:
            raw = sys.stdin.buffer.read(MAX_INPUT + 1)
            if len(raw) > MAX_INPUT:
                raise ValueError("Input is too large")
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise ValueError("Expected a title/link object")
            print(json.dumps({"downloads": resolve(payload)}))
    except (ValueError, OSError, URLError):
        print(json.dumps({"error": "Unable to resolve this file from the provider"}))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
