export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonInputValue = string | number | boolean | JsonObject | JsonArray;

export function toJsonValue(value: unknown): JsonInputValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return {};

  const parsed = JSON.parse(serialized) as JsonValue;
  return parsed === null ? {} : parsed;
}
