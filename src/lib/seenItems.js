/* ══ SEEN ITEMS (per tab) ══
   v2-48: generalises v2-43's seenLots.js to the other badged tabs. Each tab's red badge counts only the
   items the current user hasn't looked at yet: opening the tab marks everything currently counted as
   seen (the number vanishes) and a new item — or an item whose state changed, which gets a new key —
   brings it back. Kept per user, in this browser only (no DB change — see plan.md v2-48). If
   localStorage is unavailable (private window, blocked site data) it falls back to memory for the
   current page session. seenLots.js (Material) is deliberately left as it is. */
const KEY_PREFIX = 'ecoste_seen_';
const memoryFallback = {};

function storeKey(moduleName, username){ return KEY_PREFIX + moduleName + '_' + username; }

export function getSeenKeys(moduleName, username){
  if(!username) return new Set();
  const k = storeKey(moduleName, username);
  try{
    const raw = localStorage.getItem(k);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  }catch{
    return new Set(memoryFallback[k] || []);
  }
}

export function markKeysSeen(moduleName, username, keys){
  if(!username || !keys.length) return;
  const merged = [...new Set([...getSeenKeys(moduleName, username), ...keys])];
  const k = storeKey(moduleName, username);
  memoryFallback[k] = merged;
  try{ localStorage.setItem(k, JSON.stringify(merged)); }catch{ /* memory copy above covers this session */ }
}

// How many of `keys` this user hasn't seen yet — what a tab badge shows.
export function countUnseen(moduleName, username, keys){
  if(!username) return keys.length;
  const seen = getSeenKeys(moduleName, username);
  return keys.filter(k => !seen.has(k)).length;
}
