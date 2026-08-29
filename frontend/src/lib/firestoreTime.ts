/** Best-effort millis from Firestore number / Timestamp / ISO string. */
export function firestoreTimeMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return 0;
  }
  if (value && typeof value === "object") {
    const ts = value as {
      seconds?: number;
      nanoseconds?: number;
      toMillis?: () => number;
    };
    if (typeof ts.toMillis === "function") {
      const ms = ts.toMillis();
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
    if (typeof ts.seconds === "number") {
      return ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1_000_000);
    }
  }
  return 0;
}

export function cloudMessageSortKey(message: {
  clientCreatedAt?: unknown;
  createdAt?: unknown;
}): number {
  return firestoreTimeMs(message.clientCreatedAt) || firestoreTimeMs(message.createdAt);
}
