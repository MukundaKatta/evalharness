// evalharness — EvalRunner core
export class EvalRunner {
  private ops = 0;
  private log: Array<Record<string,unknown>> = [];
  constructor(private config: Record<string,unknown> = {}) {}
  async runtest(opts: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    this.ops++;
    const s = Date.now();
    const r = { op: "run_test", processed: true, n: this.ops, keys: Object.keys(opts) };
    this.log.push({ op: "run_test", ms: Date.now()-s, t: Date.now() });
    return r;
  }
  async assertcontains(opts: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    this.ops++;
    const s = Date.now();
    const r = { op: "assert_contains", processed: true, n: this.ops, keys: Object.keys(opts) };
    this.log.push({ op: "assert_contains", ms: Date.now()-s, t: Date.now() });
    return r;
  }
  async assertsemantic(opts: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    this.ops++;
    const s = Date.now();
    const r = { op: "assert_semantic", processed: true, n: this.ops, keys: Object.keys(opts) };
    this.log.push({ op: "assert_semantic", ms: Date.now()-s, t: Date.now() });
    return r;
  }
  async redteam(opts: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    this.ops++;
    const s = Date.now();
    const r = { op: "red_team", processed: true, n: this.ops, keys: Object.keys(opts) };
    this.log.push({ op: "red_team", ms: Date.now()-s, t: Date.now() });
    return r;
  }
  async generatereport(opts: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    this.ops++;
    const s = Date.now();
    const r = { op: "generate_report", processed: true, n: this.ops, keys: Object.keys(opts) };
    this.log.push({ op: "generate_report", ms: Date.now()-s, t: Date.now() });
    return r;
  }
  async comparemodels(opts: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    this.ops++;
    const s = Date.now();
    const r = { op: "compare_models", processed: true, n: this.ops, keys: Object.keys(opts) };
    this.log.push({ op: "compare_models", ms: Date.now()-s, t: Date.now() });
    return r;
  }
  getStats() { return { ops: this.ops, logSize: this.log.length }; }
  reset() { this.ops = 0; this.log = []; }
}
