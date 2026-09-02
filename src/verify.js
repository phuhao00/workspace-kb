import { readKnowledge } from "./read.js";
import { searchKnowledge } from "./search.js";
import { knowledgeStatus } from "./status.js";

const CASES = [
  {
    query: "payment failure",
    expectAny: [/payment/i, /pay/i, /order/i],
  },
  {
    query: "architecture overview",
    expectAny: [/architecture/i, /overview/i, /README/i],
  },
];

const status = await knowledgeStatus();
if (!status.ready) {
  throw new Error(status.error || "knowledge base not ready");
}

const report = { status, cases: [] };
let failed = 0;

for (const testCase of CASES) {
  const result = await searchKnowledge(testCase.query, { limit: 8 });
  const blob = JSON.stringify(result.results);
  const matched = testCase.expectAny.some((re) => re.test(blob));
  const longSnippet = result.results.find((hit) => (hit.snippet || "").length > 480);
  const row = {
    query: testCase.query,
    matched,
    count: result.count,
    paths: result.results.map((hit) => `${hit.repo} ${hit.path}#${hit.heading}`),
    snippetChars: result.results.map((hit) => (hit.snippet || "").length),
    longSnippet: Boolean(longSnippet),
  };

  if (result.results[0]) {
    const preview = readKnowledge(result.results[0].path, result.results[0].heading);
    row.readChars = (preview.text || "").length;
    row.readDumpsFile = row.readChars > 4500;
  }

  report.cases.push(row);
  if (!matched || longSnippet || row.readDumpsFile) {
    failed += 1;
  }
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failed > 0) {
  process.exitCode = 1;
}
