import { describe, it, expect } from "vitest";
import { Evalharness } from "../src/core.js";

describe("Evalharness integration", () => {
  it("handles concurrent ops", async () => {
    const c = new Evalharness();
    await Promise.all([c.runtest({a:1}), c.runtest({b:2}), c.runtest({c:3})]);
    expect(c.getStats().ops).toBe(3);
  });
  it("returns service name", async () => {
    const c = new Evalharness();
    const r = await c.runtest();
    expect(r.service).toBe("evalharness");
  });
  it("handles 100 ops", async () => {
    const c = new Evalharness();
    for (let i = 0; i < 100; i++) await c.runtest({i});
    expect(c.getStats().ops).toBe(100);
  });
});
