import { describe, expect, it } from "vitest";

import { applyNoStoreHeaders } from "./cors.js";

describe("applyNoStoreHeaders", () => {
  it("marks responses as private and non-cacheable", () => {
    const response = {
      headers: new Map<string, string>(),
      setHeader(name: string, value: string) {
        this.headers.set(name, value);
      },
    };

    applyNoStoreHeaders(response as never);

    expect(response.headers.get("Cache-Control")).toBe("no-store, private, max-age=0");
    expect(response.headers.get("Pragma")).toBe("no-cache");
    expect(response.headers.get("Expires")).toBe("0");
  });
});
