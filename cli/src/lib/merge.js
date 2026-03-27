import deepmerge from 'deepmerge';

/**
 * Custom array merge that deduplicates using Set-based union.
 */
const arrayUnion = (dest, src) => [...new Set([...dest, ...src])];

/**
 * Deep merge two config objects with array deduplication.
 * Null/undefined inputs are treated as empty objects.
 */
export function mergeConfig(existing, incoming) {
  const a = existing ?? {};
  const b = incoming ?? {};
  return deepmerge(a, b, { arrayMerge: arrayUnion });
}

/**
 * Subtract entries added by a preset from the current config.
 * For arrays: filters out items present in toRemove.
 * For objects: recursively subtracts.
 * For scalar keys that match: deletes the key.
 */
export function subtractConfig(current, toRemove) {
  if (current == null || toRemove == null) return current ?? {};

  const result = {};

  for (const key of Object.keys(current)) {
    if (!(key in toRemove)) {
      result[key] = current[key];
      continue;
    }

    const curVal = current[key];
    const remVal = toRemove[key];

    if (Array.isArray(curVal) && Array.isArray(remVal)) {
      const removeSet = new Set(remVal);
      const filtered = curVal.filter((item) => !removeSet.has(item));
      if (filtered.length > 0) {
        result[key] = filtered;
      }
    } else if (
      typeof curVal === 'object' &&
      curVal !== null &&
      typeof remVal === 'object' &&
      remVal !== null &&
      !Array.isArray(curVal)
    ) {
      const subtracted = subtractConfig(curVal, remVal);
      if (Object.keys(subtracted).length > 0) {
        result[key] = subtracted;
      }
    } else if (curVal !== remVal) {
      result[key] = curVal;
    }
    // If scalar values match, the key is omitted (deleted)
  }

  return result;
}
