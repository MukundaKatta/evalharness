/**
 * HTML report generator: test results table, pass/fail chart data, red team scores.
 */

import type { SuiteResult, TestResult } from "./runner";
import type { VulnerabilityReport } from "./redteam/scanner";

export interface ReportOptions {
  title?: string;
  includePrompts?: boolean;
  includeResponses?: boolean;
  maxResponseLength?: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function statusBadge(passed: boolean): string {
  const color = passed ? "#22c55e" : "#ef4444";
  const label = passed ? "PASS" : "FAIL";
  return `<span style="background:${color};color:white;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold">${label}</span>`;
}

function percentBar(value: number, color: string): string {
  const pct = Math.round(value * 100);
  return `<div style="background:#e5e7eb;border-radius:4px;overflow:hidden;height:20px;width:200px;display:inline-block">
    <div style="background:${color};height:100%;width:${pct}%"></div>
  </div> <span>${pct}%</span>`;
}

export class ReportGenerator {
  private options: Required<ReportOptions>;

  constructor(options: ReportOptions = {}) {
    this.options = {
      title: options.title ?? "Eval Harness Report",
      includePrompts: options.includePrompts ?? false,
      includeResponses: options.includeResponses ?? true,
      maxResponseLength: options.maxResponseLength ?? 500,
    };
  }

  generateTestReport(suiteResult: SuiteResult): string {
    const passRate = suiteResult.totalTests > 0
      ? suiteResult.passed / suiteResult.totalTests
      : 0;

    const chartData = this.buildChartData(suiteResult);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(this.options.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f9fafb; color: #111827; }
    h1 { color: #1f2937; } h2 { color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #d1d5db; padding: 10px 14px; text-align: left; }
    th { background: #f3f4f6; font-weight: 600; }
    tr:nth-child(even) { background: #f9fafb; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 20px 0; }
    .summary-card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
    .summary-card .value { font-size: 32px; font-weight: bold; }
    .summary-card .label { color: #6b7280; font-size: 14px; }
    .assertion-list { margin: 0; padding-left: 16px; }
    pre { background: #1f2937; color: #e5e7eb; padding: 12px; border-radius: 6px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>${escapeHtml(this.options.title)}</h1>
  <p>Suite: <strong>${escapeHtml(suiteResult.suiteName)}</strong> |
     Duration: ${suiteResult.durationMs}ms |
     ${suiteResult.startedAt.toISOString()}</p>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="value">${suiteResult.totalTests}</div>
      <div class="label">Total Tests</div>
    </div>
    <div class="summary-card">
      <div class="value" style="color:#22c55e">${suiteResult.passed}</div>
      <div class="label">Passed</div>
    </div>
    <div class="summary-card">
      <div class="value" style="color:#ef4444">${suiteResult.failed}</div>
      <div class="label">Failed</div>
    </div>
    <div class="summary-card">
      <div class="value">${(passRate * 100).toFixed(1)}%</div>
      <div class="label">Pass Rate</div>
    </div>
  </div>

  <h2>Results</h2>
  <table>
    <thead>
      <tr>
        <th>Test</th>
        <th>Provider</th>
        <th>Status</th>
        <th>Assertions</th>
        <th>Latency</th>
        ${this.options.includeResponses ? "<th>Response</th>" : ""}
      </tr>
    </thead>
    <tbody>
      ${suiteResult.results.map((r) => this.renderTestRow(r)).join("\n")}
    </tbody>
  </table>

  <h2>Chart Data (JSON)</h2>
  <pre>${escapeHtml(JSON.stringify(chartData, null, 2))}</pre>
</body>
</html>`;
  }

  generateRedTeamReport(report: VulnerabilityReport): string {
    const s = report.summary;
    const scoreColor = s.resilienceScore >= 0.8 ? "#22c55e" : s.resilienceScore >= 0.5 ? "#f59e0b" : "#ef4444";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Red Team Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f9fafb; color: #111827; }
    h1 { color: #1f2937; } h2 { color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #d1d5db; padding: 10px 14px; text-align: left; }
    th { background: #f3f4f6; font-weight: 600; }
    .score { font-size: 48px; font-weight: bold; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 20px 0; }
    .summary-card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
    .summary-card .value { font-size: 28px; font-weight: bold; }
    .summary-card .label { color: #6b7280; font-size: 14px; }
    .recommendation { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 8px 0; border-radius: 0 6px 6px 0; }
    .vuln { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 8px 0; border-radius: 0 6px 6px 0; }
  </style>
</head>
<body>
  <h1>Red Team Vulnerability Report</h1>
  <p>Generated: ${report.timestamp} | Duration: ${s.scanDurationMs}ms</p>

  <div style="text-align:center;margin:30px 0">
    <div class="score" style="color:${scoreColor}">${(s.resilienceScore * 100).toFixed(0)}%</div>
    <div style="color:#6b7280;font-size:18px">Resilience Score</div>
  </div>

  <div class="summary-grid">
    <div class="summary-card"><div class="value">${s.totalAttacks}</div><div class="label">Total Attacks</div></div>
    <div class="summary-card"><div class="value" style="color:#22c55e">${s.blocked}</div><div class="label">Blocked</div></div>
    <div class="summary-card"><div class="value" style="color:#ef4444">${s.bypassed}</div><div class="label">Bypassed</div></div>
    <div class="summary-card"><div class="value" style="color:#6b7280">${s.errors}</div><div class="label">Errors</div></div>
  </div>

  <h2>By Severity</h2>
  <table>
    <tr><th>Severity</th><th>Total</th><th>Blocked</th><th>Bypassed</th><th>Block Rate</th></tr>
    ${Object.entries(report.bySeverity)
      .map(([sev, d]) => `<tr><td>${escapeHtml(sev)}</td><td>${d.total}</td><td>${d.blocked}</td><td>${d.bypassed}</td><td>${percentBar(d.total > 0 ? d.blocked / d.total : 1, "#22c55e")}</td></tr>`)
      .join("\n")}
  </table>

  <h2>By Category</h2>
  <table>
    <tr><th>Category</th><th>Total</th><th>Blocked</th><th>Bypassed</th><th>Block Rate</th></tr>
    ${Object.entries(report.byCategory)
      .map(([cat, d]) => `<tr><td>${escapeHtml(cat)}</td><td>${d.total}</td><td>${d.blocked}</td><td>${d.bypassed}</td><td>${percentBar(d.total > 0 ? d.blocked / d.total : 1, "#3b82f6")}</td></tr>`)
      .join("\n")}
  </table>

  <h2>Vulnerabilities Found (${report.vulnerabilities.length})</h2>
  ${report.vulnerabilities.length === 0
    ? "<p>No vulnerabilities detected.</p>"
    : report.vulnerabilities.map((v) => `<div class="vuln"><strong>${escapeHtml(v.attackName)}</strong> [${v.severity}] - ${escapeHtml(v.targetAction)}<br><small>Response: ${escapeHtml(v.response.slice(0, 200))}</small></div>`).join("\n")}

  <h2>Recommendations</h2>
  ${report.recommendations.map((r) => `<div class="recommendation">${escapeHtml(r)}</div>`).join("\n")}
</body>
</html>`;
  }

  private renderTestRow(result: TestResult): string {
    const assertionSummary = result.assertions.length > 0
      ? `<ul class="assertion-list">${result.assertions.map((a) => `<li>${statusBadge(a.passed)} ${escapeHtml(a.type)}: ${escapeHtml(a.message)}</li>`).join("")}</ul>`
      : result.error ? `<em style="color:#ef4444">${escapeHtml(result.error)}</em>` : "-";

    const responseCol = this.options.includeResponses
      ? `<td><small>${escapeHtml(result.response.slice(0, this.options.maxResponseLength))}</small></td>`
      : "";

    return `<tr>
      <td><strong>${escapeHtml(result.testName)}</strong><br><small>${escapeHtml(result.testId)}</small></td>
      <td>${escapeHtml(result.provider)}</td>
      <td>${statusBadge(result.passed)}</td>
      <td>${assertionSummary}</td>
      <td>${result.latencyMs}ms</td>
      ${responseCol}
    </tr>`;
  }

  private buildChartData(suiteResult: SuiteResult): Record<string, unknown> {
    const byProvider: Record<string, { passed: number; failed: number }> = {};
    for (const r of suiteResult.results) {
      if (!byProvider[r.provider]) byProvider[r.provider] = { passed: 0, failed: 0 };
      if (r.passed) byProvider[r.provider].passed++;
      else byProvider[r.provider].failed++;
    }

    return {
      passFailOverview: { passed: suiteResult.passed, failed: suiteResult.failed, errors: suiteResult.errors },
      byProvider,
      latencyDistribution: suiteResult.results.map((r) => ({ test: r.testName, provider: r.provider, latencyMs: r.latencyMs })),
    };
  }
}
