import base64
import codecs
from email.message import Message
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

SCRIPT = Path(__file__).with_name("resolve_watch_links.py")
spec = importlib.util.spec_from_file_location("resolver", SCRIPT)
resolver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resolver)

FILE = "https://pub-0123456789abcdef0123456789abcdef.r2.dev/file"
SIGNED = "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/hub/file?X-Amz-Signature=fixture"
NAME = "The.Trap.S01E01.720p.x264.mkv"
LINK = {"url": "https://hubcdn.club/file/episode1", "kind": "download", "scope": "episode", "season": 1, "episode": 1, "resolution": 720, "codec": "H.264"}


def wrapped(url=FILE):
    value = base64.b64encode(("https://hubcdn.club/dl/?link=" + url).encode()).decode()
    return "<script>const ad='https://ads.example/click';const redirect='https://inventoryidea.com/?r=" + value + "';</script>"


def green_html(archive="https://hblinks.lol/archives/123", raw=None):
    encode = lambda value: base64.b64encode(value.encode()).decode()
    raw = raw or json.dumps({"w": 10, "l": "https://greenmotors.cc/homelander/", "o": encode(archive)})
    token = encode(encode(codecs.encode(encode(raw), "rot_13")))
    return "<script>s('o','" + token + "',180*1000);</script>"


def headers(name=NAME, content_type="application/octet-stream"):
    value = Message()
    value["Content-Disposition"] = "attachment; filename*=UTF-8''" + name
    value["Content-Type"] = content_type
    value["Content-Length"] = "540426006"
    return value


class FakeNetwork:
    def __init__(self, pages=None, response=None):
        self.pages = pages or {"https://hubcdn.wiki/file/episode1": wrapped()}
        self.response = response or (200, headers())
        self.documents, self.probes = [], []

    def document(self, url):
        self.documents.append(url)
        return self.pages[url]

    def probe(self, url):
        self.probes.append(url)
        return self.response


class ResolverTests(unittest.TestCase):
    def test_greenmotors_resolves_all_trusted_mirrors_and_ignores_failed_mirrors(self):
        archive = "https://hblinks.lol/archives/123"
        pages = {"https://greenmotors.cc/?id=YXJjaGl2ZQ==": green_html(),
                 archive: '<nav><a href="https://hubcdn.club/file/unrelated">No</a></nav><div class="entry-content"><a href="https://hubcdn.club/file/offline">One</a><a href="https://hubcdn.club/file/wrong">Two</a><a href="https://hubcdn.club/file/episode1">Three</a><a href="https://ads.example/track">No</a></div>',
                 "https://hubcdn.wiki/file/wrong": wrapped(FILE + "2"), "https://hubcdn.wiki/file/episode1": wrapped()}
        class Mirrors(FakeNetwork):
            def document(self, url):
                if url not in self.pages:
                    self.documents.append(url)
                    raise OSError("Mirror offline")
                return super().document(url)
            def probe(self, url):
                return (200, headers(NAME.replace("S01E01", "S01E02") if url.endswith("2") else NAME))
        network = Mirrors(pages=pages)
        files = resolver.resolve({"title": "The Trap", "link": {**LINK, "url": "https://greenmotors.club/?id=YXJjaGl2ZQ=="}}, network)
        self.assertEqual([file["url"] for file in files], [FILE])
        self.assertFalse(any("homelander" in url or "unrelated" in url or "ads.example" in url for url in network.documents))

    def test_greenmotors_direct_provider_destination(self):
        wrapper = "https://greenmotors.cc/?id=YXJjaGl2ZQ=="
        network = FakeNetwork(pages={wrapper: green_html(LINK["url"]), "https://hubcdn.wiki/file/episode1": wrapped()})
        self.assertEqual(resolver.greenmotors_destination(green_html(LINK["url"])), LINK["url"])
        self.assertIsNone(resolver.greenmotors_archive(green_html(LINK["url"])))
        result = resolver.resolve({"title": "The Trap", "link": {**LINK, "url": wrapper}}, network)
        self.assertEqual(result[0]["url"], FILE)
        self.assertEqual(network.documents, [wrapper, "https://hubcdn.wiki/file/episode1"])

    def test_greenmotors_payload_requires_canonical_data_and_an_allowlisted_archive(self):
        self.assertEqual(resolver.greenmotors_archive(green_html()), "https://hblinks.lol/archives/123")
        for destination in ("https://hblinks.lol.evil.example/archives/123", "https://hblinks.lol/archives/123?next=private", "https://127.0.0.1/archives/123", "/archives/123"):
            self.assertIsNone(resolver.greenmotors_archive(green_html(destination)))
        self.assertIsNone(resolver.greenmotors_archive(green_html() + green_html("https://hblinks.lol/archives/456")))
        self.assertIsNone(resolver.greenmotors_archive(green_html().replace("<script>", "").replace("</script>", "")))
        self.assertIsNone(resolver.greenmotors_archive(green_html(raw='{"w":10,"w":20,"l":"https://greenmotors.cc/homelander/","o":"eA=="}')))
        for url in ("https://greenmotors.club/?id=YXJjaGl2ZQ==&next=private", "https://greenmotors.club.evil.example/?id=YXJjaGl2ZQ==", "https://greenmotors.cc/other/?id=YXJjaGl2ZQ=="):
            self.assertFalse(resolver.greenmotors_url(url))

    def test_cdn_decodes_only_published_file_and_checks_metadata(self):
        network = FakeNetwork()
        files = resolver.resolve({"title": "The Trap", "link": LINK}, network)
        self.assertEqual(files[0]["filename"], NAME)
        self.assertEqual(files[0]["sizeBytes"], 540426006)
        self.assertEqual(network.documents, ["https://hubcdn.wiki/file/episode1"])
        self.assertEqual(network.probes, [FILE])

    def test_rejects_wrong_title_episode_season_quality_codec_and_ranges(self):
        for name in (NAME.replace("The.Trap", "Another.Show"), NAME.replace("S01E01", "S02E01"), NAME.replace("S01E01", "S01E02"),
                     NAME.replace("720p", "1080p"), NAME.replace("x264", "x265"), NAME.replace("S01E01", "S01E01-E03"),
                     NAME.replace("S01E01", "S01E01E02"), NAME.replace("S01E01", "S01E01+S01E02")):
            self.assertEqual(resolver.resolve({"title": "The Trap", "link": LINK}, FakeNetwork(response=(200, headers(name)))), [])

    def test_rejects_html_redirects_expiry_and_private_or_arbitrary_destinations(self):
        for response in ((302, headers()), (200, headers(content_type="text/html"))):
            self.assertEqual(resolver.resolve({"title": "The Trap", "link": LINK}, FakeNetwork(response=response)), [])
        for url in ("http://127.0.0.1/file", "https://localhost/file", "https://user:pass@hubcdn.club/file/episode1", "https://ads.example/file"):
            with self.assertRaises(ValueError):
                resolver.resolve({"title": "The Trap", "link": {**LINK, "url": url}}, FakeNetwork())
            self.assertIsNone(resolver.cdn_file(wrapped(url)))
        expired = SIGNED + "&X-Amz-Date=20200101T000000Z&X-Amz-Expires=18000"
        self.assertEqual(resolver.resolve({"title": "The Trap", "link": LINK}, FakeNetwork(pages={"https://hubcdn.wiki/file/episode1": wrapped(expired)})), [])

    def test_refuses_ambiguous_payloads_and_does_not_execute_javascript(self):
        self.assertIsNone(resolver.cdn_file(wrapped() + wrapped(FILE + "2")))
        self.assertIsNone(resolver.cdn_file("<script>raise('execute')</script>"))

    def test_drive_chain_follows_only_matching_content_and_storage_buttons(self):
        link = {**LINK, "url": "https://hubdrive.pics/file/123"}
        page = "https://gamerxyt.com/hubcloud.php?host=hubcloud&id=abc&token=fixture"
        network = FakeNetwork(pages={link["url"]: '<a href="https://ads.example/ad">Download</a><a href="https://hubcloud.ist/drive/abc">Server</a>',
            "https://hubcloud.ist/drive/abc": '<a id="download" href="' + page + '">Generate</a>',
            page: '<a id="s3" href="' + SIGNED + '">Download</a><a href="https://ads.example/file">Download</a>'})
        files = resolver.resolve({"title": "The Trap", "link": link}, network)
        self.assertEqual(files[0]["url"], SIGNED)
        self.assertEqual(network.documents, list(network.pages))
        network.pages["https://hubcloud.ist/drive/abc"] = '<a id="download" href="' + page.replace("id=abc", "id=wrong") + '">Generate</a>'
        self.assertEqual(resolver.resolve({"title": "The Trap", "link": link}, network), [])

    def test_signed_probe_requests_one_byte_and_never_reads_video_body(self):
        network = resolver.Network()
        calls = []
        class Response:
            status = 206
            headers = Message()
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, *args): raise AssertionError("Must not read a video body")
        network.open = lambda url, method, headers: calls.append((url, method, headers)) or Response()
        network.probe(SIGNED)
        self.assertEqual(calls, [(SIGNED, "GET", {"Range": "bytes=0-0"})])

    def test_head_fallback_and_url_filename_without_disposition(self):
        network = resolver.Network()
        calls = []
        class Response:
            headers = Message()
            def __init__(self, status): self.status = status
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, *args): raise AssertionError("Must not read video")
        network.open = lambda url, method, headers: calls.append((method, headers)) or Response(405 if method == "HEAD" else 206)
        network.probe(FILE)
        self.assertEqual(calls, [("HEAD", {}), ("GET", {"Range": "bytes=0-0"})])
        name = NAME.replace(".", "_").replace("_mkv", ".mkv")
        url = FILE + "/" + name
        metadata = headers()
        del metadata["Content-Disposition"]
        result = resolver.probe_file(url, LINK, "The Trap", FakeNetwork(response=(200, metadata)))
        self.assertEqual(result["filename"], name)

    def test_google_download_host_is_exact_and_still_requires_matching_content(self):
        url = "https://video-downloads.googleusercontent.com/file"
        self.assertEqual(resolver.storage_url(url), url)
        self.assertIsNone(resolver.storage_url("https://video-downloads.googleusercontent.com.evil.example/file"))
        network = FakeNetwork(pages={"https://hubcdn.wiki/file/episode1": wrapped(url)})
        self.assertEqual(resolver.resolve({"title": "The Trap", "link": LINK}, network)[0]["url"], url)

    def test_direct_cloud_source(self):
        link = {**LINK, "url": "https://hubcloud.ist/drive/abc"}
        next_page = "https://gamerxyt.com/hubcloud.php?host=hubcloud&id=abc&token=fixture"
        network = FakeNetwork(pages={link["url"]: '<a id="download" href="' + next_page + '">Download</a>',
            next_page: '<a id="s3" href="' + FILE + '">File</a>'})
        self.assertEqual(len(resolver.resolve({"title": "The Trap", "link": link}, network)), 1)
        self.assertEqual(network.documents, [link["url"], next_page])

    def test_release_year_rejects_other_remakes(self):
        link = {**LINK, "releaseYear": 2026, "scope": "movie", "codec": None}
        self.assertTrue(resolver.matches("Example.2026.720p.mkv", link, "Example"))
        self.assertFalse(resolver.matches("Example.1991.720p.mkv", link, "Example"))
        self.assertFalse(resolver.matches("Example.Returns.2026.720p.mkv", link, "Example"))
        self.assertFalse(resolver.matches("Example.720p.mkv", link, "Example"))

    def test_season_pack_never_becomes_an_episode(self):
        pack = {**LINK, "scope": "season", "episode": None}
        self.assertFalse(resolver.matches(NAME, pack, "The Trap"))
        self.assertTrue(resolver.matches("The.Trap.S01.720p.x264.zip", pack, "The Trap"))

    def test_cli_rejects_unsupported_input_without_network_requests(self):
        result = subprocess.run([sys.executable, "-B", str(SCRIPT), "--stdin"], input=json.dumps({"title": "The Trap", "link": {**LINK, "url": "http://127.0.0.1/file"}}), text=True, capture_output=True, timeout=3)
        self.assertEqual(result.returncode, 1)
        self.assertIn("error", json.loads(result.stdout))
        self.assertNotIn("127.0.0.1", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
