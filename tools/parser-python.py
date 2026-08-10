#!/usr/bin/env python3
import hashlib
import json
import re
import sys


KEYWORDS = {
    "module", "pub", "const", "struct", "enum", "fn", "requires",
    "ensures", "invariant", "init", "let", "mut", "move", "return",
    "if", "else", "while", "loop", "break", "continue", "match",
    "true", "false",
}

RESERVED = {
    "unsafe": "K1", "effect": "K1", "capability": "K1", "linear": "K1",
    "trait": "K1", "impl": "K1", "comptime": "K1", "assume": "K1",
    "async": "K2", "await": "K2", "spawn": "K2",
}

PUNCTUATORS = [
    "::", "->", "=>", "==", "!=", "<=", ">=", "&&", "||",
    "{", "}", "(", ")", "[", "]", "<", ">", ",", ";", ":", ".",
    "=", "+", "-", "*", "/", "%", "!", "&", "|",
]

PRIMITIVES = {
    "bool", "unit", "u8", "u16", "u32", "u64", "i8", "i16", "i32",
    "i64", "usize", "isize",
}

BINARY_PRECEDENCE = {
    "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, "<=": 4,
    ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6,
}

CONTRACT_PRECEDENCE = {
    "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, "<=": 4,
    ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6,
}


class K0Error(Exception):
    def __init__(self, phase, code, start, end, token=None):
        super().__init__(code)
        self.diagnostic = {
            "status": "rejected",
            "phase": phase,
            "code": code,
            "span": {"start": start, "end": end},
        }
        if token is not None:
            self.diagnostic["token"] = token


def lexical_error(code, start, end, token=None):
    raise K0Error("lexical", code, start, end, token)


def integer_value(text, start, end):
    patterns = [
        (r"^0b[01](?:_?[01])*$", 2, text[2:]),
        (r"^0o[0-7](?:_?[0-7])*$", 8, text[2:]),
        (r"^0x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*$", 16, text[2:]),
        (r"^[0-9](?:_?[0-9])*$", 10, text),
    ]
    for pattern, radix, digits in patterns:
        if re.match(pattern, text):
            return str(int(digits.replace("_", ""), radix))
    lexical_error("LEX-INVALID-TOKEN", start, end, text)


def tokenize(source):
    tokens = []
    byte_offsets = [0]
    for scalar in source:
        byte_offsets.append(byte_offsets[-1] + len(scalar.encode("utf-8")))

    def byte(offset):
        return byte_offsets[offset]

    index = 0
    length = len(source)
    while index < length:
        char = source[index]
        if char in " \t\n\r":
            index += 1
            continue
        if source.startswith("//", index):
            index += 2
            while index < length and source[index] not in "\n\r":
                index += 1
            continue
        if source.startswith("/*", index):
            start = index
            end = source.find("*/", index + 2)
            if end < 0:
                lexical_error("LEX-UNTERMINATED-COMMENT", byte(start), byte(length))
            index = end + 2
            continue
        if char == "'":
            start = index
            index += 1
            if index >= length or not re.match(r"[A-Za-z_]", source[index]):
                lexical_error("LEX-INVALID-TOKEN", byte(start), byte(index), "'")
            index += 1
            while index < length and re.match(r"[A-Za-z0-9_]", source[index]):
                index += 1
            tokens.append({
                "kind": "LIFETIME", "text": source[start:index],
                "start": byte(start), "end": byte(index),
            })
            continue
        if re.match(r"[A-Za-z_]", char):
            start = index
            index += 1
            while index < length and re.match(r"[A-Za-z0-9_]", source[index]):
                index += 1
            text = source[start:index]
            if text in RESERVED:
                error = K0Error(
                    "lexical", "LAYER-FEATURE-DISABLED", byte(start), byte(index), text
                )
                error.diagnostic["requested_layer"] = "K0"
                error.diagnostic["available_since"] = RESERVED[text]
                raise error
            tokens.append({
                "kind": "KEYWORD" if text in KEYWORDS else "IDENT",
                "text": text, "start": byte(start), "end": byte(index),
            })
            continue
        if char.isdigit() and ord(char) < 128:
            start = index
            index += 1
            while index < length and re.match(r"[A-Za-z0-9_]", source[index]):
                index += 1
            text = source[start:index]
            tokens.append({
                "kind": "INTEGER", "text": text,
                "value": integer_value(text, byte(start), byte(index)),
                "start": byte(start), "end": byte(index),
            })
            continue
        punctuator = next((item for item in PUNCTUATORS if source.startswith(item, index)), None)
        if punctuator is not None:
            tokens.append({
                "kind": "PUNCT", "text": punctuator,
                "start": byte(index), "end": byte(index + len(punctuator)),
            })
            index += len(punctuator)
            continue
        lexical_error("LEX-INVALID-TOKEN", byte(index), byte(index + 1), char)
    tokens.append({
        "kind": "EOF", "text": "<eof>",
        "start": byte(length), "end": byte(length),
    })
    return tokens


class Parser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.index = 0

    def current(self):
        return self.tokens[self.index]

    def mark(self, start, value, end=None, origin="source"):
        if end is None:
            end = self.tokens[max(0, self.index - 1)]["end"]
        value["_span"] = {"start": start, "end": end, "origin": origin}
        return value

    def at(self, text):
        return self.current()["text"] == text

    def take(self, text):
        if not self.at(text):
            return False
        self.index += 1
        return True

    def error(self, token=None):
        token = self.current() if token is None else token
        eof = token["kind"] == "EOF"
        code = "PARSE-UNEXPECTED-EOF" if eof else "PARSE-UNEXPECTED-TOKEN"
        raise K0Error("parse", code, token["start"], token["end"], None if eof else token["text"])

    def expect(self, text):
        if not self.take(text):
            self.error()

    def identifier(self):
        token = self.current()
        if token["kind"] != "IDENT":
            self.error(token)
        self.index += 1
        return token["text"]

    def module_path(self):
        parts = [self.identifier()]
        while self.take("."):
            parts.append(self.identifier())
        return parts

    def symbol_path(self):
        parts = [self.identifier()]
        while self.take("::"):
            parts.append(self.identifier())
        return parts

    def parse_source(self):
        self.expect("module")
        module = self.module_path()
        self.expect(";")
        items = []
        while self.current()["kind"] != "EOF":
            items.append(self.item())
        return {"kind": "source", "module": module, "items": items}

    def item(self):
        visibility = "public" if self.take("pub") else "private"
        if self.take("const"):
            return self.const_decl(visibility)
        if self.take("struct"):
            return self.struct_decl(visibility)
        if self.take("enum"):
            return self.enum_decl(visibility)
        if self.take("fn"):
            return self.fn_decl(visibility)
        self.error()

    def const_decl(self, visibility):
        name = self.identifier()
        self.expect(":")
        type_ = self.parse_type()
        self.expect("=")
        value = self.contract_expression()
        self.expect(";")
        return {"kind": "const", "visibility": visibility, "name": name, "type": type_, "value": value}

    def invariant(self):
        self.expect("invariant")
        id_ = self.module_path()
        self.expect(":")
        expression = self.contract_expression()
        self.expect(";")
        return {
            "kind": "invariant", "id": id_, "expression": expression,
            "status": "DECLARED_UNPROVEN",
        }

    def field_decl(self):
        visibility = "public" if self.take("pub") else "private"
        name = self.identifier()
        self.expect(":")
        type_ = self.parse_type()
        self.expect(",")
        return {"kind": "field", "visibility": visibility, "name": name, "type": type_}

    def struct_decl(self, visibility):
        name = self.identifier()
        self.expect("{")
        fields = []
        invariants = []
        while not self.at("}"):
            if self.at("invariant"):
                invariants.append(self.invariant())
            else:
                fields.append(self.field_decl())
        self.expect("}")
        return {
            "kind": "struct", "visibility": visibility, "name": name,
            "fields": fields, "invariants": invariants,
        }

    def enum_decl(self, visibility):
        name = self.identifier()
        self.expect("{")
        variants = []
        invariants = []
        while not self.at("}"):
            if self.at("invariant"):
                invariants.append(self.invariant())
                continue
            variant_start = self.current()["start"]
            variant_name = self.identifier()
            payload = self.mark(variant_start, {"kind": "unit"})
            if self.take("("):
                payload_start = self.tokens[self.index - 1]["start"]
                payload = {"kind": "tuple", "types": self.type_list(")")}
                self.expect(")")
                self.mark(payload_start, payload)
            elif self.take("{"):
                payload_start = self.tokens[self.index - 1]["start"]
                fields = []
                while not self.at("}"):
                    fields.append(self.field_decl())
                self.expect("}")
                payload = {"kind": "record", "fields": fields}
                self.mark(payload_start, payload)
            self.expect(",")
            variants.append(self.mark(
                variant_start,
                {"kind": "variant", "name": variant_name, "payload": payload},
            ))
        self.expect("}")
        return {
            "kind": "enum", "visibility": visibility, "name": name,
            "variants": variants, "invariants": invariants,
        }

    def fn_decl(self, visibility):
        name = self.identifier()
        self.expect("(")
        params = []
        if not self.at(")"):
            while True:
                parameter_start = self.current()["start"]
                param_name = self.identifier()
                self.expect(":")
                params.append(self.mark(
                    parameter_start,
                    {"name": param_name, "type": self.parse_type()},
                ))
                if not self.take(","):
                    break
                if self.at(")"):
                    break
        self.expect(")")
        implicit_result_offset = self.tokens[self.index - 1]["end"]
        result = self.parse_type() if self.take("->") else self.mark(
            implicit_result_offset,
            {"kind": "primitive", "name": "unit"},
            implicit_result_offset,
            "synthetic",
        )
        contracts = []
        while self.at("requires") or self.at("ensures"):
            contract_start = self.current()["start"]
            contract_kind = self.current()["text"]
            self.index += 1
            id_ = self.module_path()
            self.expect(":")
            expression = self.contract_expression()
            self.expect(";")
            contracts.append(self.mark(contract_start, {
                "kind": contract_kind, "id": id_, "expression": expression,
                "status": "DECLARED_UNPROVEN",
            }))
        body = self.block()
        return {
            "kind": "function", "visibility": visibility, "name": name,
            "params": params, "result": result, "contracts": contracts, "body": body,
        }

    def type_list(self, end):
        types = []
        if self.at(end):
            return types
        while True:
            types.append(self.parse_type())
            if not self.take(","):
                break
            if self.at(end):
                break
        return types

    def parse_type(self):
        if self.take("&"):
            lifetime = None
            if self.current()["kind"] == "LIFETIME":
                lifetime = self.current()["text"][1:]
                self.index += 1
            mutable = self.take("mut")
            return {
                "kind": "mut_ref" if mutable else "shared_ref",
                "lifetime": lifetime, "element": self.parse_type(),
            }
        if self.take("["):
            element = self.parse_type()
            if self.take(";"):
                length = self.integer_literal()
                self.expect("]")
                return {"kind": "array", "element": element, "length": length["value"]}
            self.expect("]")
            return {"kind": "slice", "element": element}
        if self.take("("):
            elements = self.type_list(")")
            self.expect(")")
            return {"kind": "tuple", "elements": elements}
        token = self.current()
        if token["kind"] != "IDENT":
            self.error(token)
        if token["text"] in PRIMITIVES:
            self.index += 1
            return {"kind": "primitive", "name": token["text"]}
        if token["text"] == "Own":
            self.index += 1
            self.expect("<")
            value = self.parse_type()
            self.expect(",")
            brand = self.symbol_path()
            self.expect(">")
            return {"kind": "own", "value": value, "brand": brand}
        if token["text"] == "Allocator":
            self.index += 1
            self.expect("<")
            brand = self.symbol_path()
            self.expect(">")
            return {"kind": "allocator", "brand": brand}
        if token["text"] == "Result":
            self.index += 1
            self.expect("<")
            ok = self.parse_type()
            self.expect(",")
            error = self.parse_type()
            self.expect(">")
            return {"kind": "result", "ok": ok, "error": error}
        return {"kind": "path_type", "path": self.symbol_path()}

    def integer_literal(self):
        token = self.current()
        if token["kind"] != "INTEGER":
            self.error(token)
        self.index += 1
        return {"kind": "integer", "value": token["value"]}

    def literal(self):
        if self.current()["kind"] == "INTEGER":
            return self.integer_literal()
        if self.take("true"):
            return {"kind": "boolean", "value": True}
        if self.take("false"):
            return {"kind": "boolean", "value": False}
        self.error()

    def block(self):
        self.expect("{")
        statements = []
        tail = None
        while not self.at("}"):
            if self.current()["kind"] == "EOF":
                self.error()
            statement_start = self.current()["start"]
            if self.take("let"):
                mutable = self.take("mut")
                name = self.identifier()
                annotation = self.parse_type() if self.take(":") else None
                self.expect("=")
                value = self.expression()
                self.expect(";")
                statements.append(self.mark(statement_start, {
                    "kind": "let", "mutable": mutable, "name": name,
                    "annotation": annotation, "value": value,
                }))
                continue
            if self.take("return"):
                value = None if self.at(";") else self.expression()
                self.expect(";")
                statements.append(self.mark(
                    statement_start, {"kind": "return", "value": value}
                ))
                continue
            if self.take("while"):
                condition = self.expression()
                body = self.block()
                statements.append(self.mark(statement_start, {
                    "kind": "while", "condition": condition, "body": body,
                }))
                continue
            if self.take("loop"):
                statements.append(self.mark(
                    statement_start, {"kind": "loop", "body": self.block()}
                ))
                continue
            if self.take("break"):
                self.expect(";")
                statements.append(self.mark(statement_start, {"kind": "break"}))
                continue
            if self.take("continue"):
                self.expect(";")
                statements.append(self.mark(statement_start, {"kind": "continue"}))
                continue
            left = self.expression()
            if self.take("="):
                if not self.is_place(left):
                    self.error(self.tokens[self.index - 1])
                value = self.expression()
                self.expect(";")
                statements.append(self.mark(statement_start, {
                    "kind": "assign", "place": left, "value": value,
                }))
            elif self.take(";"):
                statements.append(self.mark(statement_start, {
                    "kind": "expression_statement", "expression": left,
                }))
            elif self.at("}"):
                tail = left
                break
            else:
                self.error()
        self.expect("}")
        return {"kind": "block", "statements": statements, "tail": tail}

    @staticmethod
    def is_place(node):
        if node["kind"] == "path":
            return True
        if node["kind"] in {"field", "index"}:
            return Parser.is_place(node["base"])
        return node["kind"] == "unary" and node["operator"] == "*"

    def expression(self, minimum=1):
        start = self.current()["start"]
        left = self.unary_expression()
        while True:
            precedence = BINARY_PRECEDENCE.get(self.current()["text"], 0)
            if precedence < minimum:
                break
            operator = self.current()["text"]
            self.index += 1
            right = self.expression(precedence + 1)
            left = self.mark(start, {
                "kind": "binary", "operator": operator, "left": left, "right": right,
            })
        return self.mark(start, left)

    def unary_expression(self):
        start = self.current()["start"]
        if self.at("!") or self.at("-") or self.at("move") or self.at("*"):
            operator = self.current()["text"]
            self.index += 1
            return self.mark(start, {
                "kind": "unary", "operator": operator,
                "value": self.unary_expression(),
            })
        if self.take("&"):
            mutable = self.take("mut")
            return self.mark(start, {
                "kind": "borrow", "mutable": mutable,
                "place": self.unary_expression(),
            })
        value = self.primary()
        while True:
            if self.take("("):
                arguments = self.expression_list(")")
                self.expect(")")
                value = self.mark(start, {
                    "kind": "call", "callee": value, "arguments": arguments,
                })
            elif self.take("."):
                value = self.mark(start, {
                    "kind": "field", "base": value, "field": self.identifier(),
                })
            elif self.take("["):
                index = self.expression()
                self.expect("]")
                value = self.mark(start, {
                    "kind": "index", "base": value, "index": index,
                })
            else:
                break
        return self.mark(start, value)

    def expression_list(self, end):
        values = []
        if self.at(end):
            return values
        while True:
            values.append(self.expression())
            if not self.take(","):
                break
            if self.at(end):
                break
        return values

    def primary(self):
        if self.current()["kind"] == "INTEGER" or self.at("true") or self.at("false"):
            return self.literal()
        if self.take("init"):
            path = self.symbol_path()
            self.expect("{")
            fields = []
            while not self.at("}"):
                field_start = self.current()["start"]
                name = self.identifier()
                self.expect(":")
                value = self.expression()
                self.expect(",")
                fields.append(self.mark(field_start, {"name": name, "value": value}))
            self.expect("}")
            return {"kind": "record", "path": path, "fields": fields}
        if self.take("if"):
            return self.if_expression()
        if self.take("match"):
            return self.match_expression()
        if self.at("{"):
            return self.block()
        if self.take("["):
            elements = self.expression_list("]")
            self.expect("]")
            return {"kind": "array", "elements": elements}
        if self.take("("):
            if self.take(")"):
                return {"kind": "tuple", "elements": []}
            first = self.expression()
            if not self.take(","):
                self.expect(")")
                return first
            elements = [first]
            while not self.at(")"):
                elements.append(self.expression())
                if not self.take(","):
                    break
            self.expect(")")
            return {"kind": "tuple", "elements": elements}
        if self.current()["kind"] == "IDENT":
            return {"kind": "path", "path": self.symbol_path()}
        self.error()

    def if_expression(self):
        condition = self.expression()
        then = self.block()
        otherwise = None
        if self.take("else"):
            if self.at("if"):
                otherwise_start = self.current()["start"]
                self.expect("if")
                otherwise = self.mark(otherwise_start, self.if_expression())
            else:
                otherwise = self.block()
        return {"kind": "if", "condition": condition, "then": then, "otherwise": otherwise}

    def match_expression(self):
        value = self.expression()
        self.expect("{")
        arms = []
        if self.at("}"):
            self.error()
        while not self.at("}"):
            arm_start = self.current()["start"]
            pattern = self.pattern()
            self.expect("=>")
            expression = self.expression()
            self.expect(",")
            arms.append(self.mark(arm_start, {
                "pattern": pattern, "expression": expression,
            }))
        self.expect("}")
        return {"kind": "match", "value": value, "arms": arms}

    def pattern_list(self, end):
        patterns = []
        if self.at(end):
            return patterns
        while True:
            patterns.append(self.pattern())
            if not self.take(","):
                break
            if self.at(end):
                break
        return patterns

    def pattern(self):
        if self.current()["kind"] == "INTEGER" or self.at("true") or self.at("false"):
            return {"kind": "literal_pattern", "value": self.literal()}
        if self.take("("):
            elements = self.pattern_list(")")
            self.expect(")")
            return {"kind": "tuple_pattern", "elements": elements}
        if self.current()["kind"] != "IDENT":
            self.error()
        path = self.symbol_path()
        if len(path) == 1 and path[0] == "_":
            return {"kind": "wildcard_pattern"}
        if len(path) == 1:
            return {"kind": "binding_pattern", "name": path[0]}
        if self.take("("):
            elements = self.pattern_list(")")
            self.expect(")")
            return {"kind": "variant_tuple_pattern", "path": path, "elements": elements}
        if self.take("{"):
            fields = []
            while not self.at("}"):
                field_start = self.current()["start"]
                name = self.identifier()
                self.expect(":")
                pattern = self.pattern()
                self.expect(",")
                fields.append(self.mark(field_start, {
                    "name": name, "pattern": pattern,
                }))
            self.expect("}")
            return {"kind": "variant_record_pattern", "path": path, "fields": fields}
        return {"kind": "path_pattern", "path": path}

    def contract_expression(self, minimum=1):
        start = self.current()["start"]
        left = self.contract_unary()
        while True:
            precedence = CONTRACT_PRECEDENCE.get(self.current()["text"], 0)
            if precedence < minimum:
                break
            operator = self.current()["text"]
            self.index += 1
            right = self.contract_expression(precedence + 1)
            left = self.mark(start, {
                "kind": "contract_binary", "operator": operator,
                "left": left, "right": right,
            })
        return self.mark(start, left)

    def contract_unary(self):
        start = self.current()["start"]
        if self.at("!") or self.at("-"):
            operator = self.current()["text"]
            self.index += 1
            return self.mark(start, {
                "kind": "contract_unary", "operator": operator,
                "value": self.contract_unary(),
            })
        if self.current()["kind"] == "INTEGER" or self.at("true") or self.at("false"):
            return self.literal()
        if self.take("("):
            value = self.contract_expression()
            self.expect(")")
            return self.mark(start, value)
        symbol = self.symbol_path()
        fields = []
        while self.take("."):
            fields.append(self.identifier())
        return self.mark(start, {
            "kind": "contract_path", "symbol": symbol, "fields": fields,
        })


def traced_parser_method(method):
    def traced(self, *args, **kwargs):
        start = self.current()["start"]
        return self.mark(start, method(self, *args, **kwargs))
    return traced


for method_name in [
    "parse_source", "item", "const_decl", "invariant", "field_decl",
    "struct_decl", "enum_decl", "fn_decl", "parse_type", "integer_literal",
    "literal", "block", "primary", "if_expression", "match_expression",
    "pattern",
]:
    setattr(Parser, method_name, traced_parser_method(getattr(Parser, method_name)))


def detach_locations(value, path, entries):
    if isinstance(value, list):
        return [
            detach_locations(child, [*path, index], entries)
            for index, child in enumerate(value)
        ]
    if not isinstance(value, dict):
        return value
    span = value.get("_span")
    if span is not None:
        entries.append({
            "path": path,
            "start": span["start"],
            "end": span["end"],
            "origin": span["origin"],
        })
    return {
        key: detach_locations(value[key], [*path, key], entries)
        for key in sorted(value)
        if key != "_span"
    }


def accepted_parse(tree, source):
    entries = []
    detached_tree = detach_locations(tree, [], entries)
    raw = source.encode("utf-8")
    return {
        "status": "accepted",
        "tree": detached_tree,
        "source_map": {
            "schema": "aether.syntax-source-map/k0-0.4",
            "source_sha256": f"sha256:{hashlib.sha256(raw).hexdigest()}",
            "byte_length": len(raw),
            "entries": entries,
        },
    }


def parse(source):
    try:
        parser = Parser(tokenize(source))
        return accepted_parse(parser.parse_source(), source)
    except K0Error as error:
        return error.diagnostic


def main():
    raw = sys.stdin.buffer.read()
    try:
        result = parse(raw.decode("utf-8"))
    except UnicodeDecodeError:
        result = {
            "status": "rejected",
            "phase": "lexical",
            "code": "LEX-INVALID-UTF8",
            "span": {"start": 0, "end": len(raw)},
        }
    json.dump(result, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
