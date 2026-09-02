import { readKnowledge } from "./read.js";
import { searchKnowledge } from "./search.js";
import { knowledgeStatus } from "./status.js";
import {
  putMemory,
  searchMemory,
  listMemory,
  deleteMemory,
  validateMemoryText,
} from "./memory.js";

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

const VERIFY_KEY = `verify-smoke-${Date.now().toString(36)}`;

const status = await knowledgeStatus();
if (!status.ready) {
  throw new Error(status.error || "knowledge base not ready");
}

const report = { status, cases: [], memory: {} };
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
    relatedMemories: (result.relatedMemories || []).length,
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

// --- project memory (v1.5) ---
const preferReject = validateMemoryText("我喜欢用 TypeScript");
const secretReject = validateMemoryText("api_key=sk-abcdefghijklmnopqrstuvwxyz");
const putOk = putMemory({
  text: "verify smoke: staging probe port placeholder",
  key: VERIFY_KEY,
  tags: ["ops", "verify"],
  ttlDays: 1,
  source: "verify",
});
const found = searchMemory({ query: VERIFY_KEY, limit: 5 });
const listed = listMemory({ limit: 20 });
const deleted = deleteMemory({ key: VERIFY_KEY });

report.memory = {
  rejectPreference: !preferReject.ok,
  rejectSecret: !secretReject.ok,
  putOk: Boolean(putOk.ok),
  searchHit: (found.facts || []).some((f) => f.key === VERIFY_KEY),
  listHasKey: (listed.facts || []).some((f) => f.key === VERIFY_KEY) || deleted.ok,
  deleted: Boolean(deleted.ok),
  remainingAfterDelete: !(listMemory({ limit: 200 }).facts || []).some(
    (f) => f.key === VERIFY_KEY,
  ),
};

const memoryChecks = [
  report.memory.rejectPreference,
  report.memory.rejectSecret,
  report.memory.putOk,
  report.memory.searchHit,
  report.memory.deleted,
  report.memory.remainingAfterDelete,
];
if (memoryChecks.some((ok) => !ok)) {
  failed += 1;
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failed > 0) {
  process.exitCode = 1;
}
