import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { execute as executeNode } from "./executor-node.mjs";
import { parse as parseNode, parseBytes as parseNodeBytes } from "./parser-node.mjs";
import { unclosedObjectSchemas, validateSchema } from "./json-schema.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specRoot = path.join(packageRoot, "spec");
const prdPath = path.join(packageRoot, "docs/prd/Aether-PRD-v0.3.md");
const pythonExecutor = path.join(packageRoot, "tools/executor-python.py");
const pythonParser = path.join(packageRoot, "tools/parser-python.py");
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
  if (!Array.isArray(rule.tests)) fail(`${rule.id}: tests must be an array`);
  if (rule.tests?.length === 0 && !(typeof rule.evidence_gap === "string" && rule.evidence_gap.length > 0)) {
    fail(`${rule.id}: no linked tests or explicit evidence gap`);
  }
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

const sourceCorpus = readJson(path.join(specRoot, "conformance/source/cases.json"));
const reservedLayerMap = new Map(Object.entries(sourceCorpus?.reserved_layers ?? {}));
const reservedTokens = new Set(reservedLayerMap.keys());
const generatedLayerCases = [...reservedTokens].flatMap((token) =>
  (sourceCorpus?.layer_positions ?? []).map((template, position) => ({
    id: `layer.generated.${token}.${position}`,
    source: template.replace("$TOKEN", token),
    code: "LAYER-FEATURE-DISABLED",
    token,
  })));
const sourceCases = [
  ...(sourceCorpus?.accept ?? []),
  ...(sourceCorpus?.reject ?? []),
  ...generatedLayerCases,
  ...(sourceCorpus?.equivalent ?? []).flatMap((group) =>
    group.sources.map((source, index) => ({ id: `${group.id}.${index}`, source }))),
];
requireUnique(sourceCases.map((entry) => entry.id), "source conformance ID");

function parseWithPython(testCase) {
  const python = spawnSync(pythonCommand, [pythonParser], {
    input: testCase.source,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (python.status !== 0) {
    fail(`${testCase.id}: Python parser failed: ${python.stderr.trim()}`);
    return null;
  }
  try {
    return JSON.parse(python.stdout);
  } catch (error) {
    fail(`${testCase.id}: Python parser returned invalid JSON: ${error.message}`);
    return null;
  }
}

let sourceParserAgreement = 0;
for (const testCase of sourceCases) {
  const nodeResult = parseNode(testCase.source);
  const pythonResult = parseWithPython(testCase);
  if (!pythonResult) continue;
  if (stableJson(nodeResult) !== stableJson(pythonResult)) {
    fail(`${testCase.id}: independent parser disagreement`);
    continue;
  }
  sourceParserAgreement += 1;
}

for (const testCase of sourceCorpus?.accept ?? []) {
  const result = parseNode(testCase.source);
  if (result.status !== "accepted") fail(`${testCase.id}: expected source acceptance, got ${result.code}`);
}

for (const testCase of sourceCorpus?.reject ?? []) {
  const result = parseNode(testCase.source);
  if (result.status !== "rejected") {
    fail(`${testCase.id}: expected source rejection`);
    continue;
  }
  if (result.code !== testCase.code) fail(`${testCase.id}: expected ${testCase.code}, got ${result.code}`);
  if (testCase.token && result.token !== testCase.token) {
    fail(`${testCase.id}: expected token ${testCase.token}, got ${result.token ?? "none"}`);
  }
  if (testCase.span && stableJson(result.span) !== stableJson(testCase.span)) {
    fail(`${testCase.id}: expected byte span ${stableJson(testCase.span)}, got ${stableJson(result.span)}`);
  }
}

let rawSourceParserAgreement = 0;
for (const testCase of sourceCorpus?.raw_reject ?? []) {
  const bytes = Buffer.from(testCase.hex, "hex");
  if (bytes.toString("hex") !== testCase.hex) {
    fail(`${testCase.id}: invalid canonical hex fixture`);
    continue;
  }
  const nodeResult = parseNodeBytes(bytes);
  const python = spawnSync(pythonCommand, [pythonParser], {
    input: bytes,
    encoding: "buffer",
    maxBuffer: 1024 * 1024,
  });
  let pythonResult;
  try {
    pythonResult = JSON.parse(python.stdout.toString("utf8"));
  } catch (error) {
    fail(`${testCase.id}: Python raw parser failed: ${python.stderr.toString("utf8").trim() || error.message}`);
    continue;
  }
  if (stableJson(nodeResult) !== stableJson(pythonResult)) fail(`${testCase.id}: raw parser disagreement`);
  else rawSourceParserAgreement += 1;
  if (nodeResult.code !== testCase.code) fail(`${testCase.id}: expected ${testCase.code}, got ${nodeResult.code}`);
}

for (const testCase of generatedLayerCases) {
  const result = parseNode(testCase.source);
  if (result.status !== "rejected" || result.code !== testCase.code || result.token !== testCase.token ||
      result.requested_layer !== "K0" || result.available_since !== reservedLayerMap.get(testCase.token)) {
    fail(`${testCase.id}: generated layer mutation escaped lexical rejection`);
  }
}

for (const group of sourceCorpus?.equivalent ?? []) {
  const results = group.sources.map((source) => parseNode(source));
  if (results.some((result) => result.status !== "accepted")) {
    fail(`${group.id}: equivalent source was rejected`);
    continue;
  }
  const canonicalTrees = new Set(results.map((result) => stableJson(result.tree)));
  if (canonicalTrees.size !== 1) fail(`${group.id}: equivalent sources produced different canonical trees`);
}

const rejectedReservedTokens = new Set((sourceCorpus?.reject ?? [])
  .filter((entry) => entry.code === "LAYER-FEATURE-DISABLED")
  .map((entry) => entry.token));
for (const token of reservedTokens) {
  if (!rejectedReservedTokens.has(token)) fail(`missing reserved-token rejection case: ${token}`);
}

const coreSchema = readJson(path.join(specRoot, "core/syntax/K0.schema.json"));
const asrSchema = readJson(path.join(specRoot, "asr/K0.schema.json"));
for (const [name, schema] of [["Core", coreSchema], ["ASR", asrSchema]]) {
  for (const schemaPath of unclosedObjectSchemas(schema)) {
    fail(`${name} schema has an open object boundary at ${schemaPath}`);
  }
}
for (const vector of vectors) {
  const schemaErrors = validateSchema(coreSchema, vector);
  if (schemaErrors.length > 0) fail(`${vector.id}: Core schema rejected vector: ${schemaErrors[0]}`);
}

const layerCorpus = readJson(path.join(specRoot, "conformance/layer/K0.json"));
let schemaLayerRejections = 0;
for (const [index, value] of (layerCorpus?.asr?.accept ?? []).entries()) {
  const schemaErrors = validateSchema(asrSchema, value);
  if (schemaErrors.length > 0) fail(`layer.asr.accept.${index}: ASR schema rejected K0 value: ${schemaErrors[0]}`);
}
for (const testCase of layerCorpus?.asr?.reject ?? []) {
  if (validateSchema(asrSchema, testCase.value).length === 0) fail(`${testCase.id}: ASR schema accepted later-layer data`);
  else schemaLayerRejections += 1;
}
for (const testCase of layerCorpus?.core?.reject ?? []) {
  if (validateSchema(coreSchema, testCase.value).length === 0) fail(`${testCase.id}: Core schema accepted later-layer data`);
  else schemaLayerRejections += 1;
}
const allowedHost = new Set(layerCorpus?.host?.allowed ?? []);
const forbiddenHost = new Set(layerCorpus?.host?.forbidden ?? []);
const targetHost = new Set(referenceTarget?.host_primitives ?? []);
const targetForbiddenHost = new Set(referenceTarget?.forbidden_host_inputs ?? []);
if (stableJson([...allowedHost].sort()) !== stableJson([...targetHost].sort())) fail("K0 host allowlist differs from target manifest");
if (stableJson([...forbiddenHost].sort()) !== stableJson([...targetForbiddenHost].sort())) fail("K0 forbidden host list differs from target manifest");

const packageSchema = readJson(path.join(specRoot, "manifests/package.schema.json"));
const packageCorpus = readJson(path.join(specRoot, "conformance/package/K0.json"));
function packageErrors(manifest) {
  const errors = validateSchema(packageSchema, manifest);
  if (errors.length > 0) return errors;
  const sourcePaths = Object.values(manifest.modules);
  if (new Set(sourcePaths).size !== sourcePaths.length) errors.push("duplicate normalized module source path");
  const entryParts = manifest.entry.split("::");
  const entryModule = entryParts.slice(0, -1).join(".");
  if (!(entryModule in manifest.modules)) errors.push("entry module is absent from module map");
  return errors;
}
for (const [index, manifest] of (packageCorpus?.accept ?? []).entries()) {
  const errors = packageErrors(manifest);
  if (errors.length > 0) fail(`package.accept.${index}: valid K0 package rejected: ${errors[0]}`);
}
let packageBoundaryRejections = 0;
for (const testCase of packageCorpus?.reject ?? []) {
  if (packageErrors(testCase.value).length === 0) fail(`${testCase.id}: package boundary accepted forbidden input`);
  else packageBoundaryRejections += 1;
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
const proofTool = toolchain?.mechanized_proof_tool;
const leanToolchainPath = path.join(packageRoot, "lean-toolchain");
const leanToolchain = fs.existsSync(leanToolchainPath) ? fs.readFileSync(leanToolchainPath, "utf8").trim() : "";
if (!proofTool || proofTool.name !== "Lean 4" || proofTool.version !== "4.32.2" ||
    proofTool.toolchain !== leanToolchain || proofTool.sorry_allowed !== false) {
  fail("mechanized proof tool lock differs from lean-toolchain or required trust policy");
}
const leanProofFiles = allFiles(path.join(specRoot, "proof/mechanized")).filter((file) => file.endsWith(".lean"));
if (leanProofFiles.length === 0) fail("mechanized proof directory contains no Lean files");
for (const file of leanProofFiles) {
  const proofText = fs.readFileSync(file, "utf8");
  const prohibited = proofText.match(/\b(sorry|admit|axiom)\b/);
  if (prohibited) fail(`${path.relative(packageRoot, file)}: prohibited proof placeholder ${prohibited[1]}`);
}
const theoremLedger = readJson(path.join(specRoot, "proof/logic/K0-theorems.json"));
const requiredTheoremIds = new Set([
  "META-K0-DET", "META-K0-PRES", "META-K0-PROGRESS", "META-K0-INIT",
  "META-K0-MOVE", "META-K0-BORROW", "META-K0-DEALLOC",
  "META-K0-EXPLICIT-ALLOC", "META-K0-EXPLICIT-FAIL",
]);
const theoremEntries = theoremLedger?.theorems ?? [];
const theoremIds = requireUnique(theoremEntries.map((entry) => entry.id), "K0 theorem ID");
for (const id of requiredTheoremIds) {
  if (!theoremIds.has(id)) fail(`missing required K0 theorem: ${id}`);
}
for (const entry of theoremEntries) {
  if (!requiredTheoremIds.has(entry.id)) fail(`unknown K0 theorem ID: ${entry.id}`);
  if (!new Set(["STATEMENT_ONLY", "TESTED_SUBSET", "PROVED_FRAGMENT", "PROVED"]).has(entry.status)) {
    fail(`${entry.id}: invalid theorem status ${entry.status}`);
  }
  if (entry.status === "PROVED_FRAGMENT" || entry.status === "PROVED") {
    if (!(typeof entry.artifact === "string" && fs.existsSync(path.join(specRoot, entry.artifact)))) {
      fail(`${entry.id}: checked theorem artifact is absent`);
    }
    if (!(typeof entry.declaration === "string" && entry.declaration.startsWith("Aether.K0."))) {
      fail(`${entry.id}: checked theorem declaration is absent`);
    }
    const declarationName = entry.declaration.split(".").at(-1);
    const artifactText = fs.readFileSync(path.join(specRoot, entry.artifact), "utf8");
    if (!(new RegExp(`\\btheorem\\s+${declarationName}\\b`).test(artifactText))) {
      fail(`${entry.id}: declaration ${entry.declaration} is not present in its artifact`);
    }
  }
}
const provedFragments = theoremEntries.filter((entry) => entry.status === "PROVED_FRAGMENT").length;
const provedTheorems = theoremEntries.filter((entry) => entry.status === "PROVED").length;

if (problems.length > 0) {
  process.stderr.write("Aether v0.4 structural validation FAILED\n");
  for (const problem of problems) process.stderr.write(`- ${problem}\n`);
  process.exit(1);
}

const lockFiles = [
  "package.json",
  "lakefile.lean",
  "lake-manifest.json",
  "lean-toolchain",
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
const requiredRules = rules.filter((rule) => k0Required.includes(rule.id));
const stableRules = requiredRules.filter((rule) => rule.status === "STABLE");
const evidenceBearingRules = requiredRules.filter((rule) => rule.tests.length > 0);
const evidenceGapRules = requiredRules.filter((rule) => rule.tests.length === 0);
const openMarkers = allFiles(specRoot)
  .filter((file) => file.endsWith(".md") || file.endsWith(".json"))
  .reduce((count, file) => count + (fs.readFileSync(file, "utf8").match(/\bOPEN\b/g)?.length ?? 0), 0);
const tcRequirementsPresent = [
  ...Array.from({ length: 8 }, (_, index) => `EXEC-${String(index + 1).padStart(3, "0")}`),
  ...Array.from({ length: 8 }, (_, index) => `TC-${String(index + 1).padStart(3, "0")}`),
].every((id) => prdRuleIds.has(id));

const checks = [
  { id: "G0-01", status: "PASS", requirement: "content-addressed spec.lock", evidence: `sha256:${lock.root_hash}` },
  { id: "G0-02", status: "FAIL", requirement: "complete K0 Core grammar and static/dynamic semantics", evidence: `${sourceParserAgreement}/${sourceCases.length} source cases agree across two parsers; name resolution, lowering, and full expression/control-flow semantics remain incomplete` },
  { id: "G0-03", status: "FAIL", requirement: "complete object/resource state machines", evidence: "move, borrow, allocation, deallocation, and leak subset executes; fields, arrays, calls, joins, and numeric states remain OPEN" },
  { id: "G0-04", status: missingK0Rules.length === 0 && evidenceGapRules.length === 0 && stableRules.length === k0Required.length ? "PASS" : "FAIL", requirement: "every frozen K0 Rule ID linked to conformance evidence", evidence: `${requiredRules.length}/${k0Required.length} K0/MEM rules indexed; ${evidenceBearingRules.length} evidence-bearing; ${evidenceGapRules.length} explicit gaps; ${stableRules.length} marked STABLE` },
  { id: "G0-05", status: executorAgreement === vectors.length ? "PASS" : "FAIL", requirement: "two independent Core executors agree", evidence: `${executorAgreement}/${vectors.length} vectors agree byte-for-structure` },
  { id: "G0-06", status: provedTheorems >= 9 ? "PASS" : "FAIL", requirement: "mechanized metatheory repository", evidence: `Lean 4 v4.32.2 and independent replay are locked; ${provedFragments} theorem fragments are encoded but ${provedTheorems}/9 required full K0 theorems are PROVED` },
  { id: "G0-07", status: "PASS", requirement: "host toolchain and initial TCB recorded", evidence: "Node/Python hosts and Lean proof tool are pinned; no npm, Python, or Lean package dependency" },
  { id: "G0-08", status: "FAIL", requirement: "K1/K2 unreachable from K0 stable entry", evidence: `${generatedLayerCases.length}/${generatedLayerCases.length} lexical mutations, ${packageBoundaryRejections}/${packageCorpus?.reject?.length ?? 0} package probes, and ${schemaLayerRejections}/${(layerCorpus?.asr?.reject?.length ?? 0) + (layerCorpus?.core?.reject?.length ?? 0)} ASR/Core smuggling probes reject; resolved-ASR reachability proof remains incomplete` },
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
    indexed_k0_rules: requiredRules.length,
    required_k0_and_memory_rules: k0Required.length,
    missing_k0_and_memory_rules: missingK0Rules.length,
    evidence_bearing_k0_and_memory_rules: evidenceBearingRules.length,
    evidence_gap_k0_and_memory_rules: evidenceGapRules.length,
    conformance_vectors: vectors.length,
    independent_executor_agreements: executorAgreement,
    source_cases: sourceCases.length,
    independent_parser_agreements: sourceParserAgreement,
    raw_source_cases: sourceCorpus?.raw_reject?.length ?? 0,
    raw_source_parser_agreements: rawSourceParserAgreement,
    reserved_layer_tokens_rejected: rejectedReservedTokens.size,
    generated_layer_mutations_rejected: generatedLayerCases.length,
    schema_layer_smuggling_probes_rejected: schemaLayerRejections,
    package_boundary_probes_rejected: packageBoundaryRejections,
    explicit_open_markers: openMarkers,
    mechanized_theorem_fragments: provedFragments,
    mechanized_theorems_proved: provedTheorems,
  },
  checks,
  blockers: checks.filter((check) => check.status !== "PASS").map((check) => check.id),
  missing_rule_ids: missingK0Rules,
  evidence_gap_rule_ids: evidenceGapRules.map((rule) => rule.id),
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
  `- Indexed K0/MEM rules: ${requiredRules.length}/${k0Required.length}\n` +
  `- Evidence-bearing K0/MEM rules: ${evidenceBearingRules.length}/${k0Required.length}\n` +
  `- Explicit K0/MEM evidence gaps: ${evidenceGapRules.length}\n` +
  `- Conformance vectors: ${vectors.length}\n` +
  `- Independent executor agreements: ${executorAgreement}/${vectors.length}\n` +
  `- Independent parser agreements: ${sourceParserAgreement}/${sourceCases.length}\n` +
  `- Raw-byte parser agreements: ${rawSourceParserAgreement}/${sourceCorpus?.raw_reject?.length ?? 0}\n` +
  `- Reserved layer tokens rejected: ${rejectedReservedTokens.size}/${reservedTokens.size}\n` +
  `- Generated layer mutations rejected: ${generatedLayerCases.length}/${generatedLayerCases.length}\n` +
  `- ASR/Core smuggling probes rejected: ${schemaLayerRejections}/${(layerCorpus?.asr?.reject?.length ?? 0) + (layerCorpus?.core?.reject?.length ?? 0)}\n` +
  `- Package boundary probes rejected: ${packageBoundaryRejections}/${packageCorpus?.reject?.length ?? 0}\n` +
  `- Mechanized theorem fragments: ${provedFragments}\n` +
  `- Mechanized theorems proved: ${provedTheorems}/9\n` +
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
process.stdout.write(`- Indexed rules: ${rules.length}\n`);
process.stdout.write(`- K0/MEM traceability: ${requiredRules.length}/${k0Required.length} indexed, ${evidenceBearingRules.length} evidence-bearing\n`);
process.stdout.write(`- Conformance vectors: ${vectors.length}\n`);
process.stdout.write(`- Independent executor agreements: ${executorAgreement}/${vectors.length}\n`);
process.stdout.write(`- Independent parser agreements: ${sourceParserAgreement}/${sourceCases.length}\n`);
process.stdout.write(`- Raw-byte parser agreements: ${rawSourceParserAgreement}/${sourceCorpus?.raw_reject?.length ?? 0}\n`);
process.stdout.write(`- Layer boundary probes: ${generatedLayerCases.length + schemaLayerRejections + packageBoundaryRejections}/${generatedLayerCases.length + schemaLayerRejections + packageBoundaryRejections}\n`);
process.stdout.write(`- Mechanized proof fragments: ${provedFragments}\n`);
process.stdout.write(`- spec.lock root: sha256:${lock.root_hash}\n`);
process.stdout.write(`- G0 status: ${g0Status}\n`);
