import { state } from './state.js';

// wa.me needs digits only, with the country code. The Team form saves a bare 10-digit number
// (no 91), so add it; a 12-digit number already starting 91 is used as is. Anything else is
// not a usable number.
export function normalizeWhatsAppNumber(raw){
  const digits=String(raw==null?'':raw).replace(/\D/g,'');
  if(digits.length===10) return '91'+digits;
  if(digits.length===12&&digits.startsWith('91')) return digits;
  return null;
}

// Number to WhatsApp for a project's supervisor, or null if there isn't a usable one (v2-45).
// projects.supervisor_wa is an optional per-project override (almost always blank); otherwise the
// number comes from the matching Team member — username first (what projects normally store),
// then display name. Never returns a placeholder.
export function supervisorWhatsApp(proj){
  const override=normalizeWhatsAppNumber(proj.supervisorWA);
  if(override) return override;
  const key=String(proj.supervisor||'').trim().toLowerCase();
  if(!key||key==='—') return null;
  const members=state.teamMembers||[];
  const member=members.find(m=>String(m.username||'').trim().toLowerCase()===key)
    ||members.find(m=>String(m.name||'').trim().toLowerCase()===key);
  return member?normalizeWhatsAppNumber(member.wa):null;
}
