#!/usr/bin/env python3
import copy
import json
import sys


def initialized(place):
    return place is not None and place.get("state") == "initialized"


def copy_value(value):
    return value is not None and value.get("kind") in ("bool", "int", "unit", "shared_ref")


def ordered(mapping):
    return {key: mapping[key] for key in sorted(mapping)}


def execute(vector):
    state = {
        "places": copy.deepcopy(vector.get("initial", {}).get("places", {})),
        "allocators": {},
        "heap": {},
        "borrows": {},
    }
    for name, initial in vector.get("initial", {}).get("allocators", {}).items():
        allocator = copy.deepcopy(initial)
        allocator["used"] = 0
        state["allocators"][name] = allocator
    events = []

    def snapshot():
        return {
            "places": ordered(state["places"]),
            "allocators": ordered(state["allocators"]),
            "heap": ordered(state["heap"]),
            "borrows": ordered(state["borrows"]),
        }

    def rejected(code, number):
        return {
            "id": vector["id"],
            "status": "rejected",
            "code": code,
            "step": number,
            "events": events,
            "final": snapshot(),
        }

    def borrows_for(target):
        return [entry for entry in state["borrows"].values() if entry["target"] == target]

    def readable(name):
        place = state["places"].get(name)
        return place if initialized(place) else None

    for number, step in enumerate(vector["steps"]):
        operation = step.get("op")

        if operation == "declare":
            if initialized(state["places"].get(step["place"])):
                return rejected("CORE-MALFORMED", number)
            state["places"][step["place"]] = {
                "state": "initialized",
                "value": copy.deepcopy(step["value"]),
            }
            continue

        if operation == "move":
            source = readable(step["from"])
            if source is None:
                return rejected("MOVE-SOURCE-UNINITIALIZED", number)
            if borrows_for("place:" + step["from"]):
                return rejected("MOVE-BORROWED", number)
            if initialized(state["places"].get(step["to"])) or borrows_for("place:" + step["to"]):
                return rejected("CORE-MALFORMED", number)
            state["places"][step["to"]] = {
                "state": "initialized",
                "value": copy.deepcopy(source["value"]),
            }
            state["places"][step["from"]] = {"state": "uninitialized"}
            continue

        if operation == "copy":
            source = readable(step["from"])
            if source is None:
                return rejected("PLACE-UNINITIALIZED", number)
            if not copy_value(source["value"]):
                return rejected("COPY-NONCOPY", number)
            if any(item["kind"] == "exclusive" for item in borrows_for("place:" + step["from"])):
                return rejected("BORROW-CONFLICT", number)
            if initialized(state["places"].get(step["to"])):
                return rejected("CORE-MALFORMED", number)
            state["places"][step["to"]] = {
                "state": "initialized",
                "value": copy.deepcopy(source["value"]),
            }
            continue

        if operation == "use":
            place = readable(step["place"])
            if place is None:
                return rejected("PLACE-UNINITIALIZED", number)
            if any(item["kind"] == "exclusive" for item in borrows_for("place:" + step["place"])):
                return rejected("BORROW-CONFLICT", number)
            events.append({
                "event": "use",
                "place": step["place"],
                "value": copy.deepcopy(place["value"]),
            })
            continue

        if operation == "borrow":
            source = readable(step["from"])
            if source is None:
                return rejected("PLACE-UNINITIALIZED", number)
            if step["id"] in state["borrows"]:
                return rejected("CORE-MALFORMED", number)
            target = "place:" + step["from"]
            if step.get("pointee"):
                if source["value"].get("kind") != "own":
                    return rejected("DEALLOC-NOT-OWNER", number)
                target = "allocation:" + source["value"]["allocation"]
            current = borrows_for(target)
            if step["kind"] == "exclusive":
                conflict = len(current) > 0
            else:
                conflict = any(item["kind"] == "exclusive" for item in current)
            if conflict:
                return rejected("BORROW-CONFLICT", number)
            state["borrows"][step["id"]] = {"kind": step["kind"], "target": target}
            continue

        if operation == "end_borrow":
            if step["id"] not in state["borrows"]:
                return rejected("BORROW-UNKNOWN", number)
            del state["borrows"][step["id"]]
            continue

        if operation == "alloc":
            allocator = state["allocators"].get(step["allocator"])
            if allocator is None:
                return rejected("ALLOCATOR-UNKNOWN", number)
            source = readable(step["from"])
            if source is None:
                return rejected("PLACE-UNINITIALIZED", number)
            if borrows_for("place:" + step["from"]):
                return rejected("MOVE-BORROWED", number)
            if initialized(state["places"].get(step["ok"])) or initialized(state["places"].get(step["err"])):
                return rejected("CORE-MALFORMED", number)
            moved = copy.deepcopy(source["value"])
            state["places"][step["from"]] = {"state": "uninitialized"}
            if allocator["used"] >= allocator["capacity"]:
                state["places"][step["err"]] = {
                    "state": "initialized",
                    "value": {"kind": "alloc_error", "code": "ALLOC-EXHAUSTED", "returned": moved},
                }
                events.append({"event": "alloc_failure", "brand": allocator["brand"], "code": "ALLOC-EXHAUSTED"})
                continue
            if step["allocation"] in state["heap"]:
                return rejected("CORE-MALFORMED", number)
            state["heap"][step["allocation"]] = {
                "alive": True,
                "brand": allocator["brand"],
                "value": moved,
            }
            allocator["used"] += 1
            state["places"][step["ok"]] = {
                "state": "initialized",
                "value": {"kind": "own", "allocation": step["allocation"], "brand": allocator["brand"]},
            }
            events.append({"event": "alloc", "allocation": step["allocation"], "brand": allocator["brand"]})
            continue

        if operation == "dealloc":
            allocator = state["allocators"].get(step["allocator"])
            if allocator is None:
                return rejected("ALLOCATOR-UNKNOWN", number)
            source = readable(step["from"])
            if source is None:
                return rejected("PLACE-UNINITIALIZED", number)
            owner = source["value"]
            if owner is None or owner.get("kind") != "own":
                return rejected("DEALLOC-NOT-OWNER", number)
            if owner["brand"] != allocator["brand"]:
                return rejected("DEALLOC-BRAND-MISMATCH", number)
            allocation = state["heap"].get(owner["allocation"])
            if allocation is None or not allocation["alive"]:
                return rejected("DEALLOC-DEAD", number)
            if borrows_for("allocation:" + owner["allocation"]):
                return rejected("DEALLOC-BORROWED", number)
            if initialized(state["places"].get(step["to"])):
                return rejected("CORE-MALFORMED", number)
            returned = copy.deepcopy(allocation["value"])
            allocation["alive"] = False
            allocation["value"] = None
            allocator["used"] -= 1
            state["places"][step["from"]] = {"state": "uninitialized"}
            state["places"][step["to"]] = {"state": "initialized", "value": returned}
            events.append({"event": "dealloc", "allocation": owner["allocation"], "brand": owner["brand"]})
            continue

        if operation == "drop":
            place = readable(step["place"])
            if place is None:
                return rejected("PLACE-UNINITIALIZED", number)
            if borrows_for("place:" + step["place"]):
                return rejected("MOVE-BORROWED", number)
            value = place["value"]
            if value is not None and value.get("kind") == "own":
                allocation = state["heap"].get(value["allocation"])
                if allocation is None or not allocation["alive"]:
                    return rejected("DEALLOC-DEAD", number)
                if borrows_for("allocation:" + value["allocation"]):
                    return rejected("DEALLOC-BORROWED", number)
                events.append({
                    "event": "leak",
                    "allocation": value["allocation"],
                    "brand": value["brand"],
                    "code": "DROP-LEAK",
                })
            state["places"][step["place"]] = {"state": "uninitialized"}
            continue

        return rejected("CORE-MALFORMED", number)

    return {"id": vector["id"], "status": "ok", "events": events, "final": snapshot()}


def main():
    vector = json.load(sys.stdin)
    json.dump(execute(vector), sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
