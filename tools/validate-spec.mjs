import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { execute as executeNode } from "./executor-node.mjs";
import { parse as parseNode, parseBytes as parseNodeBytes } from "./parser-node.mjs";
import { resolvePackage as resolveNodePackage } from "./resolver-node.mjs";
import { unclosedObjectSchemas, validateSchema } from "./json-schema.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specRoot = path.join(packageRoot, "spec");
const prdPath = path.join(packageRoot, "docs/prd/Aether-PRD-v0.3.md");
const pythonExecutor = path.join(packageRoot, "tools/executor-python.py");
const pythonParser = path.join(packageRoot, "tools/parser-python.py");
const pythonResolver = path.join(packageRoot, "tools/resolver-python.py");
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
    if (entry.name === "__pycache__" || entry.name.endsWith(".pyc")) continue;
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

function shortIdentity(prefix, domain, ...parts) {
  return `${prefix}:${sha256([domain, ...parts.map(String)].join("\0")).slice(0, 16)}`;
}

function pointerComponent(component) {
  return String(component).replaceAll("~", "~0").replaceAll("/", "~1");
}

function objectPaths(value, path = [], output = []) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => objectPaths(child, [...path, index], output));
    return output;
  }
  if (!value || typeof value !== "object") return output;
  output.push(path);
  for (const key of Object.keys(value).sort((left, right) => left < right ? -1 : left > right ? 1 : 0)) {
    objectPaths(value[key], [...path, key], output);
  }
  return output;
}

function valueAtPath(root, path) {
  let value = root;
  for (const component of path) {
    if (value === null || value === undefined || !Object.hasOwn(value, component)) return undefined;
    value = value[component];
  }
  return value;
}

function pathFromPointer(pointer) {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return null;
  return pointer.slice(1).split("/").map((component) => {
    const decoded = component.replaceAll("~1", "/").replaceAll("~0", "~");
    return /^(0|[1-9][0-9]*)$/.test(decoded) ? Number(decoded) : decoded;
  });
}

function utf8Boundaries(source) {
  const boundaries = new Set([0]);
  let offset = 0;
  for (const scalar of source) {
    offset += Buffer.byteLength(scalar, "utf8");
    boundaries.add(offset);
  }
  return boundaries;
}

function auditSyntaxSourceMap(result, source) {
  if (result.status !== "accepted") return [];
  const errors = [];
  const sourceMap = result.source_map;
  const bytes = Buffer.from(source, "utf8");
  if (!sourceMap || sourceMap.schema !== "aether.syntax-source-map/k0-0.4") {
    return ["accepted syntax tree has no K0 syntax source map"];
  }
  if (sourceMap.source_sha256 !== `sha256:${sha256(bytes)}`) errors.push("syntax source hash mismatch");
  if (sourceMap.byte_length !== bytes.length) errors.push("syntax source byte length mismatch");
  const expectedPaths = objectPaths(result.tree);
  const actualPaths = sourceMap.entries.map((entry) => entry.path);
  if (stableJson(actualPaths) !== stableJson(expectedPaths)) {
    errors.push("syntax source map does not cover object preorder exactly");
  }
  const boundaries = utf8Boundaries(source);
  const seen = new Set();
  for (const entry of sourceMap.entries) {
    const key = stableJson(entry.path);
    if (seen.has(key)) errors.push(`${key}: duplicate syntax source path`);
    seen.add(key);
    if (!Array.isArray(entry.path) || valueAtPath(result.tree, entry.path) === undefined) {
      errors.push(`${key}: dangling syntax source path`);
    }
    if (!Number.isInteger(entry.start) || !Number.isInteger(entry.end) ||
        entry.start < 0 || entry.start > entry.end || entry.end > bytes.length) {
      errors.push(`${key}: invalid syntax byte range`);
      continue;
    }
    if (!boundaries.has(entry.start) || !boundaries.has(entry.end)) {
      errors.push(`${key}: syntax range splits a UTF-8 scalar`);
    }
    if (entry.origin === "source" && entry.start === entry.end) {
      errors.push(`${key}: source-origin syntax range is empty`);
    } else if (entry.origin === "synthetic" && entry.start !== entry.end) {
      errors.push(`${key}: synthetic syntax range is not empty`);
    } else if (!new Set(["source", "synthetic"]).has(entry.origin)) {
      errors.push(`${key}: unknown syntax origin`);
    }
  }
  return [...new Set(errors)];
}

function auditResolvedAsr(asr, target) {
  const errors = [];
  const symbols = new Map();
  const locals = new Map();
  const lifetimes = new Map();
  const contracts = new Map();
  const contractNames = new Set();
  const localOrdinals = new Map();

  function addIdentity(table, identity, expectedId, label) {
    if (identity.id !== expectedId) errors.push(`${label} ${identity.id}: identity hash mismatch`);
    if (table.has(identity.id)) errors.push(`${label} ${identity.id}: duplicate identity definition`);
    table.set(identity.id, identity);
  }

  function collect(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (typeof value.id === "string" && value.id.startsWith("sym:") &&
        typeof value.package === "string" && typeof value.module === "string" &&
        typeof value.namespace === "string" && typeof value.name === "string" && typeof value.kind === "string") {
      addIdentity(
        symbols,
        value,
        shortIdentity("sym", "aether-k0-symbol", value.package, value.module, value.namespace, value.name, value.kind),
        "symbol",
      );
    } else if (typeof value.id === "string" && value.id.startsWith("local:") &&
               typeof value.function === "string" && typeof value.kind === "string" &&
               Number.isInteger(value.ordinal) && typeof value.name === "string") {
      addIdentity(
        locals,
        value,
        shortIdentity("local", "aether-k0-local", value.function, value.kind, value.ordinal, value.name),
        "local",
      );
      const ordinals = localOrdinals.get(value.function) ?? [];
      ordinals.push(value.ordinal);
      localOrdinals.set(value.function, ordinals);
    } else if (typeof value.id === "string" && value.id.startsWith("life:") &&
               typeof value.function === "string" && typeof value.label === "string") {
      addIdentity(
        lifetimes,
        value,
        shortIdentity("life", "aether-k0-lifetime", value.function, value.label),
        "lifetime",
      );
    } else if (typeof value.id === "string" && value.id.startsWith("contract:") &&
               typeof value.package === "string" && typeof value.module === "string" &&
               typeof value.owner === "string" && typeof value.kind === "string" && typeof value.name === "string") {
      addIdentity(
        contracts,
        value,
        shortIdentity("contract", "aether-k0-contract", value.package, value.module, value.owner, value.kind, value.name),
        "contract",
      );
      if (contractNames.has(value.name)) errors.push(`contract ${value.name}: duplicate package identity`);
      contractNames.add(value.name);
    }
    for (const child of Object.values(value)) collect(child);
  }

  const modulePaths = (asr.modules ?? []).map((module) => module.path);
  const sortedModulePaths = [...modulePaths].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (stableJson(modulePaths) !== stableJson(sortedModulePaths)) errors.push("modules are not in ASCII path order");
  collect(asr);

  const entry = symbols.get(asr.entry);
  if (!entry) errors.push(`${asr.entry}: unresolved package entry`);
  else if (entry.kind !== "function" || entry.namespace !== "value") {
    errors.push(`${asr.entry}: package entry is not a function value`);
  }

  for (const module of asr.modules ?? []) {
    for (const item of module.items ?? []) {
      if (item.identity.package !== asr.package_id || item.identity.module !== module.path ||
          item.identity.kind !== item.kind ||
          item.identity.namespace !== (["struct", "enum"].includes(item.kind) ? "type" : "value")) {
        errors.push(`${module.path}:${item.identity.name}: item identity tuple mismatch`);
      }
      for (const variant of item.variants ?? []) {
        if (variant.identity.package !== asr.package_id || variant.identity.module !== module.path ||
            variant.identity.namespace !== "value" || variant.identity.kind !== "enum_variant") {
          errors.push(`${module.path}:${variant.identity.name}: variant identity tuple mismatch`);
        }
      }
    }
  }

  for (const [functionId, ordinals] of localOrdinals) {
    const ordered = [...ordinals].sort((left, right) => left - right);
    if (ordered.some((ordinal, index) => ordinal !== index)) {
      errors.push(`${functionId}: local ordinals are not a contiguous preorder`);
    }
  }

  const allowedBrands = new Set((target.allocators ?? []).map((entry) => entry.brand));
  const allowedPrimitives = new Set((target.host_primitives ?? []).map((entry) => `primitive:${entry}`));
  function check(value) {
    if (typeof value === "string") {
      if (value.startsWith("sym:") && !symbols.has(value)) errors.push(`${value}: unresolved symbol identity`);
      if (value.startsWith("local:") && !locals.has(value)) errors.push(`${value}: unresolved local identity`);
      if (value.startsWith("life:") && !lifetimes.has(value)) errors.push(`${value}: unresolved lifetime identity`);
      if (value.startsWith("contract:") && !contracts.has(value)) errors.push(`${value}: unresolved contract identity`);
      if (value.startsWith("brand:") && !allowedBrands.has(value)) errors.push(`${value}: brand is absent from target`);
      if (value.startsWith("primitive:") && !allowedPrimitives.has(value)) errors.push(`${value}: primitive is absent from target`);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(check);
      return;
    }
    if (value.kind === "nominal" && symbols.get(value.symbol)?.namespace !== "type") {
      errors.push(`${value.symbol}: nominal type does not reference the type namespace`);
    }
    if (value.kind === "symbol_ref") {
      const identity = symbols.get(value.symbol);
      if (identity?.namespace !== "value" || identity?.kind !== value.target_kind) {
        errors.push(`${value.symbol}: value reference kind mismatch`);
      }
    }
    if (value.kind === "record" && Object.hasOwn(value, "constructor")) {
      const identity = symbols.get(value.constructor);
      if (!identity || !["struct", "enum_variant"].includes(identity.kind)) {
        errors.push(`${value.constructor}: invalid record constructor`);
      }
    }
    if (["path_pattern", "variant_tuple_pattern", "variant_record_pattern"].includes(value.kind) &&
        symbols.get(value.constructor)?.kind !== "enum_variant") {
      errors.push(`${value.constructor}: pattern constructor is not an enum variant`);
    }
    if (value.identity?.id?.startsWith("contract:") && value.kind !== value.identity.kind) {
      errors.push(`${value.identity.id}: contract kind differs from identity`);
    }
    if (value.expression_hash && value.expression) {
      const expected = `sha256:${sha256(["aether-k0-contract-expression", stableJson(value.expression)].join("\0"))}`;
      if (value.expression_hash !== expected) errors.push(`${value.identity?.id ?? "contract"}: expression hash mismatch`);
    }
    for (const child of Object.values(value)) check(child);
  }
  check(asr);
  return [...new Set(errors)];
}

function pointerFromPath(path) {
  return path.length === 0 ? "" : `/${path.map(pointerComponent).join("/")}`;
}

function requiresResolvedSource(path, value) {
  if (path.length === 0) return false;
  if (typeof value.id === "string") return false;
  const last = path.at(-1);
  if (last === "target" && new Set(["symbol", "local", "result", "field"]).has(value.kind)) {
    return false;
  }
  return true;
}

function auditResolvedSourceMap(asr, sourceMap, inputSources) {
  const errors = [];
  if (sourceMap.package_id !== asr.package_id) errors.push("source-map package differs from ASR");
  if (sourceMap.asr_schema !== asr.schema) errors.push("source-map ASR schema differs from ASR");
  const expectedAsrHash = `sha256:${sha256(["aether-k0-resolved-asr", stableJson(asr)].join("\0"))}`;
  if (sourceMap.asr_hash !== expectedAsrHash) errors.push("source-map semantic ASR hash mismatch");

  const expectedSourcePaths = Object.keys(inputSources).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const actualSourcePaths = (sourceMap.sources ?? []).map((source) => source.path);
  if (stableJson(actualSourcePaths) !== stableJson(expectedSourcePaths)) {
    errors.push("source inventory is not the exact ASCII-sorted package source set");
  }
  const sourceRecords = new Map();
  const boundarySets = new Map();
  for (const source of sourceMap.sources ?? []) {
    if (sourceRecords.has(source.path)) errors.push(`${source.path}: duplicate source inventory entry`);
    sourceRecords.set(source.path, source);
    const input = inputSources[source.path];
    if (input === undefined) continue;
    const bytes = Buffer.from(input, "utf8");
    if (source.sha256 !== `sha256:${sha256(bytes)}`) errors.push(`${source.path}: source hash mismatch`);
    if (source.byte_length !== bytes.length) errors.push(`${source.path}: source byte length mismatch`);
    boundarySets.set(source.path, utf8Boundaries(input));
  }

  const expectedPointers = objectPaths(asr)
    .filter((path) => requiresResolvedSource(path, valueAtPath(asr, path)))
    .map(pointerFromPath);
  const actualPointers = (sourceMap.entries ?? []).map((entry) => entry.pointer);
  if (stableJson(actualPointers) !== stableJson(expectedPointers)) {
    errors.push("resolved source map does not cover ASR object preorder exactly");
  }

  const entriesByPointer = new Map();
  for (const entry of sourceMap.entries ?? []) {
    if (entriesByPointer.has(entry.pointer)) errors.push(`${entry.pointer}: duplicate source-map pointer`);
    entriesByPointer.set(entry.pointer, entry);
    const path = pathFromPointer(entry.pointer);
    const value = path === null ? undefined : valueAtPath(asr, path);
    if (path === null || !value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${entry.pointer}: source-map pointer does not name an ASR object`);
      continue;
    }
    const source = sourceRecords.get(entry.source);
    if (!source) {
      errors.push(`${entry.pointer}: source is absent from inventory`);
      continue;
    }
    if (!Number.isInteger(entry.start) || !Number.isInteger(entry.end) ||
        entry.start < 0 || entry.start > entry.end || entry.end > source.byte_length) {
      errors.push(`${entry.pointer}: invalid source byte range`);
      continue;
    }
    const boundaries = boundarySets.get(entry.source);
    if (!boundaries?.has(entry.start) || !boundaries?.has(entry.end)) {
      errors.push(`${entry.pointer}: source range splits a UTF-8 scalar`);
    }
    if (entry.origin === "source" && entry.start === entry.end) {
      errors.push(`${entry.pointer}: source-origin range is empty`);
    } else if (entry.origin === "synthetic" && entry.start !== entry.end) {
      errors.push(`${entry.pointer}: synthetic range is not empty`);
    }
    if (path[0] === "modules" && Number.isInteger(path[1])) {
      const moduleSource = asr.modules?.[path[1]]?.source;
      if (entry.source !== moduleSource) errors.push(`${entry.pointer}: range belongs to the wrong module source`);
    }
  }

  for (const entry of sourceMap.entries ?? []) {
    const path = pathFromPointer(entry.pointer);
    if (!path) continue;
    for (let length = path.length - 1; length > 0; length -= 1) {
      const ancestor = entriesByPointer.get(pointerFromPath(path.slice(0, length)));
      if (!ancestor) continue;
      if (ancestor.source !== entry.source || ancestor.start > entry.start || ancestor.end < entry.end) {
        errors.push(`${entry.pointer}: range escapes its nearest mapped ancestor`);
      }
      break;
    }
  }
  return [...new Set(errors)];
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
const resolutionCorpus = readJson(path.join(specRoot, "conformance/resolution/K0.json"));
const resolutionLinkedIds = new Set(Object.values(resolutionCorpus?.rule_links ?? {}).flat());
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
    if (vector) {
      if (!vector.rules.includes(rule.id)) fail(`${rule.id}: test ${testId} does not link back to rule`);
      continue;
    }
    if (!resolutionLinkedIds.has(testId)) fail(`${rule.id}: linked test does not exist: ${testId}`);
    else if (!(resolutionCorpus.rule_links[rule.id] ?? []).includes(testId)) {
      fail(`${rule.id}: resolution test ${testId} does not link back to rule`);
    }
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
let syntaxSourceMapAudits = 0;
for (const testCase of sourceCases) {
  const nodeResult = parseNode(testCase.source);
  const pythonResult = parseWithPython(testCase);
  if (!pythonResult) continue;
  if (stableJson(nodeResult) !== stableJson(pythonResult)) {
    fail(`${testCase.id}: independent parser disagreement`);
    continue;
  }
  sourceParserAgreement += 1;
  if (nodeResult.status === "accepted") {
    const sourceMapErrors = auditSyntaxSourceMap(nodeResult, testCase.source);
    if (sourceMapErrors.length > 0) fail(`${testCase.id}: syntax source-map audit failed: ${sourceMapErrors[0]}`);
    else syntaxSourceMapAudits += 1;
    for (const expected of testCase.expect_source_map ?? []) {
      const actual = nodeResult.source_map?.entries?.find((entry) => stableJson(entry.path) === stableJson(expected.path));
      if (!actual) {
        fail(`${testCase.id}: expected syntax source-map path ${stableJson(expected.path)} is absent`);
        continue;
      }
      for (const [field, value] of Object.entries(expected)) {
        if (stableJson(actual[field]) !== stableJson(value)) {
          fail(`${testCase.id}: syntax source-map ${stableJson(expected.path)} expected ${field}=${stableJson(value)}`);
        }
      }
    }
  }
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
const asrSourceMapSchema = readJson(path.join(specRoot, "asr/K0.source-map.schema.json"));
for (const [name, schema] of [["Core", coreSchema], ["ASR", asrSchema], ["ASR source map", asrSourceMapSchema]]) {
  for (const schemaPath of unclosedObjectSchemas(schema)) {
    fail(`${name} schema has an open object boundary at ${schemaPath}`);
  }
}
for (const vector of vectors) {
  const schemaErrors = validateSchema(coreSchema, vector);
  if (schemaErrors.length > 0) fail(`${vector.id}: Core schema rejected vector: ${schemaErrors[0]}`);
}

const layerCorpus = readJson(path.join(specRoot, "conformance/layer/K0.json"));
const schemaLayerProbeCount =
  (layerCorpus?.asr?.reject?.length ?? 0) +
  (layerCorpus?.source_map?.reject?.length ?? 0) +
  (layerCorpus?.core?.reject?.length ?? 0);
let schemaLayerRejections = 0;
const layerAsrFixture = layerCorpus?.asr?.fixture;
const layerAsrFixtureErrors = validateSchema(asrSchema, layerAsrFixture);
if (layerAsrFixtureErrors.length > 0) fail(`layer.asr.fixture: ASR schema rejected K0 value: ${layerAsrFixtureErrors[0]}`);
function applyMutation(fixture, mutation) {
  const value = structuredClone(fixture);
  let target = value;
  for (const component of mutation.path.slice(0, -1)) target = target[component];
  target[mutation.path.at(-1)] = mutation.value;
  return value;
}
for (const testCase of layerCorpus?.asr?.reject ?? []) {
  const value = applyMutation(layerAsrFixture, testCase.mutation);
  if (validateSchema(asrSchema, value).length === 0) fail(`${testCase.id}: ASR schema accepted later-layer data`);
  else schemaLayerRejections += 1;
}
const layerSourceMapFixture = layerCorpus?.source_map?.fixture;
const layerSourceMapFixtureErrors = validateSchema(asrSourceMapSchema, layerSourceMapFixture);
if (layerSourceMapFixtureErrors.length > 0) {
  fail(`layer.source-map.fixture: source-map schema rejected K0 value: ${layerSourceMapFixtureErrors[0]}`);
}
for (const testCase of layerCorpus?.source_map?.reject ?? []) {
  const value = applyMutation(layerSourceMapFixture, testCase.mutation);
  if (validateSchema(asrSourceMapSchema, value).length === 0) {
    fail(`${testCase.id}: source-map schema accepted later-layer data`);
  } else {
    schemaLayerRejections += 1;
  }
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

const resolutionCases = [
  ...(resolutionCorpus?.accept ?? []),
  ...(resolutionCorpus?.reject ?? []),
  ...(resolutionCorpus?.equivalent ?? []).flatMap((group) =>
    group.inputs.map((input, index) => ({ ...input, id: `${group.id}.${index}` }))),
];
requireUnique(resolutionCases.map((entry) => entry.id), "resolution conformance ID");
requireUnique((resolutionCorpus?.asr_mutations ?? []).map((entry) => entry.id), "resolved ASR mutation ID");
requireUnique((resolutionCorpus?.source_map_mutations ?? []).map((entry) => entry.id), "resolved source-map mutation ID");
const resolutionIds = new Set(resolutionCases.map((entry) => entry.id));
for (const group of resolutionCorpus?.equivalent ?? []) {
  if (!new Set(["equal", "different"]).has(group.source_map_relation)) {
    fail(`${group.id}: missing source-map equivalence relation`);
  }
}
for (const [ruleId, testIds] of Object.entries(resolutionCorpus?.rule_links ?? {})) {
  if (!indexedRuleIds.has(ruleId)) fail(`resolution rule link references unindexed rule: ${ruleId}`);
  for (const testId of testIds) {
    if (!resolutionIds.has(testId)) fail(`${ruleId}: resolution link references absent test ${testId}`);
    const rule = rules.find((entry) => entry.id === ruleId);
    if (!rule?.tests.includes(testId)) fail(`${ruleId}: resolution test ${testId} is not indexed by the rule`);
  }
}

function resolutionInput(testCase) {
  return {
    manifest: {
      schema: "aether.package/k0-0.4",
      language_version: "0.4.0-draft",
      package_id: testCase.package_id,
      target: "k0-reference-64",
      modules: testCase.modules,
      entry: testCase.entry,
    },
    target: referenceTarget,
    sources: testCase.sources,
  };
}

function resolveWithPython(testCase) {
  const python = spawnSync(pythonCommand, [pythonResolver], {
    input: JSON.stringify(resolutionInput(testCase)),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (python.status !== 0) {
    fail(`${testCase.id}: Python resolver failed: ${python.stderr.trim()}`);
    return null;
  }
  try {
    return JSON.parse(python.stdout);
  } catch (error) {
    fail(`${testCase.id}: Python resolver returned invalid JSON: ${error.message}`);
    return null;
  }
}

let resolutionAgreement = 0;
let resolvedAsrValidated = 0;
let resolvedAsrIdentityAudits = 0;
let resolvedSourceMapsValidated = 0;
let resolvedSourceMapAudits = 0;
for (const testCase of resolutionCases) {
  const input = resolutionInput(testCase);
  if (!testCase.expect) {
    const manifestProblems = packageErrors(input.manifest);
    if (manifestProblems.length > 0) fail(`${testCase.id}: resolution fixture has invalid package manifest: ${manifestProblems[0]}`);
  }
  const nodeResult = resolveNodePackage(input);
  const pythonResult = resolveWithPython(testCase);
  if (!pythonResult) continue;
  if (stableJson(nodeResult) !== stableJson(pythonResult)) {
    fail(`${testCase.id}: independent resolver disagreement`);
    continue;
  }
  resolutionAgreement += 1;
  if (testCase.expect) {
    if (!errorCodes.has(testCase.expect.code)) fail(`${testCase.id}: unknown resolution error code ${testCase.expect.code}`);
    if (nodeResult.status !== "rejected" || nodeResult.phase !== "resolve") {
      fail(`${testCase.id}: expected resolution rejection`);
      continue;
    }
    for (const field of ["code", "module", "subject"]) {
      if (nodeResult[field] !== testCase.expect[field]) {
        fail(`${testCase.id}: expected ${field}=${testCase.expect[field]}, got ${nodeResult[field] ?? "missing"}`);
      }
    }
  } else {
    if (nodeResult.status !== "accepted") {
      fail(`${testCase.id}: expected resolution acceptance, got ${nodeResult.code}`);
      continue;
    }
    const schemaErrors = validateSchema(asrSchema, nodeResult.asr);
    if (schemaErrors.length > 0) fail(`${testCase.id}: resolved ASR failed closed schema: ${schemaErrors[0]}`);
    else {
      resolvedAsrValidated += 1;
      const auditErrors = auditResolvedAsr(nodeResult.asr, referenceTarget);
      if (auditErrors.length > 0) fail(`${testCase.id}: resolved ASR identity audit failed: ${auditErrors[0]}`);
      else resolvedAsrIdentityAudits += 1;
    }
    const sourceMapSchemaErrors = validateSchema(asrSourceMapSchema, nodeResult.source_map);
    if (sourceMapSchemaErrors.length > 0) {
      fail(`${testCase.id}: resolved source map failed closed schema: ${sourceMapSchemaErrors[0]}`);
    } else {
      resolvedSourceMapsValidated += 1;
      const sourceMapAuditErrors = auditResolvedSourceMap(nodeResult.asr, nodeResult.source_map, input.sources);
      if (sourceMapAuditErrors.length > 0) {
        fail(`${testCase.id}: resolved source-map audit failed: ${sourceMapAuditErrors[0]}`);
      } else {
        resolvedSourceMapAudits += 1;
      }
    }
    for (const expected of testCase.expect_source_map ?? []) {
      const actual = nodeResult.source_map?.entries?.find((entry) => entry.pointer === expected.pointer);
      if (!actual) {
        fail(`${testCase.id}: expected source-map pointer ${expected.pointer} is absent`);
        continue;
      }
      for (const [field, value] of Object.entries(expected)) {
        if (actual[field] !== value) fail(`${testCase.id}: source-map ${expected.pointer} expected ${field}=${value}`);
      }
    }
  }
}

let resolutionEquivalence = 0;
for (const group of resolutionCorpus?.equivalent ?? []) {
  const outputs = group.inputs.map((input) => resolveNodePackage(resolutionInput(input)));
  if (outputs.some((output) => output.status !== "accepted")) {
    fail(`${group.id}: equivalent resolution input was rejected`);
    continue;
  }
  if (new Set(outputs.map((output) => stableJson(output.asr))).size !== 1) {
    fail(`${group.id}: equivalent package inputs produced different resolved ASR`);
    continue;
  }
  const sourceMapCount = new Set(outputs.map((output) => stableJson(output.source_map))).size;
  if (group.source_map_relation === "equal" && sourceMapCount !== 1) {
    fail(`${group.id}: source maps differ despite provenance-equivalent inputs`);
    continue;
  }
  if (group.source_map_relation === "different" && sourceMapCount === 1) {
    fail(`${group.id}: source maps hide distinct source provenance`);
    continue;
  }
  resolutionEquivalence += 1;
}

let resolvedAsrMutationRejections = 0;
const resolutionAcceptById = new Map((resolutionCorpus?.accept ?? []).map((entry) => [entry.id, entry]));
for (const mutation of resolutionCorpus?.asr_mutations ?? []) {
  const fixture = resolutionAcceptById.get(mutation.base);
  if (!fixture) {
    fail(`${mutation.id}: resolution ASR mutation has no base fixture ${mutation.base}`);
    continue;
  }
  const resolved = resolveNodePackage(resolutionInput(fixture));
  if (resolved.status !== "accepted") {
    fail(`${mutation.id}: base fixture did not resolve`);
    continue;
  }
  const mutatedAsr = applyMutation(resolved.asr, mutation);
  const schemaErrors = validateSchema(asrSchema, mutatedAsr);
  if (schemaErrors.length > 0) {
    fail(`${mutation.id}: identity mutation was not structurally valid: ${schemaErrors[0]}`);
    continue;
  }
  if (auditResolvedAsr(mutatedAsr, referenceTarget).length === 0) {
    fail(`${mutation.id}: resolved ASR identity audit accepted semantic tampering`);
    continue;
  }
  resolvedAsrMutationRejections += 1;
}

let resolvedSourceMapMutationRejections = 0;
for (const mutation of resolutionCorpus?.source_map_mutations ?? []) {
  const fixture = resolutionAcceptById.get(mutation.base);
  if (!fixture) {
    fail(`${mutation.id}: source-map mutation has no base fixture ${mutation.base}`);
    continue;
  }
  const input = resolutionInput(fixture);
  const resolved = resolveNodePackage(input);
  if (resolved.status !== "accepted") {
    fail(`${mutation.id}: base fixture did not resolve`);
    continue;
  }
  const mutatedSourceMap = applyMutation(resolved.source_map, mutation);
  const schemaErrors = validateSchema(asrSourceMapSchema, mutatedSourceMap);
  if (schemaErrors.length > 0) {
    fail(`${mutation.id}: source-map mutation was not structurally valid: ${schemaErrors[0]}`);
    continue;
  }
  if (auditResolvedSourceMap(resolved.asr, mutatedSourceMap, input.sources).length === 0) {
    fail(`${mutation.id}: source-map audit accepted semantic tampering`);
    continue;
  }
  resolvedSourceMapMutationRejections += 1;
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
if (!proofTool || proofTool.name !== "Lean 4" || proofTool.version !== "4.24.0" ||
    proofTool.toolchain !== leanToolchain || proofTool.sorry_allowed !== false) {
  fail("mechanized proof tool lock differs from lean-toolchain or required trust policy");
}
const rustBuildTool = proofTool?.rust_build_tool;
if (!rustBuildTool || rustBuildTool.rustc_version !== "1.85.0" ||
    rustBuildTool.rustc_source_commit !== "4d91de4e48198da2e33413efdcd9cd2cc0c46688" ||
    rustBuildTool.cargo_version !== "1.85.0" ||
    rustBuildTool.cargo_source_commit !== "d73d2caf9e41a39daf2a8d6ce60ec80bf354d2a7" ||
    rustBuildTool.build_flag !== "--locked") {
  fail("Nanoda Rust build tool differs from the trust policy");
}
const requiredCheckerCommits = new Map([
  ["lean4checker", "da26eb05e9959402afcb9bd6dfe5dc4f700f70d6"],
  ["lean4export-format2024", "eb023e55e0852a9bf9b569ecefc42d54338b0c8f"],
  ["nanoda", "e5438ac0a85a036b6dfe093aa457bc3448498014"],
]);
const checkerEntries = proofTool?.independent_checkers ?? [];
if (checkerEntries.length !== requiredCheckerCommits.size) {
  fail("mechanized proof checker lock has missing or additional entries");
}
const checkerScripts = ["tools/check-lean4checker.sh", "tools/check-nanoda.sh"]
  .map((file) => fs.readFileSync(path.join(packageRoot, file), "utf8"))
  .join("\n");
for (const [name, sourceCommit] of requiredCheckerCommits) {
  const checker = checkerEntries.find((entry) => entry.name === name);
  if (!checker || checker.source_commit !== sourceCommit) {
    fail(`${name}: independent checker commit differs from the trust policy`);
  }
  if (!checkerScripts.includes(sourceCommit)) {
    fail(`${name}: locked commit is not used by an independent replay script`);
  }
}
if (!checkerScripts.includes('rust_toolchain="1.85.0"') || !checkerScripts.includes("--locked")) {
  fail("Nanoda replay script does not use the locked Rust build policy");
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
  { id: "G0-02", status: "FAIL", requirement: "complete K0 Core grammar and static/dynamic semantics", evidence: `${sourceParserAgreement}/${sourceCases.length} source cases parse, ${resolutionAgreement}/${resolutionCases.length} package cases resolve, and ${resolvedSourceMapAudits}/${resolvedSourceMapsValidated} resolved source maps audit across independent implementations; field-identity elaboration, lowering, and full expression/control-flow semantics remain incomplete` },
  { id: "G0-03", status: "FAIL", requirement: "complete object/resource state machines", evidence: "move, borrow, allocation, deallocation, and leak subset executes; fields, arrays, calls, joins, and numeric states remain OPEN" },
  { id: "G0-04", status: missingK0Rules.length === 0 && evidenceGapRules.length === 0 && stableRules.length === k0Required.length ? "PASS" : "FAIL", requirement: "every frozen K0 Rule ID linked to conformance evidence", evidence: `${requiredRules.length}/${k0Required.length} K0/MEM rules indexed; ${evidenceBearingRules.length} evidence-bearing; ${evidenceGapRules.length} explicit gaps; ${stableRules.length} marked STABLE` },
  { id: "G0-05", status: executorAgreement === vectors.length ? "PASS" : "FAIL", requirement: "two independent Core executors agree", evidence: `${executorAgreement}/${vectors.length} vectors agree byte-for-structure` },
  { id: "G0-06", status: provedTheorems >= 9 ? "PASS" : "FAIL", requirement: "mechanized metatheory repository", evidence: `Lean 4 v4.24.0 and pinned independent replay are locked; ${provedFragments} theorem fragments are encoded but ${provedTheorems}/9 required full K0 theorems are PROVED` },
  { id: "G0-07", status: "PASS", requirement: "host toolchain and initial TCB recorded", evidence: "Node/Python hosts and Lean proof tool are pinned; no npm, Python, or Lean package dependency" },
  { id: "G0-08", status: "FAIL", requirement: "K1/K2 unreachable from K0 stable entry", evidence: `${generatedLayerCases.length}/${generatedLayerCases.length} lexical mutations, ${packageBoundaryRejections}/${packageCorpus?.reject?.length ?? 0} package probes, ${schemaLayerRejections}/${schemaLayerProbeCount} structural smuggling probes, ${resolvedAsrMutationRejections}/${resolutionCorpus?.asr_mutations?.length ?? 0} identity mutations, and ${resolvedSourceMapMutationRejections}/${resolutionCorpus?.source_map_mutations?.length ?? 0} source-map mutations reject; field-elaboration/lowering reachability remains incomplete` },
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
    syntax_source_map_audits: syntaxSourceMapAudits,
    raw_source_cases: sourceCorpus?.raw_reject?.length ?? 0,
    raw_source_parser_agreements: rawSourceParserAgreement,
    resolution_cases: resolutionCases.length,
    independent_resolver_agreements: resolutionAgreement,
    resolved_asr_schema_validations: resolvedAsrValidated,
    resolved_asr_identity_audits: resolvedAsrIdentityAudits,
    resolved_asr_identity_mutations_rejected: resolvedAsrMutationRejections,
    resolved_source_map_schema_validations: resolvedSourceMapsValidated,
    resolved_source_map_audits: resolvedSourceMapAudits,
    resolved_source_map_mutations_rejected: resolvedSourceMapMutationRejections,
    resolution_equivalence_groups: resolutionEquivalence,
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
  `- Syntax source-map audits: ${syntaxSourceMapAudits}\n` +
  `- Raw-byte parser agreements: ${rawSourceParserAgreement}/${sourceCorpus?.raw_reject?.length ?? 0}\n` +
  `- Independent resolver agreements: ${resolutionAgreement}/${resolutionCases.length}\n` +
  `- Resolved ASR schema validations: ${resolvedAsrValidated}\n` +
  `- Resolved ASR identity-closure audits: ${resolvedAsrIdentityAudits}\n` +
  `- Resolved ASR identity mutations rejected: ${resolvedAsrMutationRejections}/${resolutionCorpus?.asr_mutations?.length ?? 0}\n` +
  `- Resolved source-map schema validations: ${resolvedSourceMapsValidated}\n` +
  `- Resolved source-map audits: ${resolvedSourceMapAudits}\n` +
  `- Resolved source-map mutations rejected: ${resolvedSourceMapMutationRejections}/${resolutionCorpus?.source_map_mutations?.length ?? 0}\n` +
  `- Resolution equivalence groups: ${resolutionEquivalence}/${resolutionCorpus?.equivalent?.length ?? 0}\n` +
  `- Reserved layer tokens rejected: ${rejectedReservedTokens.size}/${reservedTokens.size}\n` +
  `- Generated layer mutations rejected: ${generatedLayerCases.length}/${generatedLayerCases.length}\n` +
  `- ASR/source-map/Core smuggling probes rejected: ${schemaLayerRejections}/${schemaLayerProbeCount}\n` +
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
process.stdout.write(`- Syntax source-map audits: ${syntaxSourceMapAudits}\n`);
process.stdout.write(`- Raw-byte parser agreements: ${rawSourceParserAgreement}/${sourceCorpus?.raw_reject?.length ?? 0}\n`);
process.stdout.write(`- Independent resolver agreements: ${resolutionAgreement}/${resolutionCases.length}\n`);
process.stdout.write(`- Resolved ASR schema validations: ${resolvedAsrValidated}\n`);
process.stdout.write(`- Resolved ASR identity-closure audits: ${resolvedAsrIdentityAudits}\n`);
process.stdout.write(`- Resolved ASR identity mutations rejected: ${resolvedAsrMutationRejections}/${resolutionCorpus?.asr_mutations?.length ?? 0}\n`);
process.stdout.write(`- Resolved source-map audits: ${resolvedSourceMapAudits}/${resolvedSourceMapsValidated}\n`);
process.stdout.write(`- Resolved source-map mutations rejected: ${resolvedSourceMapMutationRejections}/${resolutionCorpus?.source_map_mutations?.length ?? 0}\n`);
process.stdout.write(`- Layer boundary probes: ${generatedLayerCases.length + schemaLayerRejections + packageBoundaryRejections}/${generatedLayerCases.length + schemaLayerRejections + packageBoundaryRejections}\n`);
process.stdout.write(`- Mechanized proof fragments: ${provedFragments}\n`);
process.stdout.write(`- spec.lock root: sha256:${lock.root_hash}\n`);
process.stdout.write(`- G0 status: ${g0Status}\n`);
