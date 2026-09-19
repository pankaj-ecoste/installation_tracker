/* ══ SEEN MATERIAL LOTS ══
   v2-43: the Material tab badge counts only lots the current user hasn't looked at yet, so it
   clears once they open the tab and comes back when a new lot is dispatched. Kept per user, in
   this browser only (no DB change — see plan.md v2-43). If localStorage is unavailable
   (private window, blocked site data) it falls back to memory for the current page session. */
const KEY_PREFIX = 'ecoste_seen_lots_';
const memoryFallback = {};

function keyFor(username){ return KEY_PREFIX + username; }

export function getSeenLotIds(username){
  if(!username) return new Set();
  try{
    const raw = localStorage.getItem(keyFor(username));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  }catch{
    return new Set(memoryFallback[username] || []);
  }
}

export function markLotsSeen(username, lotIds){
  if(!username || !lotIds.length) return;
  const merged = [...new Set([...getSeenLotIds(username), ...lotIds])];
  memoryFallback[username] = merged;
  try{ localStorage.setItem(keyFor(username), JSON.stringify(merged)); }catch{ /* memory copy above covers this session */ }
}
