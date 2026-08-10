import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { execute as executeNode } from "./executor-node.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specRoot = path.join(packageRoot, "spec");
const prdPath = path.join(packageRoot, "docs/prd/Aether-PRD-v0.3.md");
const pythonExecutor = path.join(packageRoot, "tools/executor-python.py");
const pythonCommand = process.env.AETHER_PYTHON || "python3";
const problems = [];

function fail(message) {
  problems.push(message);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${path.relative(packageRoot, file)}: invalid JSON: ${error.message}`);
    return null;
  }
}

function allFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...allFiles(absolute));
    else files.push(absolute);
  }
  return files;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function versionAtLeast(actual, minimum) {
  if (actual.length !== minimum.length || actual.some(Number.isNaN) || minimum.some(Number.isNaN)) return false;
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] > minimum[index]) return true;
    if (actual[index] < minimum[index]) return false;
  }
  return true;
}

function requireUnique(items, label) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item)) fail(`duplicate ${label}: ${item}`);
    seen.add(item);
  }
  return seen;
}

if (!fs.existsSync(prdPath)) fail(`missing parent PRD: ${prdPath}`);

const jsonFiles = allFiles(specRoot).filter((file) => file.endsWith(".json") && !file.endsWith("spec.lock.json"));
for (const file of jsonFiles) readJson(file);

for (const file of allFiles(specRoot).filter((candidate) => candidate.endsWith(".md"))) {
  const fenceCount = fs.readFileSync(file, "utf8").split("\n").filter((line) => line.startsWith("```")).length;
  if (fenceCount % 2 !== 0) fail(`${path.relative(packageRoot, file)}: unclosed code fence`);
}

const vocabulary = readJson(path.join(specRoot, "vocabulary/terms.json"));
if (vocabulary) {
  if (!Array.isArray(vocabulary.terms) || vocabulary.terms.length === 0) fail("vocabulary has no terms");
  else requireUnique(vocabulary.terms.map((entry) => entry.term), "vocabulary term");
}

const catalog = readJson(path.join(specRoot, "core/errors/catalog.json"));
const errorCodes = catalog?.errors ? requireUnique(catalog.errors.map((entry) => entry.code), "error code") : new Set();

const prdText = fs.existsSync(prdPath) ? fs.readFileSync(prdPath, "utf8") : "";
const prdRuleIds = new Set([...prdText.matchAll(/^\*\*([A-Z][A-Z0-9-]*-[0-9]{3})\*\*/gm)].map((match) => match[1]));
if (prdRuleIds.size === 0) fail("parent PRD contains no machine-recognizable Rule IDs");

const ruleIndex = readJson(path.join(specRoot, "rules/K0.json"));
const rules = ruleIndex?.rules ?? [];
const indexedRuleIds = requireUnique(rules.map((rule) => rule.id), "indexed Rule ID");
for (const rule of rules) {
  if (!prdRuleIds.has(rule.id)) fail(`indexed rule absent from parent PRD: ${rule.id}`);
  if (!fs.existsSync(path.resolve(specRoot, rule.source))) fail(`${rule.id}: missing source ${rule.source}`);
  if (!Array.isArray(rule.tests) || rule.tests.length === 0) fail(`${rule.id}: no linked tests`);
  if (!new Set(["DRAFT", "EXPERIMENTAL", "PROVISIONAL", "STABLE"]).has(rule.status)) {
    fail(`${rule.id}: invalid status ${rule.status}`);
  }
}

const vectorFiles = [
  path.join(specRoot, "conformance/accept/core.json"),
  path.join(specRoot, "conformance/reject/core.json"),
  path.join(specRoot, "conformance/observe/core.json"),
];
const vectors = vectorFiles.flatMap((file) => readJson(file) ?? []);
const vectorIds = requireUnique(vectors.map((vector) => vector.id), "conformance vector ID");
const vectorsById = new Map(vectors.map((vector) => [vector.id, vector]));
const referenceTarget = readJson(path.join(specRoot, "targets/k0-reference-64.json"));
const targetAllocators = new Map((referenceTarget?.allocators ?? []).map((allocator) => [allocator.name, allocator]));

for (const vector of vectors) {
  if (vector.schema !== "aether.core-transition/k0-0.4") fail(`${vector.id}: wrong schema`);
  if (vector.target !== "k0-reference-64") fail(`${vector.id}: unsupported target`);
  if (!Array.isArray(vector.steps) || !Array.isArray(vector.rules)) fail(`${vector.id}: malformed steps or rules`);
  if (!vector.expect || !["ok", "rejected"].includes(vector.expect.status)) fail(`${vector.id}: malformed expectation`);
  for (const ruleId of vector.rules ?? []) {
    if (!indexedRuleIds.has(ruleId)) fail(`${vector.id}: rule is not in K0 index: ${ruleId}`);
  }
  for (const [name, allocator] of Object.entries(vector.initial?.allocators ?? {})) {
    const targetAllocator = targetAllocators.get(name);
    if (!targetAllocator) fail(`${vector.id}: allocator ${name} is absent from target`);
    else {
      if (allocator.brand !== targetAllocator.brand) fail(`${vector.id}: allocator ${name} has the wrong target brand`);
      if (!Number.isInteger(allocator.capacity) || allocator.capacity < 0 || allocator.capacity > targetAllocator.capacity_max) {
        fail(`${vector.id}: allocator ${name} capacity is outside target range`);
      }
    }
  }
  if (vector.expect?.code && !errorCodes.has(vector.expect.code)) fail(`${vector.id}: unknown expected code ${vector.expect.code}`);
}

for (const rule of rules) {
  for (const testId of rule.tests) {
    const vector = vectorsById.get(testId);
    if (!vector) fail(`${rule.id}: linked test does not exist: ${testId}`);
    else if (!vector.rules.includes(rule.id)) fail(`${rule.id}: test ${testId} does not link back to rule`);
  }
}

for (const decisionFile of allFiles(path.join(specRoot, "decisions")).filter((file) => file.endsWith(".json"))) {
  const decision = readJson(decisionFile);
  for (const ruleId of decision?.rules ?? []) {
    if (!prdRuleIds.has(ruleId)) fail(`${decision.id}: unknown PRD rule ${ruleId}`);
  }
}

let executorAgreement = 0;
for (const vector of vectors) {
  const nodeResult = executeNode(vector);
  const python = spawnSync(pythonCommand, [pythonExecutor], {
    input: JSON.stringify(vector),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (python.status !== 0) {
    fail(`${vector.id}: Python executor failed: ${python.stderr.trim()}`);
    continue;
  }
  let pythonResult;
  try {
    pythonResult = JSON.parse(python.stdout);
  } catch (error) {
    fail(`${vector.id}: Python executor returned invalid JSON: ${error.message}`);
    continue;
  }
  if (stableJson(nodeResult) !== stableJson(pythonResult)) {
    fail(`${vector.id}: independent executor disagreement`);
    continue;
  }
  executorAgreement += 1;
  if (nodeResult.status !== vector.expect.status) {
    fail(`${vector.id}: expected status ${vector.expect.status}, got ${nodeResult.status}`);
  }
  if (vector.expect.code && nodeResult.code !== vector.expect.code) {
    fail(`${vector.id}: expected code ${vector.expect.code}, got ${nodeResult.code}`);
  }
  if (vector.expect.events && stableJson(nodeResult.events) !== stableJson(vector.expect.events)) {
    fail(`${vector.id}: observable events differ from the specification oracle`);
  }
}

const toolchain = readJson(path.join(specRoot, "manifests/toolchain.json"));
const nodeEntry = toolchain?.tools?.find((tool) => tool.command === "node");
if (!nodeEntry || nodeEntry.version !== process.versions.node) {
  fail(`toolchain Node version mismatch: lock=${nodeEntry?.version ?? "missing"}, actual=${process.versions.node}`);
}
const pythonVersion = spawnSync(pythonCommand, ["--version"], { encoding: "utf8" });
const actualPython = `${pythonVersion.stdout}${pythonVersion.stderr}`.trim().replace(/^Python\s+/, "");
const pythonEntry = toolchain?.tools?.find((tool) => tool.command === "python3");
const actualPythonParts = actualPython.split(".").map((part) => Number.parseInt(part, 10));
const minimumPythonParts = (pythonEntry?.minimum_version ?? "").split(".").map((part) => Number.parseInt(part, 10));
const pythonFamily = actualPythonParts.slice(0, 2).join(".");
const pythonAtLeastMinimum = versionAtLeast(actualPythonParts, minimumPythonParts);
if (!pythonEntry || pythonEntry.version_family !== pythonFamily || !pythonAtLeastMinimum) {
  fail(`toolchain Python version mismatch: family=${pythonEntry?.version_family ?? "missing"}, minimum=${pythonEntry?.minimum_version ?? "missing"}, actual=${actualPython}`);
}

if (problems.length > 0) {
  process.stderr.write("Aether v0.4 structural validation FAILED\n");
  for (const problem of problems) process.stderr.write(`- ${problem}\n`);
  process.exit(1);
}

const lockFiles = [
  "package.json",
  "docs/prd/Aether-PRD-v0.3.md",
  ...allFiles(specRoot)
    .map((file) => path.relative(packageRoot, file))
    .filter((relative) => relative !== "spec/manifests/spec.lock.json"),
  ...allFiles(path.join(packageRoot, "tools")).map((file) => path.relative(packageRoot, file)),
].sort();
const entries = lockFiles.map((relative) => {
  const content = fs.readFileSync(path.join(packageRoot, relative));
  return { path: relative, bytes: content.length, sha256: sha256(content) };
});
const lock = {
  schema: "aether.spec-lock/0.4",
  language_version: "0.4.0-draft",
  edition: "draft-0",
  core_layer: "K0",
  status: "DRAFT",
  parent_prd: {
    path: "docs/prd/Aether-PRD-v0.3.md",
    sha256: sha256(fs.readFileSync(prdPath)),
  },
  generated_by: "tools/validate-spec.mjs",
  entries,
  root_hash: sha256(stableJson(entries)),
};
const lockPath = path.join(specRoot, "manifests/spec.lock.json");
fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

const k0Required = [...prdRuleIds].filter((id) => id.startsWith("K0-") || id.startsWith("MEM-")).sort();
const missingK0Rules = k0Required.filter((id) => !indexedRuleIds.has(id));
const stableRules = rules.filter((rule) => rule.status === "STABLE");
const openMarkers = allFiles(specRoot)
  .filter((file) => file.endsWith(".md") || file.endsWith(".json"))
  .reduce((count, file) => count + (fs.readFileSync(file, "utf8").match(/\bOPEN\b/g)?.length ?? 0), 0);
const tcRequirementsPresent = [
  ...Array.from({ length: 8 }, (_, index) => `EXEC-${String(index + 1).padStart(3, "0")}`),
  ...Array.from({ length: 8 }, (_, index) => `TC-${String(index + 1).padStart(3, "0")}`),
].every((id) => prdRuleIds.has(id));

const checks = [
  { id: "G0-01", status: "PASS", requirement: "content-addressed spec.lock", evidence: `sha256:${lock.root_hash}` },
  { id: "G0-02", status: "FAIL", requirement: "complete K0 Core grammar and static/dynamic semantics", evidence: "transition subset exists; full expression/control-flow model remains OPEN" },
  { id: "G0-03", status: "FAIL", requirement: "complete object/resource state machines", evidence: "move, borrow, allocation, deallocation, and leak subset executes; fields, arrays, calls, joins, and numeric states remain OPEN" },
  { id: "G0-04", status: stableRules.length > 0 && missingK0Rules.length === 0 ? "PASS" : "FAIL", requirement: "every frozen K0 Rule ID linked to conformance evidence", evidence: `${rules.length}/${k0Required.length} K0/MEM rules indexed; ${stableRules.length} marked STABLE` },
  { id: "G0-05", status: executorAgreement === vectors.length ? "PASS" : "FAIL", requirement: "two independent Core executors agree", evidence: `${executorAgreement}/${vectors.length} vectors agree byte-for-structure` },
  { id: "G0-06", status: "FAIL", requirement: "mechanized metatheory repository", evidence: "theorem ledger exists; no theorem is PROVED and no proof tool is locked" },
  { id: "G0-07", status: "PASS", requirement: "host toolchain and initial TCB recorded", evidence: "Node and Python versions validated; no external package or network dependency" },
  { id: "G0-08", status: "FAIL", requirement: "K1/K2 unreachable from K0 stable entry", evidence: "later tokens are reserved, but no complete source parser or ASR reachability proof exists" },
  { id: "G0-09", status: tcRequirementsPresent ? "PASS" : "FAIL", requirement: "K1 computation-universality requirements frozen without expanding K0", evidence: tcRequirementsPresent ? "EXEC-001..008 and TC-001..008 exist in parent PRD" : "required TC rules missing" },
  { id: "G0-10", status: "PASS", requirement: "offline-readable review and OPEN inventory", evidence: `${openMarkers} explicit OPEN markers; report and lock are local files` },
];
const g0Status = checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL";
const report = {
  schema: "aether.g0-report/0.4",
  status: g0Status,
  spec_lock_hash: `sha256:${lock.root_hash}`,
  metrics: {
    parent_prd_rules: prdRuleIds.size,
    indexed_k0_rules: rules.length,
    required_k0_and_memory_rules: k0Required.length,
    missing_k0_and_memory_rules: missingK0Rules.length,
    conformance_vectors: vectors.length,
    independent_executor_agreements: executorAgreement,
    explicit_open_markers: openMarkers,
    mechanized_theorems_proved: 0,
  },
  checks,
  blockers: checks.filter((check) => check.status !== "PASS").map((check) => check.id),
  missing_rule_ids: missingK0Rules,
  authorization: g0Status === "PASS"
    ? "Formal K0 implementation may begin; no later layer is authorized."
    : "Only specification engineering and disposable semantic probes are authorized.",
};
fs.writeFileSync(path.join(packageRoot, "reports/G0.json"), `${JSON.stringify(report, null, 2)}\n`);

const markdown = `# Aether K0 G0 Report\n\n` +
  `Overall status: **${g0Status}**  \n` +
  `Spec lock: \`${report.spec_lock_hash}\`  \n` +
  `Authorization: ${report.authorization}\n\n` +
  `## Checks\n\n` +
  `| ID | Status | Requirement | Evidence |\n|---|---|---|---|\n` +
  checks.map((check) => `| ${check.id} | **${check.status}** | ${check.requirement} | ${check.evidence} |`).join("\n") +
  `\n\n## Metrics\n\n` +
  `- Parent PRD Rule IDs: ${prdRuleIds.size}\n` +
  `- Indexed K0/MEM rules: ${rules.length}/${k0Required.length}\n` +
  `- Conformance vectors: ${vectors.length}\n` +
  `- Independent executor agreements: ${executorAgreement}/${vectors.length}\n` +
  `- Mechanized theorems proved: 0\n` +
  `- Explicit OPEN markers: ${openMarkers}\n\n` +
  `## Decision\n\n` +
  `G0 does not pass. The package is executable and internally cross-checked, but it is not a complete language semantics or mechanized soundness argument. The next work must close G0-02, G0-03, G0-04, G0-06, and G0-08 without adding K1/K2 features.\n`;
fs.writeFileSync(path.join(packageRoot, "reports/G0.md"), markdown);

const parsedLock = readJson(lockPath);
if (!parsedLock || parsedLock.root_hash !== lock.root_hash) {
  process.stderr.write("Generated spec.lock failed self-check\n");
  process.exit(1);
}

process.stdout.write(`Aether v0.4 structural validation PASS\n`);
process.stdout.write(`- Rule IDs in parent PRD: ${prdRuleIds.size}\n`);
process.stdout.write(`- Indexed executable rules: ${rules.length}\n`);
process.stdout.write(`- Conformance vectors: ${vectors.length}\n`);
process.stdout.write(`- Independent executor agreements: ${executorAgreement}/${vectors.length}\n`);
process.stdout.write(`- spec.lock root: sha256:${lock.root_hash}\n`);
process.stdout.write(`- G0 status: ${g0Status}\n`);
