#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import pathlib
import sys


sys.dont_write_bytecode = True
PARSER_PATH = pathlib.Path(__file__).with_name("parser-python.py")
PARSER_SPEC = importlib.util.spec_from_file_location("aether_parser_python", PARSER_PATH)
PARSER = importlib.util.module_from_spec(PARSER_SPEC)
PARSER_SPEC.loader.exec_module(PARSER)


class ResolveError(Exception):
    def __init__(self, code, module, subject):
        super().__init__(code)
        self.diagnostic = {
            "status": "rejected",
            "phase": "resolve",
            "code": code,
            "module": module,
            "subject": subject,
        }


class ParseRejection(Exception):
    def __init__(self, diagnostic):
        super().__init__(diagnostic["code"])
        self.diagnostic = diagnostic


def stable_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(domain, *parts):
    material = "\0".join([domain, *[str(part) for part in parts]])
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def short_id(prefix, domain, *parts):
    return f"{prefix}:{digest(domain, *parts)[:16]}"


def path_text(path):
    return "::".join(path)


class Resolver:
    def __init__(self, input_value):
        self.input = input_value
        self.manifest = input_value.get("manifest") or {}
        self.target = input_value.get("target") or {}
        self.sources = input_value.get("sources") or {}
        self.package_id = self.manifest.get("package_id", "<missing-package>")
        self.modules = {}
        self.symbol_tuples = {}
        self.contract_ids = set()

    def error(self, code, module, subject):
        raise ResolveError(code, module, subject)

    def symbol(self, module, namespace, name, kind):
        identifier = short_id(
            "sym", "aether-k0-symbol", self.package_id, module, namespace, name, kind
        )
        identity = {
            "id": identifier,
            "package": self.package_id,
            "module": module,
            "namespace": namespace,
            "name": name,
            "kind": kind,
        }
        tuple_text = stable_json(identity)
        prior = self.symbol_tuples.get(identifier)
        if prior is not None and prior != tuple_text:
            self.error("SYMBOL-ID-COLLISION", module, identifier)
        self.symbol_tuples[identifier] = tuple_text
        return identity

    def contract_identity(self, module, owner, kind, name):
        return {
            "id": short_id(
                "contract", "aether-k0-contract",
                self.package_id, module, owner, kind, name,
            ),
            "package": self.package_id,
            "module": module,
            "owner": owner,
            "kind": kind,
            "name": name,
        }

    @staticmethod
    def local_identity(function_symbol, kind, ordinal, name):
        return {
            "id": short_id(
                "local", "aether-k0-local", function_symbol, kind, ordinal, name
            ),
            "function": function_symbol,
            "kind": kind,
            "ordinal": ordinal,
            "name": name,
        }

    @staticmethod
    def lifetime_identity(function_symbol, label):
        return {
            "id": short_id(
                "life", "aether-k0-lifetime", function_symbol, label
            ),
            "function": function_symbol,
            "label": label,
        }

    def prepare_modules(self):
        manifest_modules = self.manifest.get("modules")
        if not isinstance(manifest_modules, dict):
            self.error("RESOLVE-MANIFEST-MALFORMED", "<package>", "modules")
        entries = sorted(manifest_modules.items(), key=lambda pair: pair[0])
        declared_sources = {source for _, source in entries}
        for source in sorted(self.sources):
            if source not in declared_sources:
                self.error("RESOLVE-SOURCE-UNDECLARED", "<package>", source)
        for module, source in entries:
            if source not in self.sources:
                self.error("RESOLVE-SOURCE-MISSING", module, source)
            parsed = PARSER.parse(self.sources[source])
            if parsed["status"] != "accepted":
                raise ParseRejection(parsed)
            declared_module = ".".join(parsed["tree"]["module"])
            if declared_module != module:
                self.error("RESOLVE-MODULE-MISMATCH", module, declared_module)
            self.modules[module] = {
                "path": module,
                "source": source,
                "tree": parsed["tree"],
                "types": {},
                "values": {},
            }

    def duplicate(self, module, subject):
        self.error("RESOLVE-DUPLICATE", module, subject)

    def check_fields(self, module, owner, fields):
        names = set()
        for field in fields:
            if field["name"] in names:
                self.duplicate(module, f"field:{owner}.{field['name']}")
            names.add(field["name"])

    def collect_contract(self, module, item, contract):
        identifier = ".".join(contract["id"])
        if identifier in self.contract_ids:
            self.duplicate(module, f"contract:{identifier}")
        self.contract_ids.add(identifier)
        contract["_identity"] = self.contract_identity(
            module, item["_identity"]["id"], contract["kind"], identifier
        )

    def collect(self):
        for module_info in self.modules.values():
            for item in module_info["tree"]["items"]:
                namespace = "type" if item["kind"] in ("struct", "enum") else "value"
                table = module_info["types"] if namespace == "type" else module_info["values"]
                if namespace == "value" and (
                    item["name"] == "result"
                    or item["name"] in self.target.get("host_primitives", [])
                ):
                    self.error("RESOLVE-RESERVED-NAME", module_info["path"], item["name"])
                if item["name"] in table:
                    self.duplicate(module_info["path"], f"{namespace}:{item['name']}")
                item["_identity"] = self.symbol(
                    module_info["path"], namespace, item["name"], item["kind"]
                )
                item["_module"] = module_info["path"]
                table[item["name"]] = item

                if item["kind"] == "struct":
                    self.check_fields(module_info["path"], item["name"], item["fields"])
                if item["kind"] == "enum":
                    variants = set()
                    for variant in item["variants"]:
                        if variant["name"] in variants:
                            self.duplicate(
                                module_info["path"],
                                f"variant:{item['name']}::{variant['name']}",
                            )
                        variants.add(variant["name"])
                        variant["_identity"] = self.symbol(
                            module_info["path"], "value",
                            f"{item['name']}::{variant['name']}", "enum_variant",
                        )
                        if variant["payload"]["kind"] == "record":
                            self.check_fields(
                                module_info["path"],
                                f"{item['name']}::{variant['name']}",
                                variant["payload"]["fields"],
                            )
                if item["kind"] == "function":
                    parameters = set()
                    for parameter in item["params"]:
                        if parameter["name"] in parameters:
                            self.duplicate(
                                module_info["path"],
                                f"parameter:{item['name']}:{parameter['name']}",
                            )
                        parameters.add(parameter["name"])
                contracts = item.get("invariants")
                if contracts is None:
                    contracts = item.get("contracts", [])
                for contract in contracts:
                    self.collect_contract(module_info["path"], item, contract)

    def visible(self, candidate, current_module, subject):
        if (
            candidate["item"]["_module"] != current_module
            and candidate["item"]["visibility"] != "public"
        ):
            self.error("RESOLVE-INACCESSIBLE", current_module, subject)
        return candidate

    def select_candidates(self, candidates, current_module, subject):
        visible = [
            candidate for candidate in candidates
            if candidate["item"]["_module"] == current_module
            or candidate["item"]["visibility"] == "public"
        ]
        if len(visible) > 1:
            self.error("RESOLVE-AMBIGUOUS", current_module, subject)
        if len(visible) == 1:
            return visible[0]
        if candidates:
            self.error("RESOLVE-INACCESSIBLE", current_module, subject)
        self.error("RESOLVE-NOT-FOUND", current_module, subject)

    def module_candidate(self, path, namespace):
        if len(path) < 2:
            return None
        module = ".".join(path[:-1])
        name = path[-1]
        info = self.modules.get(module)
        if info is None:
            return None
        item = (info["types"] if namespace == "type" else info["values"]).get(name)
        if item is None:
            return None
        return {
            "item": item,
            "identity": item["_identity"],
            "target_kind": item["kind"],
        }

    def variant_candidate(self, path, current_module):
        if len(path) < 2:
            return None
        enum_name = path[-2]
        variant_name = path[-1]
        module = current_module if len(path) == 2 else ".".join(path[:-2])
        info = self.modules.get(module)
        item = None if info is None else info["types"].get(enum_name)
        if item is None or item["kind"] != "enum":
            return None
        variant = next(
            (entry for entry in item["variants"] if entry["name"] == variant_name),
            None,
        )
        if variant is None:
            return None
        return {
            "item": item,
            "identity": variant["_identity"],
            "target_kind": "enum_variant",
            "variant": variant,
        }

    def lookup_type(self, path, current_module):
        candidate = None
        if len(path) == 1:
            item = self.modules.get(current_module, {}).get("types", {}).get(path[0])
            if item is not None:
                candidate = {
                    "item": item,
                    "identity": item["_identity"],
                    "target_kind": item["kind"],
                }
            elif path[0] in self.modules.get(current_module, {}).get("values", {}):
                self.error("RESOLVE-WRONG-KIND", current_module, path_text(path))
        else:
            candidate = self.module_candidate(path, "type")
        if candidate is None:
            self.error("RESOLVE-NOT-FOUND", current_module, path_text(path))
        return self.visible(candidate, current_module, path_text(path))

    @staticmethod
    def find_active(scopes, name):
        for scope in reversed(scopes):
            if name in scope:
                return scope[name]
        return None

    def lookup_value(self, path, current_module, scopes=None):
        scopes = scopes or []
        if len(path) == 1:
            local = self.find_active(scopes, path[0])
            if local is not None:
                return {"kind": "local", "identity": local}
            item = self.modules.get(current_module, {}).get("values", {}).get(path[0])
            if item is not None:
                candidate = self.visible(
                    {
                        "item": item,
                        "identity": item["_identity"],
                        "target_kind": item["kind"],
                    },
                    current_module,
                    path[0],
                )
                return {"kind": "symbol", **candidate}
            if path[0] in self.target.get("host_primitives", []):
                return {
                    "kind": "primitive",
                    "identity": f"primitive:{path[0]}",
                    "target_kind": "host_primitive",
                }
            if path[0] in self.modules.get(current_module, {}).get("types", {}):
                self.error("RESOLVE-WRONG-KIND", current_module, path[0])
            self.error("RESOLVE-NOT-FOUND", current_module, path[0])

        candidates = [
            candidate for candidate in (
                self.module_candidate(path, "value"),
                self.variant_candidate(path, current_module),
            ) if candidate is not None
        ]
        candidate = self.select_candidates(candidates, current_module, path_text(path))
        return {"kind": "symbol", **candidate}

    def lookup_constructor(self, path, current_module, required_payload=None):
        candidates = []
        if len(path) == 1:
            item = self.modules.get(current_module, {}).get("types", {}).get(path[0])
            type_candidate = None if item is None else {
                "item": item,
                "identity": item["_identity"],
                "target_kind": item["kind"],
            }
        else:
            type_candidate = self.module_candidate(path, "type")
        if type_candidate is not None and type_candidate["item"]["kind"] == "struct":
            candidates.append({**type_candidate, "payload_kind": "record"})
        variant = self.variant_candidate(path, current_module)
        if variant is not None:
            candidates.append({
                **variant,
                "payload_kind": variant["variant"]["payload"]["kind"],
            })
        if not candidates and type_candidate is not None:
            self.error("RESOLVE-WRONG-KIND", current_module, path_text(path))
        selected = self.select_candidates(candidates, current_module, path_text(path))
        if required_payload and selected["payload_kind"] != required_payload:
            self.error("RESOLVE-WRONG-KIND", current_module, path_text(path))
        return selected

    def resolve_brand(self, path, module):
        brand = f"brand:{'.'.join(path)}"
        if not any(entry.get("brand") == brand for entry in self.target.get("allocators", [])):
            self.error("RESOLVE-BRAND-NOT-FOUND", module, path_text(path))
        return brand

    def resolve_type(self, type_value, context):
        kind = type_value["kind"]
        if kind == "primitive":
            return {"kind": "primitive", "name": type_value["name"]}
        if kind == "path_type":
            return {
                "kind": "nominal",
                "symbol": self.lookup_type(type_value["path"], context["module"])["identity"]["id"],
            }
        if kind in ("shared_ref", "mut_ref"):
            lifetime = None
            if type_value["lifetime"] is not None:
                if not context["signature"]:
                    self.error("RESOLVE-LIFETIME-SCOPE", context["module"], type_value["lifetime"])
                relation = context["lifetimes"].get(type_value["lifetime"])
                if relation is None:
                    self.error("RESOLVE-LIFETIME-SCOPE", context["module"], type_value["lifetime"])
                lifetime = relation["id"]
            return {
                "kind": kind,
                "lifetime": lifetime,
                "element": self.resolve_type(type_value["element"], context),
            }
        if kind == "tuple":
            return {
                "kind": "tuple",
                "elements": [self.resolve_type(entry, context) for entry in type_value["elements"]],
            }
        if kind == "array":
            return {
                "kind": "array",
                "element": self.resolve_type(type_value["element"], context),
                "length": type_value["length"],
            }
        if kind == "slice":
            return {
                "kind": "slice",
                "element": self.resolve_type(type_value["element"], context),
            }
        if kind == "own":
            return {
                "kind": "own",
                "value": self.resolve_type(type_value["value"], context),
                "brand": self.resolve_brand(type_value["brand"], context["module"]),
            }
        if kind == "allocator":
            return {
                "kind": "allocator",
                "brand": self.resolve_brand(type_value["brand"], context["module"]),
            }
        if kind == "result":
            return {
                "kind": "result",
                "ok": self.resolve_type(type_value["ok"], context),
                "error": self.resolve_type(type_value["error"], context),
            }
        raise RuntimeError(f"unknown type kind: {kind}")

    def visit_references(self, type_value, output):
        kind = type_value["kind"]
        if kind in ("shared_ref", "mut_ref"):
            output.append(type_value["lifetime"])
            self.visit_references(type_value["element"], output)
        elif kind == "tuple":
            for entry in type_value["elements"]:
                self.visit_references(entry, output)
        elif kind in ("array", "slice"):
            self.visit_references(type_value["element"], output)
        elif kind == "own":
            self.visit_references(type_value["value"], output)
        elif kind == "result":
            self.visit_references(type_value["ok"], output)
            self.visit_references(type_value["error"], output)

    def function_lifetimes(self, item, module):
        input_labels = []
        output_labels = []
        for parameter in item["params"]:
            self.visit_references(parameter["type"], input_labels)
        self.visit_references(item["result"], output_labels)
        labels = sorted({label for label in input_labels + output_labels if label is not None})
        relations = {
            label: self.lifetime_identity(item["_identity"]["id"], label)
            for label in labels
        }
        if item["visibility"] == "public":
            for label in output_labels:
                if label is None or input_labels.count(label) != 1:
                    self.error(
                        "RESOLVE-LIFETIME-ORIGIN", module,
                        f"{item['name']}:{label if label is not None else '<unlabelled>'}",
                    )
        return relations

    def declare_local(self, context, name, kind):
        if name == "result" or name in self.target.get("host_primitives", []):
            self.error("RESOLVE-RESERVED-NAME", context["module"], name)
        if self.find_active(context["scopes"], name) is not None:
            self.error("RESOLVE-SHADOW", context["module"], name)
        identity = self.local_identity(
            context["function_symbol"], kind, context["next_ordinal"], name
        )
        context["next_ordinal"] += 1
        context["scopes"][-1][name] = identity
        return identity

    @staticmethod
    def ref_node(target):
        if target["kind"] == "local":
            return {"kind": "local_ref", "binding": target["identity"]["id"]}
        if target["kind"] == "primitive":
            return {"kind": "primitive_ref", "primitive": target["identity"]}
        return {
            "kind": "symbol_ref",
            "symbol": target["identity"]["id"],
            "target_kind": target["target_kind"],
        }

    def expression(self, node, context):
        kind = node["kind"]
        if kind in ("integer", "boolean"):
            return dict(node)
        if kind == "path":
            return self.ref_node(self.lookup_value(node["path"], context["module"], context["scopes"]))
        if kind == "binary":
            return {
                "kind": "binary", "operator": node["operator"],
                "left": self.expression(node["left"], context),
                "right": self.expression(node["right"], context),
            }
        if kind == "unary":
            return {
                "kind": "unary", "operator": node["operator"],
                "value": self.expression(node["value"], context),
            }
        if kind == "borrow":
            return {
                "kind": "borrow", "mutable": node["mutable"],
                "place": self.expression(node["place"], context),
            }
        if kind == "call":
            return {
                "kind": "call",
                "callee": self.expression(node["callee"], context),
                "arguments": [self.expression(entry, context) for entry in node["arguments"]],
            }
        if kind == "field":
            return {
                "kind": "field", "base": self.expression(node["base"], context),
                "field": node["field"],
            }
        if kind == "index":
            return {
                "kind": "index", "base": self.expression(node["base"], context),
                "index": self.expression(node["index"], context),
            }
        if kind in ("tuple", "array"):
            return {
                "kind": kind,
                "elements": [self.expression(entry, context) for entry in node["elements"]],
            }
        if kind == "record":
            constructor = self.lookup_constructor(node["path"], context["module"], "record")
            return {
                "kind": "record", "constructor": constructor["identity"]["id"],
                "fields": [
                    {"name": field["name"], "value": self.expression(field["value"], context)}
                    for field in node["fields"]
                ],
            }
        if kind == "if":
            return {
                "kind": "if",
                "condition": self.expression(node["condition"], context),
                "then": self.block(node["then"], context),
                "otherwise": None if node["otherwise"] is None else self.expression(node["otherwise"], context),
            }
        if kind == "match":
            arms = []
            for arm in node["arms"]:
                context["scopes"].append({})
                pattern = self.pattern(arm["pattern"], context)
                expression = self.expression(arm["expression"], context)
                context["scopes"].pop()
                arms.append({"pattern": pattern, "expression": expression})
            return {
                "kind": "match",
                "value": self.expression(node["value"], context),
                "arms": arms,
            }
        if kind == "block":
            return self.block(node, context)
        raise RuntimeError(f"unknown expression kind: {kind}")

    def pattern(self, node, context):
        kind = node["kind"]
        if kind == "wildcard_pattern":
            return {"kind": kind}
        if kind == "literal_pattern":
            return {"kind": kind, "value": self.expression(node["value"], context)}
        if kind == "binding_pattern":
            return {
                "kind": kind,
                "binding": self.declare_local(context, node["name"], "pattern"),
            }
        if kind == "tuple_pattern":
            return {
                "kind": kind,
                "elements": [self.pattern(entry, context) for entry in node["elements"]],
            }
        if kind == "path_pattern":
            constructor = self.lookup_constructor(node["path"], context["module"], "unit")
            return {"kind": kind, "constructor": constructor["identity"]["id"]}
        if kind == "variant_tuple_pattern":
            constructor = self.lookup_constructor(node["path"], context["module"], "tuple")
            return {
                "kind": kind, "constructor": constructor["identity"]["id"],
                "elements": [self.pattern(entry, context) for entry in node["elements"]],
            }
        if kind == "variant_record_pattern":
            constructor = self.lookup_constructor(node["path"], context["module"], "record")
            return {
                "kind": kind, "constructor": constructor["identity"]["id"],
                "fields": [
                    {"name": field["name"], "pattern": self.pattern(field["pattern"], context)}
                    for field in node["fields"]
                ],
            }
        raise RuntimeError(f"unknown pattern kind: {kind}")

    def block(self, node, context):
        context["scopes"].append({})
        statements = [self.statement(statement, context) for statement in node["statements"]]
        tail = None if node["tail"] is None else self.expression(node["tail"], context)
        context["scopes"].pop()
        return {"kind": "block", "statements": statements, "tail": tail}

    def statement(self, node, context):
        kind = node["kind"]
        if kind == "let":
            annotation = None
            if node["annotation"] is not None:
                annotation = self.resolve_type(
                    node["annotation"],
                    {"module": context["module"], "signature": False, "lifetimes": {}},
                )
            value = self.expression(node["value"], context)
            binding = self.declare_local(context, node["name"], "let")
            return {
                "kind": "let", "mutable": node["mutable"], "binding": binding,
                "annotation": annotation, "value": value,
            }
        if kind == "assign":
            return {
                "kind": kind, "place": self.expression(node["place"], context),
                "value": self.expression(node["value"], context),
            }
        if kind == "expression_statement":
            return {"kind": kind, "expression": self.expression(node["expression"], context)}
        if kind == "return":
            return {
                "kind": kind,
                "value": None if node["value"] is None else self.expression(node["value"], context),
            }
        if kind == "while":
            return {
                "kind": kind, "condition": self.expression(node["condition"], context),
                "body": self.block(node["body"], context),
            }
        if kind == "loop":
            return {"kind": kind, "body": self.block(node["body"], context)}
        if kind in ("break", "continue"):
            return {"kind": kind}
        raise RuntimeError(f"unknown statement kind: {kind}")

    def contract_expression(self, node, context):
        kind = node["kind"]
        if kind in ("integer", "boolean"):
            return dict(node)
        if kind == "contract_unary":
            return {
                "kind": kind, "operator": node["operator"],
                "value": self.contract_expression(node["value"], context),
            }
        if kind == "contract_binary":
            return {
                "kind": kind, "operator": node["operator"],
                "left": self.contract_expression(node["left"], context),
                "right": self.contract_expression(node["right"], context),
            }
        if kind != "contract_path":
            raise RuntimeError(f"unknown contract expression kind: {kind}")
        name = node["symbol"][0] if len(node["symbol"]) == 1 else None
        if name is not None and name in context["fields"]:
            target = {"kind": "field", "owner": context["owner"], "name": name}
        elif name is not None and name in context["locals"]:
            target = {"kind": "local", "binding": context["locals"][name]["id"]}
        elif name == "result":
            if not context["result"]:
                self.error("RESOLVE-CONTRACT-SCOPE", context["module"], "result")
            target = {"kind": "result", "function": context["owner"]}
        else:
            value = self.lookup_value(node["symbol"], context["module"], [])
            if value["kind"] != "symbol" or value["item"]["kind"] != "const":
                self.error("RESOLVE-WRONG-KIND", context["module"], path_text(node["symbol"]))
            target = {"kind": "symbol", "symbol": value["identity"]["id"]}
        return {"kind": "contract_ref", "target": target, "fields": node["fields"]}

    def contract(self, contract, context):
        expression = self.contract_expression(contract["expression"], context)
        return {
            "identity": contract["_identity"],
            "kind": contract["kind"],
            "status": "DECLARED_UNPROVEN",
            "expression_hash": f"sha256:{digest('aether-k0-contract-expression', stable_json(expression))}",
            "expression": expression,
        }

    def resolve_item(self, item, module):
        plain_type_context = {"module": module, "signature": False, "lifetimes": {}}
        kind = item["kind"]
        if kind == "const":
            return {
                "kind": kind, "identity": item["_identity"],
                "visibility": item["visibility"],
                "type": self.resolve_type(item["type"], plain_type_context),
                "value": self.contract_expression(
                    item["value"],
                    {"module": module, "owner": item["_identity"]["id"], "fields": set(), "locals": {}, "result": False},
                ),
            }
        if kind == "struct":
            fields = [
                {
                    "name": field["name"], "visibility": field["visibility"],
                    "type": self.resolve_type(field["type"], plain_type_context),
                }
                for field in item["fields"]
            ]
            field_names = {field["name"] for field in item["fields"]}
            return {
                "kind": kind, "identity": item["_identity"],
                "visibility": item["visibility"], "fields": fields,
                "invariants": [
                    self.contract(
                        contract,
                        {"module": module, "owner": item["_identity"]["id"], "fields": field_names, "locals": {}, "result": False},
                    )
                    for contract in item["invariants"]
                ],
            }
        if kind == "enum":
            variants = []
            for variant in item["variants"]:
                payload = variant["payload"]
                if payload["kind"] == "unit":
                    resolved_payload = {"kind": "unit"}
                elif payload["kind"] == "tuple":
                    resolved_payload = {
                        "kind": "tuple",
                        "types": [self.resolve_type(entry, plain_type_context) for entry in payload["types"]],
                    }
                else:
                    resolved_payload = {
                        "kind": "record",
                        "fields": [
                            {
                                "name": field["name"], "visibility": field["visibility"],
                                "type": self.resolve_type(field["type"], plain_type_context),
                            }
                            for field in payload["fields"]
                        ],
                    }
                variants.append({"identity": variant["_identity"], "payload": resolved_payload})
            return {
                "kind": kind, "identity": item["_identity"],
                "visibility": item["visibility"], "variants": variants,
                "invariants": [
                    self.contract(
                        contract,
                        {"module": module, "owner": item["_identity"]["id"], "fields": set(), "locals": {}, "result": False},
                    )
                    for contract in item["invariants"]
                ],
            }

        lifetimes = self.function_lifetimes(item, module)
        type_context = {"module": module, "signature": True, "lifetimes": lifetimes}
        context = {
            "module": module,
            "function_symbol": item["_identity"]["id"],
            "next_ordinal": 0,
            "scopes": [{}],
        }
        params = []
        for parameter in item["params"]:
            type_value = self.resolve_type(parameter["type"], type_context)
            binding = self.declare_local(context, parameter["name"], "parameter")
            params.append({"binding": binding, "type": type_value})
        contract_locals = {parameter["binding"]["name"]: parameter["binding"] for parameter in params}
        contracts = [
            self.contract(
                contract,
                {
                    "module": module, "owner": item["_identity"]["id"],
                    "fields": set(), "locals": contract_locals,
                    "result": contract["kind"] == "ensures",
                },
            )
            for contract in item["contracts"]
        ]
        body = self.block(item["body"], context)
        return {
            "kind": "function", "identity": item["_identity"],
            "visibility": item["visibility"],
            "lifetimes": list(lifetimes.values()),
            "params": params,
            "result": self.resolve_type(item["result"], type_context),
            "contracts": contracts,
            "body": body,
        }

    def resolve_entry(self):
        entry = self.manifest.get("entry", "")
        parts = entry.split("::")
        module = ".".join(parts[:-1])
        name = parts[-1]
        module_info = self.modules.get(module)
        if module_info is None:
            self.error("RESOLVE-NOT-FOUND", "<package>", entry)
        item = module_info["values"].get(name)
        if item is None:
            if name in module_info["types"]:
                self.error("RESOLVE-WRONG-KIND", module, entry)
            self.error("RESOLVE-NOT-FOUND", module, entry)
        if item["kind"] != "function":
            self.error("RESOLVE-WRONG-KIND", module, entry)
        return item["_identity"]["id"]

    def run(self):
        self.prepare_modules()
        self.collect()
        entry = self.resolve_entry()
        return {
            "status": "accepted",
            "asr": {
                "schema": "aether.asr/k0-0.4",
                "language_version": "0.4.0-draft",
                "core_layer": "K0",
                "package_id": self.package_id,
                "target": self.target.get("id"),
                "entry": entry,
                "modules": [
                    {
                        "path": module_info["path"],
                        "source": module_info["source"],
                        "items": [
                            self.resolve_item(item, module_info["path"])
                            for item in module_info["tree"]["items"]
                        ],
                    }
                    for module_info in self.modules.values()
                ],
            },
        }


def resolve_package(input_value):
    try:
        return Resolver(input_value).run()
    except (ResolveError, ParseRejection) as error:
        return error.diagnostic


def main():
    try:
        input_value = json.load(sys.stdin)
        json.dump(resolve_package(input_value), sys.stdout, sort_keys=True, separators=(",", ":"))
        sys.stdout.write("\n")
    except Exception as error:
        sys.stderr.write(f"{type(error).__name__}: {error}\n")
        raise


if __name__ == "__main__":
    main()
