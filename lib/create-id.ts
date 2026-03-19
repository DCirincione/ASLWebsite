export const createId = () => {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};
