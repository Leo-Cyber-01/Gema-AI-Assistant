/**
 * Miya Bridge Client (Placeholder)
 * Tool calling has been removed to keep only the conversation engine.
 */

export async function handleToolCall(name, args = {}) {
  console.warn(`[MiyaBridge] Tool calling is disabled: ${name}`);
  return `Tool calling is disabled.`;
}

export async function checkMiyaStatus() {
  return { online: false };
}
