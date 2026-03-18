import { describe, it, expect } from "vitest";
import { EvalRunner } from "../src/core.js";
describe("EvalRunner", () => {
  it("init", () => { expect(new EvalRunner().getStats().ops).toBe(0); });
  it("op", async () => { const c = new EvalRunner(); await c.runtest(); expect(c.getStats().ops).toBe(1); });
  it("reset", async () => { const c = new EvalRunner(); await c.runtest(); c.reset(); expect(c.getStats().ops).toBe(0); });
});
