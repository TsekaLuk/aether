import fs from "node:fs";

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function sortedRecord(record) {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

function isInitialized(place) {
  return place && place.state === "initialized";
}

function isCopyValue(value) {
  return value && ["bool", "int", "unit", "shared_ref"].includes(value.kind);
}

export function execute(vector) {
  const state = {
    places: clone(vector.initial.places ?? {}),
    allocators: {},
    heap: {},
    borrows: {},
  };
  for (const [name, allocator] of Object.entries(vector.initial.allocators ?? {})) {
    state.allocators[name] = { ...clone(allocator), used: 0 };
  }
  const events = [];

  function finalState() {
    return {
      places: sortedRecord(state.places),
      allocators: sortedRecord(state.allocators),
      heap: sortedRecord(state.heap),
      borrows: sortedRecord(state.borrows),
    };
  }

  function reject(code, step) {
    return { id: vector.id, status: "rejected", code, step, events, final: finalState() };
  }

  function activeBorrows(target) {
    return Object.values(state.borrows).filter((borrow) => borrow.target === target);
  }

  function placeForRead(name) {
    const place = state.places[name];
    return isInitialized(place) ? place : null;
  }

  for (let index = 0; index < vector.steps.length; index += 1) {
    const step = vector.steps[index];

    if (step.op === "declare") {
      if (isInitialized(state.places[step.place])) return reject("CORE-MALFORMED", index);
      state.places[step.place] = { state: "initialized", value: clone(step.value) };
      continue;
    }

    if (step.op === "move") {
      const source = placeForRead(step.from);
      if (!source) return reject("MOVE-SOURCE-UNINITIALIZED", index);
      if (activeBorrows(`place:${step.from}`).length > 0) return reject("MOVE-BORROWED", index);
      if (isInitialized(state.places[step.to]) || activeBorrows(`place:${step.to}`).length > 0) {
        return reject("CORE-MALFORMED", index);
      }
      state.places[step.to] = { state: "initialized", value: clone(source.value) };
      state.places[step.from] = { state: "uninitialized" };
      continue;
    }

    if (step.op === "copy") {
      const source = placeForRead(step.from);
      if (!source) return reject("PLACE-UNINITIALIZED", index);
      if (!isCopyValue(source.value)) return reject("COPY-NONCOPY", index);
      if (activeBorrows(`place:${step.from}`).some((borrow) => borrow.kind === "exclusive")) {
        return reject("BORROW-CONFLICT", index);
      }
      if (isInitialized(state.places[step.to])) return reject("CORE-MALFORMED", index);
      state.places[step.to] = { state: "initialized", value: clone(source.value) };
      continue;
    }

    if (step.op === "use") {
      const place = placeForRead(step.place);
      if (!place) return reject("PLACE-UNINITIALIZED", index);
      if (activeBorrows(`place:${step.place}`).some((borrow) => borrow.kind === "exclusive")) {
        return reject("BORROW-CONFLICT", index);
      }
      events.push({ event: "use", place: step.place, value: clone(place.value) });
      continue;
    }

    if (step.op === "borrow") {
      const source = placeForRead(step.from);
      if (!source) return reject("PLACE-UNINITIALIZED", index);
      if (state.borrows[step.id]) return reject("CORE-MALFORMED", index);
      let target = `place:${step.from}`;
      if (step.pointee) {
        if (source.value.kind !== "own") return reject("DEALLOC-NOT-OWNER", index);
        target = `allocation:${source.value.allocation}`;
      }
      const existing = activeBorrows(target);
      if (step.kind === "exclusive" ? existing.length > 0 : existing.some((borrow) => borrow.kind === "exclusive")) {
        return reject("BORROW-CONFLICT", index);
      }
      state.borrows[step.id] = { kind: step.kind, target };
      continue;
    }

    if (step.op === "end_borrow") {
      if (!state.borrows[step.id]) return reject("BORROW-UNKNOWN", index);
      delete state.borrows[step.id];
      continue;
    }

    if (step.op === "alloc") {
      const allocator = state.allocators[step.allocator];
      if (!allocator) return reject("ALLOCATOR-UNKNOWN", index);
      const source = placeForRead(step.from);
      if (!source) return reject("PLACE-UNINITIALIZED", index);
      if (activeBorrows(`place:${step.from}`).length > 0) return reject("MOVE-BORROWED", index);
      if (isInitialized(state.places[step.ok]) || isInitialized(state.places[step.err])) {
        return reject("CORE-MALFORMED", index);
      }
      const moved = clone(source.value);
      state.places[step.from] = { state: "uninitialized" };
      if (allocator.used >= allocator.capacity) {
        state.places[step.err] = {
          state: "initialized",
          value: { kind: "alloc_error", code: "ALLOC-EXHAUSTED", returned: moved },
        };
        events.push({ event: "alloc_failure", brand: allocator.brand, code: "ALLOC-EXHAUSTED" });
        continue;
      }
      if (state.heap[step.allocation]) return reject("CORE-MALFORMED", index);
      state.heap[step.allocation] = { alive: true, brand: allocator.brand, value: moved };
      allocator.used += 1;
      state.places[step.ok] = {
        state: "initialized",
        value: { kind: "own", allocation: step.allocation, brand: allocator.brand },
      };
      events.push({ event: "alloc", allocation: step.allocation, brand: allocator.brand });
      continue;
    }

    if (step.op === "dealloc") {
      const allocator = state.allocators[step.allocator];
      if (!allocator) return reject("ALLOCATOR-UNKNOWN", index);
      const source = placeForRead(step.from);
      if (!source) return reject("PLACE-UNINITIALIZED", index);
      const owner = source.value;
      if (!owner || owner.kind !== "own") return reject("DEALLOC-NOT-OWNER", index);
      if (owner.brand !== allocator.brand) return reject("DEALLOC-BRAND-MISMATCH", index);
      const allocation = state.heap[owner.allocation];
      if (!allocation || !allocation.alive) return reject("DEALLOC-DEAD", index);
      if (activeBorrows(`allocation:${owner.allocation}`).length > 0) return reject("DEALLOC-BORROWED", index);
      if (isInitialized(state.places[step.to])) return reject("CORE-MALFORMED", index);
      const returned = clone(allocation.value);
      allocation.alive = false;
      allocation.value = null;
      allocator.used -= 1;
      state.places[step.from] = { state: "uninitialized" };
      state.places[step.to] = { state: "initialized", value: returned };
      events.push({ event: "dealloc", allocation: owner.allocation, brand: owner.brand });
      continue;
    }

    if (step.op === "drop") {
      const place = placeForRead(step.place);
      if (!place) return reject("PLACE-UNINITIALIZED", index);
      if (activeBorrows(`place:${step.place}`).length > 0) return reject("MOVE-BORROWED", index);
      if (place.value?.kind === "own") {
        const allocation = state.heap[place.value.allocation];
        if (!allocation || !allocation.alive) return reject("DEALLOC-DEAD", index);
        if (activeBorrows(`allocation:${place.value.allocation}`).length > 0) {
          return reject("DEALLOC-BORROWED", index);
        }
        events.push({
          event: "leak",
          allocation: place.value.allocation,
          brand: place.value.brand,
          code: "DROP-LEAK",
        });
      }
      state.places[step.place] = { state: "uninitialized" };
      continue;
    }

    return reject("CORE-MALFORMED", index);
  }

  return { id: vector.id, status: "ok", events, final: finalState() };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const vector = JSON.parse(fs.readFileSync(0, "utf8"));
    process.stdout.write(`${JSON.stringify(execute(vector))}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
