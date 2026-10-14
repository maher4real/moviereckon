/** Minimal chainable stand-in for VercelResponse shared by handler tests. */
export function createMockResponse() {
  return {
    statusCode: 200,
    body: null as unknown,
    headers: new Map<string, unknown>(),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
    setHeader(name: string, value: unknown) {
      this.headers.set(name, value);
    },
    getHeader(name: string) {
      return this.headers.get(name);
    },
  };
}

export type MockResponse = ReturnType<typeof createMockResponse>;
