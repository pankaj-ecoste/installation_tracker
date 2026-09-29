// Detects a new deploy while a staff member's tab stays open (this app has no service
// worker and vite hashes JS/CSS filenames, so an already-open tab never re-fetches them
// on its own — see plan.md "auto refresh" note). Rather than forcing a reload, which
// could wipe an unsaved DPR/Update Progress form, this shows a dismiss-free banner the
// user can tap when it's convenient.
const CURRENT_VERSION = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev';
const CHECK_INTERVAL_MS = 3 * 60 * 1000;
let bannerShown = false;

async function checkForUpdate(){
  if(bannerShown) return;
  try{
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if(!res.ok) return;
    const { version } = await res.json();
    if(version && version !== CURRENT_VERSION) showUpdateBanner();
  }catch(e){ /* offline / blip — next interval will retry */ }
}

function showUpdateBanner(){
  if(bannerShown) return;
  bannerShown = true;
  const bar = document.createElement('div');
  bar.id = 'update-available-banner';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#1D9E75;color:#fff;font-size:13px;padding:9px 16px;display:flex;align-items:center;justify-content:center;gap:12px;box-shadow:0 2px 6px rgba(0,0,0,.15)';
  bar.innerHTML = '<span>A new version of this app is available.</span>'
    + '<button style="background:#fff;color:#1D9E75;border:none;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer">Refresh now</button>';
  bar.querySelector('button').onclick = () => location.reload();
  document.body.prepend(bar);
}

export function initVersionCheck(){
  if(import.meta.env.DEV) return; // dev server has no dist/version.json; HMR handles this case instead
  checkForUpdate();
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') checkForUpdate();
  });
}
