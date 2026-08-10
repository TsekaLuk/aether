function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolve(root, reference) {
  if (!reference.startsWith("#/")) throw new Error(`unsupported schema reference: ${reference}`);
  return reference.slice(2).split("/").reduce((value, component) => {
    const key = component.replaceAll("~1", "/").replaceAll("~0", "~");
    if (value === undefined || value === null || !(key in value)) {
      throw new Error(`unresolved schema reference: ${reference}`);
    }
    return value[key];
  }, root);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function typeMatches(type, value) {
  if (type === "object") return isObject(value);
  if (type === "array") return Array.isArray(value);
  if (type === "string") return typeof value === "string";
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return false;
}

function check(schema, value, root, at) {
  if (schema === true) return [];
  if (schema === false) return [`${at}: schema rejects every value`];
  if (schema.$ref) return check(resolve(root, schema.$ref), value, root, at);

  if (schema.oneOf) {
    const branches = schema.oneOf.map((branch) => check(branch, value, root, at));
    const matches = branches.filter((errors) => errors.length === 0).length;
    return matches === 1 ? [] : [`${at}: expected exactly one oneOf match, got ${matches}`];
  }
  if (schema.const !== undefined && !same(value, schema.const)) {
    return [`${at}: value differs from const`];
  }
  if (schema.enum && !schema.enum.some((entry) => same(value, entry))) {
    return [`${at}: value is outside enum`];
  }
  if (schema.type && !typeMatches(schema.type, value)) {
    return [`${at}: expected ${schema.type}`];
  }

  const errors = [];
  if (typeof value === "string" && schema.pattern && !(new RegExp(schema.pattern).test(value))) {
    errors.push(`${at}: string does not match pattern`);
  }
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${at}: number is below minimum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${at}: array has fewer than ${schema.minItems} items`);
    }
    if (schema.items) {
      value.forEach((entry, index) => errors.push(...check(schema.items, entry, root, `${at}/${index}`)));
    }
  }
  if (isObject(value)) {
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) {
      errors.push(`${at}: object has fewer than ${schema.minProperties} properties`);
    }
    for (const required of schema.required ?? []) {
      if (!(required in value)) errors.push(`${at}: missing required property ${required}`);
    }
    const properties = schema.properties ?? {};
    for (const [key, entry] of Object.entries(value)) {
      if (schema.propertyNames) errors.push(...check(schema.propertyNames, key, root, `${at}/<property-name>`));
      if (key in properties) errors.push(...check(properties[key], entry, root, `${at}/${key}`));
      else if (schema.additionalProperties === false) errors.push(`${at}: additional property ${key}`);
      else if (isObject(schema.additionalProperties) || typeof schema.additionalProperties === "boolean") {
        errors.push(...check(schema.additionalProperties, entry, root, `${at}/${key}`));
      }
    }
  }
  return errors;
}

export function validateSchema(schema, value) {
  return check(schema, value, schema, "$");
}

export function unclosedObjectSchemas(schema) {
  const paths = [];
  function visit(value, at) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    if (value.type === "object" && !("additionalProperties" in value)) paths.push(at);
    for (const [key, child] of Object.entries(value)) visit(child, `${at}/${key}`);
  }
  visit(schema, "$schema");
  return paths;
}
