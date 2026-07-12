import { describe, expect, it } from "vitest";
import { detectImageMime } from "@/pages/api/theater/upload";

describe("theater upload signatures", () => {
  it("detects supported image signatures", () => {
    expect(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(detectImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectImageMime(Buffer.from("GIF89a", "ascii"))).toBe("image/gif");
    expect(detectImageMime(Buffer.from("RIFF0000WEBP", "ascii"))).toBe("image/webp");
  });

  it("rejects arbitrary bytes", () => {
    expect(detectImageMime(Buffer.from("<script>alert(1)</script>"))).toBeNull();
  });
});
