import crypto from "node:crypto";
import fs from "node:fs";
import { parse } from "./parser-node.mjs";

class ResolveError extends Error {
  constructor(code, module, subject) {
    super(code);
    this.diagnostic = {
      status: "rejected",
      phase: "resolve",
      code,
      module,
      subject,
    };
  }
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

function hash(domain, ...parts) {
  return crypto.createHash("sha256").update([domain, ...parts.map(String)].join("\0"), "utf8").digest("hex");
}

function shortId(prefix, domain, ...parts) {
  return `${prefix}:${hash(domain, ...parts).slice(0, 16)}`;
}

function pathText(path) {
  return path.join("::");
}

function hydrateLocations(tree, sourceMap, source) {
  for (const entry of sourceMap.entries) {
    let node = tree;
    for (const component of entry.path) node = node[component];
    node._span = { source, start: entry.start, end: entry.end, origin: entry.origin };
  }
}

function pointerComponent(component) {
  return String(component).replaceAll("~", "~0").replaceAll("/", "~1");
}

function detachSources(value, path, entries) {
  if (Array.isArray(value)) {
    return value.map((child, index) => detachSources(child, [...path, index], entries));
  }
  if (!value || typeof value !== "object") return value;
  if (value._source) {
    entries.push({
      pointer: path.length === 0 ? "" : `/${path.map(pointerComponent).join("/")}`,
      ...value._source,
    });
  }
  const output = {};
  const keys = Object.keys(value)
    .filter((key) => key !== "_source")
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  for (const key of keys) output[key] = detachSources(value[key], [...path, key], entries);
  return output;
}

function semanticValue(value) {
  if (Array.isArray(value)) return value.map(semanticValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value)
    .filter((key) => key !== "_source")
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    .map((key) => [key, semanticValue(value[key])]));
}

class Resolver {
  constructor(input) {
    this.input = input;
    this.manifest = input.manifest ?? {};
    this.target = input.target ?? {};
    this.sources = input.sources ?? {};
    this.packageId = this.manifest.package_id ?? "<missing-package>";
    this.modules = new Map();
    this.symbolTuples = new Map();
    this.contractIds = new Set();
  }

  error(code, module, subject) {
    throw new ResolveError(code, module, subject);
  }

  withSource(node, value) {
    if (node?._span) value._source = { ...node._span };
    return value;
  }

  symbol(module, namespace, name, kind) {
    const id = shortId("sym", "aether-k0-symbol", this.packageId, module, namespace, name, kind);
    const identity = { id, package: this.packageId, module, namespace, name, kind };
    const tuple = stableJson(identity);
    const prior = this.symbolTuples.get(id);
    if (prior !== undefined && prior !== tuple) this.error("SYMBOL-ID-COLLISION", module, id);
    this.symbolTuples.set(id, tuple);
    return identity;
  }

  contractIdentity(module, owner, kind, id) {
    return {
      id: shortId("contract", "aether-k0-contract", this.packageId, module, owner, kind, id),
      package: this.packageId,
      module,
      owner,
      kind,
      name: id,
    };
  }

  localIdentity(functionSymbol, kind, ordinal, name) {
    return {
      id: shortId("local", "aether-k0-local", functionSymbol, kind, ordinal, name),
      function: functionSymbol,
      kind,
      ordinal,
      name,
    };
  }

  lifetimeIdentity(functionSymbol, label) {
    return {
      id: shortId("life", "aether-k0-lifetime", functionSymbol, label),
      function: functionSymbol,
      label,
    };
  }

  prepareModules() {
    const manifestModules = this.manifest.modules;
    if (!manifestModules || typeof manifestModules !== "object" || Array.isArray(manifestModules)) {
      this.error("RESOLVE-MANIFEST-MALFORMED", "<package>", "modules");
    }
    const entries = Object.entries(manifestModules).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    const declaredSources = new Set(entries.map(([, source]) => source));
    for (const source of Object.keys(this.sources).sort()) {
      if (!declaredSources.has(source)) this.error("RESOLVE-SOURCE-UNDECLARED", "<package>", source);
    }
    for (const [module, source] of entries) {
      if (!(source in this.sources)) this.error("RESOLVE-SOURCE-MISSING", module, source);
      const parsed = parse(this.sources[source]);
      if (parsed.status !== "accepted") throw Object.assign(new Error(parsed.code), { diagnostic: parsed });
      hydrateLocations(parsed.tree, parsed.source_map, source);
      const declaredModule = parsed.tree.module.join(".");
      if (declaredModule !== module) this.error("RESOLVE-MODULE-MISMATCH", module, declaredModule);
      this.modules.set(module, {
        path: module,
        source,
        tree: parsed.tree,
        sourceMap: parsed.source_map,
        types: new Map(),
        values: new Map(),
      });
    }
  }

  duplicate(module, subject) {
    this.error("RESOLVE-DUPLICATE", module, subject);
  }

  collect() {
    for (const moduleInfo of this.modules.values()) {
      for (const item of moduleInfo.tree.items) {
        const namespace = item.kind === "struct" || item.kind === "enum" ? "type" : "value";
        const table = namespace === "type" ? moduleInfo.types : moduleInfo.values;
        if (namespace === "value" && (item.name === "result" || (this.target.host_primitives ?? []).includes(item.name))) {
          this.error("RESOLVE-RESERVED-NAME", moduleInfo.path, item.name);
        }
        if (table.has(item.name)) this.duplicate(moduleInfo.path, `${namespace}:${item.name}`);
        item._identity = this.symbol(moduleInfo.path, namespace, item.name, item.kind);
        item._module = moduleInfo.path;
        table.set(item.name, item);

        if (item.kind === "struct") this.checkFields(moduleInfo.path, item.name, item.fields);
        if (item.kind === "enum") {
          const variants = new Set();
          for (const variant of item.variants) {
            if (variants.has(variant.name)) this.duplicate(moduleInfo.path, `variant:${item.name}::${variant.name}`);
            variants.add(variant.name);
            variant._identity = this.symbol(
              moduleInfo.path,
              "value",
              `${item.name}::${variant.name}`,
              "enum_variant",
            );
            if (variant.payload.kind === "record") {
              this.checkFields(moduleInfo.path, `${item.name}::${variant.name}`, variant.payload.fields);
            }
          }
        }
        if (item.kind === "function") {
          const parameters = new Set();
          for (const parameter of item.params) {
            if (parameters.has(parameter.name)) this.duplicate(moduleInfo.path, `parameter:${item.name}:${parameter.name}`);
            parameters.add(parameter.name);
          }
        }
        for (const contract of item.invariants ?? item.contracts ?? []) {
          this.collectContract(moduleInfo.path, item, contract);
        }
      }
    }
  }

  checkFields(module, owner, fields) {
    const names = new Set();
    for (const field of fields) {
      if (names.has(field.name)) this.duplicate(module, `field:${owner}.${field.name}`);
      names.add(field.name);
    }
  }

  collectContract(module, item, contract) {
    const id = contract.id.join(".");
    if (this.contractIds.has(id)) this.duplicate(module, `contract:${id}`);
    this.contractIds.add(id);
    contract._identity = this.contractIdentity(module, item._identity.id, contract.kind, id);
  }

  visible(candidate, currentModule, subject) {
    if (candidate.item._module !== currentModule && candidate.item.visibility !== "public") {
      this.error("RESOLVE-INACCESSIBLE", currentModule, subject);
    }
    return candidate;
  }

  selectCandidates(candidates, currentModule, subject) {
    const visible = candidates.filter((candidate) =>
      candidate.item._module === currentModule || candidate.item.visibility === "public");
    if (visible.length > 1) this.error("RESOLVE-AMBIGUOUS", currentModule, subject);
    if (visible.length === 1) return visible[0];
    if (candidates.length > 0) this.error("RESOLVE-INACCESSIBLE", currentModule, subject);
    this.error("RESOLVE-NOT-FOUND", currentModule, subject);
  }

  moduleCandidate(path, namespace) {
    if (path.length < 2) return null;
    const module = path.slice(0, -1).join(".");
    const name = path.at(-1);
    const info = this.modules.get(module);
    if (!info) return null;
    const item = (namespace === "type" ? info.types : info.values).get(name);
    return item ? { item, identity: item._identity, targetKind: item.kind } : null;
  }

  variantCandidate(path, currentModule) {
    if (path.length < 2) return null;
    const enumName = path.at(-2);
    const variantName = path.at(-1);
    const module = path.length === 2 ? currentModule : path.slice(0, -2).join(".");
    const info = this.modules.get(module);
    const item = info?.types.get(enumName);
    if (!item || item.kind !== "enum") return null;
    const variant = item.variants.find((entry) => entry.name === variantName);
    return variant ? { item, identity: variant._identity, targetKind: "enum_variant", variant } : null;
  }

  lookupType(path, currentModule) {
    let candidate = null;
    if (path.length === 1) {
      const item = this.modules.get(currentModule)?.types.get(path[0]);
      if (item) candidate = { item, identity: item._identity, targetKind: item.kind };
      else if (this.modules.get(currentModule)?.values.has(path[0])) {
        this.error("RESOLVE-WRONG-KIND", currentModule, pathText(path));
      }
    } else {
      candidate = this.moduleCandidate(path, "type");
    }
    if (!candidate) this.error("RESOLVE-NOT-FOUND", currentModule, pathText(path));
    return this.visible(candidate, currentModule, pathText(path));
  }

  findActive(scopes, name) {
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      if (scopes[index].has(name)) return scopes[index].get(name);
    }
    return null;
  }

  lookupValue(path, currentModule, scopes = []) {
    if (path.length === 1) {
      const local = this.findActive(scopes, path[0]);
      if (local) return { kind: "local", identity: local };
      const item = this.modules.get(currentModule)?.values.get(path[0]);
      if (item) return { kind: "symbol", ...this.visible({ item, identity: item._identity, targetKind: item.kind }, currentModule, path[0]) };
      if ((this.target.host_primitives ?? []).includes(path[0])) {
        return { kind: "primitive", identity: `primitive:${path[0]}`, targetKind: "host_primitive" };
      }
      if (this.modules.get(currentModule)?.types.has(path[0])) {
        this.error("RESOLVE-WRONG-KIND", currentModule, path[0]);
      }
      this.error("RESOLVE-NOT-FOUND", currentModule, path[0]);
    }

    const candidates = [this.moduleCandidate(path, "value"), this.variantCandidate(path, currentModule)].filter(Boolean);
    const candidate = this.selectCandidates(candidates, currentModule, pathText(path));
    return { kind: "symbol", ...candidate };
  }

  lookupConstructor(path, currentModule, requiredPayload = null) {
    const candidates = [];
    const typeCandidate = path.length === 1
      ? (() => {
          const item = this.modules.get(currentModule)?.types.get(path[0]);
          return item ? { item, identity: item._identity, targetKind: item.kind } : null;
        })()
      : this.moduleCandidate(path, "type");
    if (typeCandidate?.item.kind === "struct") candidates.push({ ...typeCandidate, payloadKind: "record" });
    const variant = this.variantCandidate(path, currentModule);
    if (variant) candidates.push({ ...variant, payloadKind: variant.variant.payload.kind });
    if (candidates.length === 0 && typeCandidate) this.error("RESOLVE-WRONG-KIND", currentModule, pathText(path));
    const selected = this.selectCandidates(candidates, currentModule, pathText(path));
    if (requiredPayload && selected.payloadKind !== requiredPayload) {
      this.error("RESOLVE-WRONG-KIND", currentModule, pathText(path));
    }
    return selected;
  }

  resolveBrand(path, module) {
    const brand = `brand:${path.join(".")}`;
    if (!(this.target.allocators ?? []).some((entry) => entry.brand === brand)) {
      this.error("RESOLVE-BRAND-NOT-FOUND", module, pathText(path));
    }
    return brand;
  }

  type(type, context) {
    switch (type.kind) {
      case "primitive": return { kind: "primitive", name: type.name };
      case "path_type": return { kind: "nominal", symbol: this.lookupType(type.path, context.module).identity.id };
      case "shared_ref":
      case "mut_ref": {
        let lifetime = null;
        if (type.lifetime !== null) {
          if (!context.signature) this.error("RESOLVE-LIFETIME-SCOPE", context.module, type.lifetime);
          lifetime = context.lifetimes.get(type.lifetime)?.id ?? null;
          if (lifetime === null) this.error("RESOLVE-LIFETIME-SCOPE", context.module, type.lifetime);
        }
        return { kind: type.kind, lifetime, element: this.type(type.element, context) };
      }
      case "tuple": return { kind: "tuple", elements: type.elements.map((entry) => this.type(entry, context)) };
      case "array": return { kind: "array", element: this.type(type.element, context), length: type.length };
      case "slice": return { kind: "slice", element: this.type(type.element, context) };
      case "own": return { kind: "own", value: this.type(type.value, context), brand: this.resolveBrand(type.brand, context.module) };
      case "allocator": return { kind: "allocator", brand: this.resolveBrand(type.brand, context.module) };
      case "result": return { kind: "result", ok: this.type(type.ok, context), error: this.type(type.error, context) };
      default: throw new Error(`unknown type kind: ${type.kind}`);
    }
  }

  visitReferences(type, output) {
    if (type.kind === "shared_ref" || type.kind === "mut_ref") {
      output.push(type.lifetime);
      this.visitReferences(type.element, output);
    } else if (type.kind === "tuple") {
      type.elements.forEach((entry) => this.visitReferences(entry, output));
    } else if (["array", "slice"].includes(type.kind)) {
      this.visitReferences(type.element, output);
    } else if (type.kind === "own") {
      this.visitReferences(type.value, output);
    } else if (type.kind === "result") {
      this.visitReferences(type.ok, output);
      this.visitReferences(type.error, output);
    }
  }

  functionLifetimes(item, module) {
    const inputLabels = [];
    const outputLabels = [];
    item.params.forEach((parameter) => this.visitReferences(parameter.type, inputLabels));
    this.visitReferences(item.result, outputLabels);
    const labels = [...new Set([...inputLabels, ...outputLabels].filter((label) => label !== null))].sort();
    const relations = new Map(labels.map((label) => [label, this.lifetimeIdentity(item._identity.id, label)]));
    if (item.visibility === "public") {
      for (const label of outputLabels) {
        if (label === null || inputLabels.filter((entry) => entry === label).length !== 1) {
          this.error("RESOLVE-LIFETIME-ORIGIN", module, `${item.name}:${label ?? "<unlabelled>"}`);
        }
      }
    }
    return relations;
  }

  declareLocal(context, name, kind) {
    if (name === "result" || (this.target.host_primitives ?? []).includes(name)) {
      this.error("RESOLVE-RESERVED-NAME", context.module, name);
    }
    if (this.findActive(context.scopes, name)) this.error("RESOLVE-SHADOW", context.module, name);
    const identity = this.localIdentity(context.functionSymbol, kind, context.nextOrdinal, name);
    context.nextOrdinal += 1;
    context.scopes.at(-1).set(name, identity);
    return identity;
  }

  refNode(target) {
    if (target.kind === "local") return { kind: "local_ref", binding: target.identity.id };
    if (target.kind === "primitive") return { kind: "primitive_ref", primitive: target.identity };
    return { kind: "symbol_ref", symbol: target.identity.id, target_kind: target.targetKind };
  }

  expression(node, context) {
    switch (node.kind) {
      case "integer": return { kind: "integer", value: node.value };
      case "boolean": return { kind: "boolean", value: node.value };
      case "path": return this.refNode(this.lookupValue(node.path, context.module, context.scopes));
      case "binary": return { kind: "binary", operator: node.operator, left: this.expression(node.left, context), right: this.expression(node.right, context) };
      case "unary": return { kind: "unary", operator: node.operator, value: this.expression(node.value, context) };
      case "borrow": return { kind: "borrow", mutable: node.mutable, place: this.expression(node.place, context) };
      case "call": return { kind: "call", callee: this.expression(node.callee, context), arguments: node.arguments.map((entry) => this.expression(entry, context)) };
      case "field": return { kind: "field", base: this.expression(node.base, context), field: node.field };
      case "index": return { kind: "index", base: this.expression(node.base, context), index: this.expression(node.index, context) };
      case "tuple": return { kind: "tuple", elements: node.elements.map((entry) => this.expression(entry, context)) };
      case "array": return { kind: "array", elements: node.elements.map((entry) => this.expression(entry, context)) };
      case "record": {
        const constructor = this.lookupConstructor(node.path, context.module, "record");
        return {
          kind: "record",
          constructor: constructor.identity.id,
          fields: node.fields.map((field) => this.withSource(field, {
            name: field.name,
            value: this.expression(field.value, context),
          })),
        };
      }
      case "if": return {
        kind: "if",
        condition: this.expression(node.condition, context),
        then: this.block(node.then, context),
        otherwise: node.otherwise === null ? null : this.expression(node.otherwise, context),
      };
      case "match": return {
        kind: "match",
        value: this.expression(node.value, context),
        arms: node.arms.map((arm) => {
          context.scopes.push(new Map());
          const pattern = this.pattern(arm.pattern, context);
          const expression = this.expression(arm.expression, context);
          context.scopes.pop();
          return this.withSource(arm, { pattern, expression });
        }),
      };
      case "block": return this.block(node, context);
      default: throw new Error(`unknown expression kind: ${node.kind}`);
    }
  }

  pattern(node, context) {
    switch (node.kind) {
      case "wildcard_pattern": return { kind: "wildcard_pattern" };
      case "literal_pattern": return { kind: "literal_pattern", value: this.expression(node.value, context) };
      case "binding_pattern": return { kind: "binding_pattern", binding: this.declareLocal(context, node.name, "pattern") };
      case "tuple_pattern": return { kind: "tuple_pattern", elements: node.elements.map((entry) => this.pattern(entry, context)) };
      case "path_pattern": {
        const constructor = this.lookupConstructor(node.path, context.module, "unit");
        return { kind: "path_pattern", constructor: constructor.identity.id };
      }
      case "variant_tuple_pattern": {
        const constructor = this.lookupConstructor(node.path, context.module, "tuple");
        return { kind: "variant_tuple_pattern", constructor: constructor.identity.id, elements: node.elements.map((entry) => this.pattern(entry, context)) };
      }
      case "variant_record_pattern": {
        const constructor = this.lookupConstructor(node.path, context.module, "record");
        return {
          kind: "variant_record_pattern",
          constructor: constructor.identity.id,
          fields: node.fields.map((field) => this.withSource(field, {
            name: field.name,
            pattern: this.pattern(field.pattern, context),
          })),
        };
      }
      default: throw new Error(`unknown pattern kind: ${node.kind}`);
    }
  }

  block(node, context) {
    context.scopes.push(new Map());
    const statements = node.statements.map((statement) => this.statement(statement, context));
    const tail = node.tail === null ? null : this.expression(node.tail, context);
    context.scopes.pop();
    return { kind: "block", statements, tail };
  }

  statement(node, context) {
    switch (node.kind) {
      case "let": {
        const annotation = node.annotation === null ? null : this.type(node.annotation, { module: context.module, signature: false, lifetimes: new Map() });
        const value = this.expression(node.value, context);
        const binding = this.declareLocal(context, node.name, "let");
        return { kind: "let", mutable: node.mutable, binding, annotation, value };
      }
      case "assign": return { kind: "assign", place: this.expression(node.place, context), value: this.expression(node.value, context) };
      case "expression_statement": return { kind: "expression_statement", expression: this.expression(node.expression, context) };
      case "return": return { kind: "return", value: node.value === null ? null : this.expression(node.value, context) };
      case "while": return { kind: "while", condition: this.expression(node.condition, context), body: this.block(node.body, context) };
      case "loop": return { kind: "loop", body: this.block(node.body, context) };
      case "break": return { kind: "break" };
      case "continue": return { kind: "continue" };
      default: throw new Error(`unknown statement kind: ${node.kind}`);
    }
  }

  contractExpression(node, context) {
    if (node.kind === "integer" || node.kind === "boolean") {
      return { kind: node.kind, value: node.value };
    }
    if (node.kind === "contract_unary") {
      return { kind: "contract_unary", operator: node.operator, value: this.contractExpression(node.value, context) };
    }
    if (node.kind === "contract_binary") {
      return {
        kind: "contract_binary",
        operator: node.operator,
        left: this.contractExpression(node.left, context),
        right: this.contractExpression(node.right, context),
      };
    }
    if (node.kind !== "contract_path") throw new Error(`unknown contract expression kind: ${node.kind}`);
    let target;
    if (node.symbol.length === 1 && context.fields?.has(node.symbol[0])) {
      target = { kind: "field", owner: context.owner, name: node.symbol[0] };
    } else if (node.symbol.length === 1 && context.locals?.has(node.symbol[0])) {
      target = { kind: "local", binding: context.locals.get(node.symbol[0]).id };
    } else if (node.symbol.length === 1 && node.symbol[0] === "result") {
      if (!context.result) this.error("RESOLVE-CONTRACT-SCOPE", context.module, "result");
      target = { kind: "result", function: context.owner };
    } else {
      const value = this.lookupValue(node.symbol, context.module, []);
      if (value.kind !== "symbol" || value.item.kind !== "const") {
        this.error("RESOLVE-WRONG-KIND", context.module, pathText(node.symbol));
      }
      target = { kind: "symbol", symbol: value.identity.id };
    }
    return { kind: "contract_ref", target, fields: node.fields };
  }

  contract(contract, context) {
    const expression = this.contractExpression(contract.expression, context);
    return {
      identity: contract._identity,
      kind: contract.kind,
      status: "DECLARED_UNPROVEN",
      expression_hash: `sha256:${hash("aether-k0-contract-expression", stableJson(semanticValue(expression)))}`,
      expression,
    };
  }

  resolveItem(item, module) {
    const plainTypeContext = { module, signature: false, lifetimes: new Map() };
    if (item.kind === "const") {
      return {
        kind: "const",
        identity: item._identity,
        visibility: item.visibility,
        type: this.type(item.type, plainTypeContext),
        value: this.contractExpression(item.value, { module, owner: item._identity.id, fields: new Set(), locals: new Map(), result: false }),
      };
    }
    if (item.kind === "struct") {
      const fields = item.fields.map((field) => this.withSource(field, {
        name: field.name,
        visibility: field.visibility,
        type: this.type(field.type, plainTypeContext),
      }));
      const fieldNames = new Set(item.fields.map((field) => field.name));
      return {
        kind: "struct",
        identity: item._identity,
        visibility: item.visibility,
        fields,
        invariants: item.invariants.map((contract) => this.contract(contract, { module, owner: item._identity.id, fields: fieldNames, locals: new Map(), result: false })),
      };
    }
    if (item.kind === "enum") {
      return {
        kind: "enum",
        identity: item._identity,
        visibility: item.visibility,
        variants: item.variants.map((variant) => this.withSource(variant, {
          identity: variant._identity,
          payload: this.withSource(variant.payload, variant.payload.kind === "unit"
            ? { kind: "unit" }
            : variant.payload.kind === "tuple"
              ? { kind: "tuple", types: variant.payload.types.map((type) => this.type(type, plainTypeContext)) }
              : {
                  kind: "record",
                  fields: variant.payload.fields.map((field) => this.withSource(field, {
                    name: field.name,
                    visibility: field.visibility,
                    type: this.type(field.type, plainTypeContext),
                  })),
                }),
        })),
        invariants: item.invariants.map((contract) => this.contract(contract, { module, owner: item._identity.id, fields: new Set(), locals: new Map(), result: false })),
      };
    }

    const lifetimes = this.functionLifetimes(item, module);
    const typeContext = { module, signature: true, lifetimes };
    const context = { module, functionSymbol: item._identity.id, nextOrdinal: 0, scopes: [new Map()] };
    const params = item.params.map((parameter) => {
      const type = this.type(parameter.type, typeContext);
      const binding = this.declareLocal(context, parameter.name, "parameter");
      return this.withSource(parameter, { binding, type });
    });
    const contractLocals = new Map(params.map((parameter) => [parameter.binding.name, parameter.binding]));
    const contracts = item.contracts.map((contract) => this.contract(contract, {
      module,
      owner: item._identity.id,
      fields: new Set(),
      locals: contractLocals,
      result: contract.kind === "ensures",
    }));
    const body = this.block(item.body, context);
    return {
      kind: "function",
      identity: item._identity,
      visibility: item.visibility,
      lifetimes: [...lifetimes.values()],
      params,
      result: this.type(item.result, typeContext),
      contracts,
      body,
    };
  }

  resolveEntry() {
    const entry = this.manifest.entry ?? "";
    const parts = entry.split("::");
    const module = parts.slice(0, -1).join(".");
    const name = parts.at(-1);
    const moduleInfo = this.modules.get(module);
    if (!moduleInfo) this.error("RESOLVE-NOT-FOUND", "<package>", entry);
    const item = moduleInfo.values.get(name);
    if (!item) {
      if (moduleInfo.types.has(name)) this.error("RESOLVE-WRONG-KIND", module, entry);
      this.error("RESOLVE-NOT-FOUND", module, entry);
    }
    if (item.kind !== "function") this.error("RESOLVE-WRONG-KIND", module, entry);
    return item._identity.id;
  }

  run() {
    this.prepareModules();
    this.collect();
    const entry = this.resolveEntry();
    const rawAsr = {
      schema: "aether.asr/k0-0.4",
      language_version: "0.4.0-draft",
      core_layer: "K0",
      package_id: this.packageId,
      target: this.target.id,
      entry,
      modules: [...this.modules.values()].map((moduleInfo) => this.withSource(moduleInfo.tree, {
        path: moduleInfo.path,
        source: moduleInfo.source,
        items: moduleInfo.tree.items.map((item) => this.resolveItem(item, moduleInfo.path)),
      })),
    };
    const sourceEntries = [];
    const asr = detachSources(rawAsr, [], sourceEntries);
    return {
      status: "accepted",
      asr,
      source_map: {
        schema: "aether.source-map/k0-0.4",
        language_version: "0.4.0-draft",
        asr_schema: "aether.asr/k0-0.4",
        asr_hash: `sha256:${hash("aether-k0-resolved-asr", stableJson(asr))}`,
        package_id: this.packageId,
        sources: [...this.modules.values()].map((moduleInfo) => ({
          path: moduleInfo.source,
          sha256: moduleInfo.sourceMap.source_sha256,
          byte_length: moduleInfo.sourceMap.byte_length,
        })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
        entries: sourceEntries,
      },
    };
  }
}

for (const methodName of [
  "type", "expression", "pattern", "block", "statement",
  "contractExpression", "contract", "resolveItem",
]) {
  const method = Resolver.prototype[methodName];
  Resolver.prototype[methodName] = function sourceMappedResolverNode(node, ...args) {
    return this.withSource(node, method.call(this, node, ...args));
  };
}

export function resolvePackage(input) {
  try {
    return new Resolver(input).run();
  } catch (error) {
    if (error instanceof ResolveError || error?.diagnostic) return error.diagnostic;
    throw error;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const input = JSON.parse(fs.readFileSync(0, "utf8"));
    process.stdout.write(`${JSON.stringify(resolvePackage(input))}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
