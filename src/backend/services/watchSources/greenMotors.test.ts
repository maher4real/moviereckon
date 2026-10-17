import { describe, expect, it, vi } from "vitest";
import { decodeGreenMotorsArchive, decodeGreenMotorsDestination, parseGreenMotorsMirrors } from "./greenMotors";

const archive = "https://hblinks.lol/archives/123";
const base64 = (value: string) => Buffer.from(value).toString("base64");
const rot13 = (value: string) => value.replace(/[A-Za-z]/g, (letter) =>
  String.fromCharCode(letter.charCodeAt(0) + (letter.toLowerCase() <= "m" ? 13 : -13)));
const payload = (json: string) => base64(base64(rot13(base64(json))));
const fields = (destination = archive) => ({ w: 10, l: "https://greenmotors.cc/homelander/", o: base64(destination) });
const html = (data: unknown = fields()) => `<script>s('o','${payload(JSON.stringify(data))}',180*1000);dangerous()</script>`;

describe("GreenMotors published redirect data", () => {
  it("decodes the archive payload without executing provider JavaScript", () => {
    const dangerous = vi.fn();
    vi.stubGlobal("dangerous", dangerous);
    try {
      expect(decodeGreenMotorsArchive(html())?.href).toBe(archive);
      expect(decodeGreenMotorsDestination(html())?.href).toBe(archive);
      expect(dangerous).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it.each([
    "https://hubcloud.ist/drive/abcdefgh123", "https://hubdrive.pics/file/123456",
    "https://hubcdn.club/file/Abc123", "https://hubcdn.wiki/file/Abc123",
  ])("decodes the direct supported provider destination %s", (destination) => {
    expect(decodeGreenMotorsDestination(html(fields(destination)))?.href).toBe(destination);
    expect(decodeGreenMotorsArchive(html(fields(destination)))).toBeNull();
  });

  it.each([
    "https://hubcloud.ist.evil.example/drive/abc", "https://hubcloud.ist/drive/abc?next=evil", "https://hubcloud.ist/drive/abc#hash",
    "https://user@hubcloud.ist/drive/abc", "https://hubcloud.ist:8443/drive/abc", "https://hubcloud.ist:443/drive/abc",
    "https://hubcloud.ist/drive/abc/other", "https://hubdrive.pics/file/abc", "http://hubdrive.pics/file/123",
    "https://hubcdn.club/dl/?link=evil", "https://greenmotors.cc/?id=abc", "https://untrusted.example/file/123",
    "//hubcloud.ist/drive/abc", " https://hubcloud.ist/drive/abc",
  ])("rejects an untrusted direct redirect destination %s", (destination) => {
    expect(decodeGreenMotorsDestination(html(fields(destination)))).toBeNull();
  });

  it("rejects malformed, ambiguous, executable, and oversized tokens", () => {
    expect(decodeGreenMotorsArchive("<script>s('o','!!!!',180*1000)</script>")).toBeNull();
    expect(decodeGreenMotorsArchive("<script>s('o',dangerous(),180*1000)</script>")).toBeNull();
    expect(decodeGreenMotorsArchive(html() + html(fields(`${archive}4`)))).toBeNull();
    expect(decodeGreenMotorsArchive(html().replace("180*1000", "1+180*1000"))).toBeNull();
    expect(decodeGreenMotorsArchive("x".repeat(1_000_001))).toBeNull();
    expect(decodeGreenMotorsArchive(`<script>s('o','${"A".repeat(8196)}',180*1000)</script>`)).toBeNull();
    expect(decodeGreenMotorsArchive(`<script>s('o','${payload('{"w":10,"w":20,"l":"https://greenmotors.cc/homelander/","o":"' + base64(archive) + '"}')}',180*1000)</script>`)).toBeNull();
    expect(decodeGreenMotorsArchive(html().replace(/<script>|<\/script>/g, ""))).toBeNull();
  });

  it("requires the observed landing page, fields, and bounded numeric countdown", () => {
    for (const value of [null, [], { ...fields(), w: "10" }, { ...fields(), w: -1 }, { ...fields(), w: 121 },
      { ...fields(), l: "https://untrusted.example/" }, { ...fields(), extra: true }, { ...fields(), o: "not-base64" }]) {
      expect(decodeGreenMotorsArchive(html(value))).toBeNull();
    }
  });

  it.each([
    "https://hblinks.lol.evil.example/archives/123", "http://hblinks.lol/archives/123", "https://hblinks.lol:8443/archives/123",
    "https://user@hblinks.lol/archives/123", "https://hblinks.lol/archives/123?next=evil", "https://hblinks.lol/archives/123#evil",
    "https://hblinks.lol/archives/123/", "https://hblinks.lol/archives/0", "https://hblinks.lol/other/123", "http://127.0.0.1/private",
    "/archives/123", "//hblinks.lol/archives/123", " https://hblinks.lol/archives/123", "https://hblinks.lol:443/archives/123",
  ])("rejects untrusted archive destination %s", (url) => {
    expect(decodeGreenMotorsArchive(html(fields(url)))).toBeNull();
  });
});

describe("GreenMotors archive mirrors", () => {
  const cloud = "https://hubcloud.ist/drive/abcdefghijk";
  const drive = "https://hubdrive.pics/file/123456";
  const cdn = "https://hubcdn.club/file/Abc123";
  const link = (url: string) => `<a href="${url}">Download</a>`;

  it("returns all distinct supported mirrors from the content section only", () => {
    expect(parseGreenMotorsMirrors(`${link("https://hubdrive.pics/file/999")}<div class="entry-content">${[cloud, drive, cdn, cloud].map(link).join("")}<footer>${link("https://hubdrive.pics/file/111")}</footer></div>`, archive))
      .toEqual([cloud, drive, cdn]);
  });

  it("rejects untrusted hosts, recursive redirects, parameters, credentials, and archive origins", () => {
    const unsafe = ["https://evil.example/file/123", "http://hubdrive.pics/file/123", "https://hubdrive.pics:8443/file/123",
      "https://user@hubdrive.pics/file/123", "https://hubdrive.pics/file/123?next=evil", "https://hubcdn.club/file/Abc#evil",
      "https://hubdrive.pics/folder/123", "https://greenmotors.cc/?id=abc", "https://hubcloud.ist/drive/abc/other"];
    expect(parseGreenMotorsMirrors(`<div class="entry-content">${unsafe.map(link).join("")}</div>`, archive)).toEqual([]);
    expect(parseGreenMotorsMirrors(`<div class="entry-content">${link(cloud)}</div>`, "https://evil.example/archives/123")).toEqual([]);
    expect(parseGreenMotorsMirrors("x".repeat(1_000_001), archive)).toEqual([]);
  });

  it("bounds the number of mirror candidates", () => {
    expect(parseGreenMotorsMirrors(`<div class="entry-content">${Array.from({ length: 20 }, (_, index) => link(`https://hubdrive.pics/file/${index + 1}`)).join("")}</div>`, archive)).toHaveLength(10);
  });
});
