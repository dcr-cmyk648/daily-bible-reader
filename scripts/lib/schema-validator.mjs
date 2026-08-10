function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isObject(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]);
}

function validFormat(value, format) {
  if (format === "date") return validDate(value);
  if (format === "date-time") return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
  if (format === "uri") {
    try {
      const url = new URL(value);
      return Boolean(url.protocol && url.hostname);
    } catch {
      return false;
    }
  }
  return true;
}

function decodePointerPart(value) {
  return value.replace(/~1/g, "/").replace(/~0/g, "~");
}

function resolvePointer(rootSchema, pointer) {
  if (pointer === "#") return rootSchema;
  if (!pointer.startsWith("#/")) throw new Error(`Unsupported schema pointer ${pointer}.`);
  return pointer.slice(2).split("/").map(decodePointerPart).reduce((value, key) => value && value[key], rootSchema);
}

function resolveRef(reference, context) {
  if (reference.startsWith("#")) {
    const schema = resolvePointer(context.rootSchema, reference);
    if (!schema) throw new Error(`Unresolved schema reference ${reference}.`);
    return {schema, rootSchema: context.rootSchema};
  }
  const [filename, fragment] = reference.split("#", 2);
  const rootSchema = context.externalSchemas[filename];
  if (!rootSchema) throw new Error(`Unresolved external schema reference ${filename}.`);
  const schema = fragment ? resolvePointer(rootSchema, `#${fragment}`) : rootSchema;
  if (!schema) throw new Error(`Unresolved external schema reference ${reference}.`);
  return {schema, rootSchema};
}

function inspect(value, schema, context, instancePath, errors) {
  if (typeof schema === "boolean") {
    if (!schema) errors.push(`${instancePath}: value is forbidden`);
    return;
  }
  if (!schema || typeof schema !== "object") throw new Error(`${instancePath}: invalid schema node.`);

  if (schema.$ref) {
    const resolved = resolveRef(schema.$ref, context);
    inspect(value, resolved.schema, {...context, rootSchema: resolved.rootSchema}, instancePath, errors);
    return;
  }

  if (schema.const !== undefined && !sameValue(value, schema.const)) {
    errors.push(`${instancePath}: must equal ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => sameValue(value, candidate))) {
    errors.push(`${instancePath}: must be one of ${schema.enum.map(JSON.stringify).join(", ")}`);
  }

  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach((subschema) => inspect(value, subschema, context, instancePath, errors));
  }
  if (schema.not) {
    const candidateErrors = [];
    inspect(value, schema.not, context, instancePath, candidateErrors);
    if (!candidateErrors.length) errors.push(`${instancePath}: matches a forbidden schema`);
  }
  if (schema.if) {
    const conditionErrors = [];
    inspect(value, schema.if, context, instancePath, conditionErrors);
    if (!conditionErrors.length && schema.then) inspect(value, schema.then, context, instancePath, errors);
    if (conditionErrors.length && schema.else) inspect(value, schema.else, context, instancePath, errors);
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(value, type))) {
      errors.push(`${instancePath}: must have type ${types.join(" or ")}`);
      return;
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${instancePath}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${instancePath}: longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${instancePath}: does not match ${schema.pattern}`);
    if (schema.format && !validFormat(value, schema.format)) errors.push(`${instancePath}: invalid ${schema.format}`);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${instancePath}: below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${instancePath}: above maximum ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(`${instancePath}: must exceed ${schema.exclusiveMinimum}`);
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) errors.push(`${instancePath}: must be below ${schema.exclusiveMaximum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${instancePath}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${instancePath}: more than ${schema.maxItems} items`);
    if (schema.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) errors.push(`${instancePath}: items must be unique`);
    }
    if (schema.items) value.forEach((item, index) => inspect(item, schema.items, context, `${instancePath}[${index}]`, errors));
  }

  if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    (schema.required || []).forEach((key) => {
      if (!Object.hasOwn(value, key)) errors.push(`${instancePath}.${key}: required property is missing`);
    });
    Object.entries(properties).forEach(([key, propertySchema]) => {
      if (Object.hasOwn(value, key)) inspect(value[key], propertySchema, context, `${instancePath}.${key}`, errors);
    });
    Object.keys(value).filter((key) => !Object.hasOwn(properties, key)).forEach((key) => {
      if (schema.additionalProperties === false) errors.push(`${instancePath}.${key}: additional property is not allowed`);
      else if (isObject(schema.additionalProperties) || typeof schema.additionalProperties === "boolean") {
        inspect(value[key], schema.additionalProperties, context, `${instancePath}.${key}`, errors);
      }
    });
  }
}

export function validateAgainstSchema(value, schema, options = {}) {
  const errors = [];
  inspect(value, schema, {
    rootSchema: schema,
    externalSchemas: options.externalSchemas || {}
  }, options.instancePath || "$", errors);
  return errors;
}

export function assertSchemaValid(value, schema, options = {}) {
  const errors = validateAgainstSchema(value, schema, options);
  if (errors.length) {
    const label = options.label || "Value";
    throw new Error(`${label} failed schema validation:\n- ${errors.join("\n- ")}`);
  }
  return value;
}
