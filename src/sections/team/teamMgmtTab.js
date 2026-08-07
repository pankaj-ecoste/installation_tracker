import { state } from '../../lib/state.js';
import { db } from '../../lib/supabaseClient.js';
import { showTeamDashboard } from '../../auth/teamAuth.js';
import { PERM_LABELS, ROLES } from '../../lib/constants.js';
import { canDo } from '../../lib/helpers.js';
import { memberToRow, rowToMember } from '../../lib/mappers.js';
import { closePanel, openPanel } from '../navigation.js';

/* ══ TEAM MANAGEMENT ══ */
export function renderTeamMgmt(){
  const el=document.getElementById('team-mgmt-content'); if(!el) return;
  const isAdmin=canDo('manageTeam');
  const rolesCount={};
  state.teamMembers.forEach(m=>{ rolesCount[m.role]=(rolesCount[m.role]||0)+1; });
  let html=
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'+
      '<div><h3 style="font-size:15px;font-weight:600;margin-bottom:2px">Team members</h3>'+
      '<div style="font-size:12px;color:#666">'+state.teamMembers.filter(m=>m.active).length+' active · '+state.teamMembers.length+' total</div></div>'+
      (isAdmin?'<button class="btn btn-green btn-sm" onclick="openAddMember()">+ Add member</button>':'')+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin-bottom:16px">'+
      Object.entries(ROLES).map(([k,r])=>'<div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:10px;text-align:center"><div style="font-size:20px;margin-bottom:4px">'+r.emoji+'</div><div style="font-size:11px;font-weight:600">'+r.label+'</div><div style="font-size:18px;font-weight:700;color:#1D9E75;margin-top:2px">'+(rolesCount[k]||0)+'</div></div>').join('')+
    '</div>'+
    '<table class="team-table">'+
      '<thead><tr><th>Member</th><th>Username</th>'+(isAdmin?'<th>PIN</th>':'')+'<th>Role</th><th>Department</th><th>Last login</th><th>Status</th>'+(isAdmin?'<th>Actions</th>':'')+'</tr></thead>'+
      '<tbody>'+state.teamMembers.map(m=>{
        const role=ROLES[m.role];
        const initials=m.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
        const colors=['#1D9E75','#185FA5','#7a4f00','#5e1a8b','#cc3333'];
        const bg=colors[m.id%colors.length];
        return '<tr>'+
          '<td><div style="display:flex;align-items:center;gap:8px"><div class="avatar-sm" style="background:'+bg+'">'+initials+'</div><div style="font-weight:600;font-size:13px">'+m.name+'</div></div></td>'+
          '<td style="font-family:monospace;font-size:12px;color:#555">'+m.username+'</td>'+
          (isAdmin?'<td><span id="pin-mask-'+m.id+'" style="font-family:monospace;font-size:12px">••••••</span><button class="icon-btn btn-sm" style="margin-left:4px" onclick="togglePinVisible('+m.id+',\''+m.pin+'\')" title="Show/hide PIN">👁</button></td>':'')+
          '<td><span class="role-badge '+role.color+'">'+role.emoji+' '+role.label+'</span></td>'+
          '<td style="color:#666;font-size:12px">'+m.dept+'</td>'+
          '<td style="color:#888;font-size:12px">'+m.lastLogin+'</td>'+
          '<td><span class="'+(m.active?'status-active':'status-inactive')+'">'+(m.active?'● Active':'○ Inactive')+'</span></td>'+
          (isAdmin?'<td><div style="display:flex;gap:4px">'+
            '<button class="icon-btn btn-sm" onclick="openEditMember('+m.id+')" title="Edit">✏️</button>'+
            '<button class="icon-btn btn-sm" onclick="toggleMemberStatus('+m.id+')" title="Toggle">'+(m.active?'🔕':'🔔')+'</button>'+
            (m.id!==state.currentUser?.id?'<button class="icon-btn btn-sm danger" onclick="deleteMember('+m.id+')" title="Remove">🗑</button>':'')+
          '</div></td>':'')+'</tr>';
      }).join('')+'</tbody></table>'+
    '<div style="margin-top:16px;background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:14px">'+
      '<div style="font-size:13px;font-weight:600;margin-bottom:4px">Role permissions</div>'+
      '<div style="font-size:12px;color:#888;margin-bottom:10px">'+(isAdmin?'Click ✅/❌ to toggle permissions (Admin row is locked).':'Current permissions per role.')+'</div>'+
      '<div style="overflow-x:auto"><table style="width:100%;font-size:12px;border-collapse:collapse">'+
        '<thead><tr><th style="text-align:left;padding:7px 8px;border-bottom:1px solid #e0e0e0;color:#555;white-space:nowrap">Permission</th>'+
          Object.entries(ROLES).map(([k,r])=>'<th style="padding:7px 8px;border-bottom:1px solid #e0e0e0;color:#555;text-align:center;white-space:nowrap">'+r.emoji+' '+r.label+'</th>').join('')+
        '</tr></thead><tbody>'+
        Object.entries(PERM_LABELS).map(([perm,label])=>
          '<tr><td style="padding:7px 8px;border-bottom:1px solid #f5f5f3;color:#444;white-space:nowrap">'+label+'</td>'+
            Object.entries(ROLES).map(([k,r])=>{
              const locked=k==='admin'; const clickable=isAdmin&&!locked;
              return '<td style="padding:7px 8px;border-bottom:1px solid #f5f5f3;text-align:center">'+
                '<span style="font-size:16px;cursor:'+(clickable?'pointer':'default')+';opacity:'+(clickable?1:0.6)+'" '+(clickable?'onclick="togglePerm(\''+k+'\',\''+perm+'\')"':'')+'>'+
                (r.can[perm]?'✅':'❌')+'</span></td>';
            }).join('')+
          '</tr>'
        ).join('')+
        '</tbody></table></div>'+
      (isAdmin?'<div style="font-size:11px;color:#1D9E75;margin-top:8px">✅ Changes apply immediately.</div>':'')+
    '</div>';
  el.innerHTML=html;
}

export function togglePerm(role,perm){ if(role==='admin') return; if(!canDo('editPermissions')) return; ROLES[role].can[perm]=!ROLES[role].can[perm]; renderTeamMgmt(); if(state.currentUser&&state.currentUser.role===role) showTeamDashboard(); }

export function openAddMember(){
  state.editingMemberId=null;
  document.getElementById('member-panel-title').textContent='Add team member';
  ['m-name','m-user','m-pin','m-dept','m-wa','m-email'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('m-role').value='viewer';
  document.getElementById('m-error').classList.add('hidden');
  updateRolePreview();
  openPanel('panel-add-member');
}
export function togglePinVisible(id,pin){
  const el=document.getElementById('pin-mask-'+id); if(!el) return;
  el.textContent=(el.textContent==='••••••')?pin:'••••••';
}
export function openEditMember(id){
  const m=state.teamMembers.find(x=>x.id===id); if(!m) return;
  state.editingMemberId=id;
  document.getElementById('member-panel-title').textContent='Edit member';
  document.getElementById('m-name').value=m.name;
  document.getElementById('m-user').value=m.username;
  document.getElementById('m-pin').value=m.pin;
  document.getElementById('m-role').value=m.role;
  document.getElementById('m-dept').value=m.dept;
  document.getElementById('m-wa').value=m.wa||'';
  document.getElementById('m-email').value=m.email||'';
  document.getElementById('m-error').classList.add('hidden');
  updateRolePreview();
  openPanel('panel-add-member');
}
export function updateRolePreview(){
  const role=document.getElementById('m-role')?.value;
  const el=document.getElementById('role-permissions-preview'); if(!el) return;
  if(!role||!ROLES[role]) return;
  el.innerHTML=Object.entries(ROLES[role].can).map(([p,v])=>'<div>'+(v?'✅':'❌')+' '+(PERM_LABELS[p]||p)+'</div>').join('');
}
export async function saveMember(){
  const name=document.getElementById('m-name').value.trim();
  const user=document.getElementById('m-user').value.trim().toLowerCase();
  const pin=document.getElementById('m-pin').value.trim();
  const err=document.getElementById('m-error');
  if(!name||!user||!pin){ err.classList.remove('hidden'); err.textContent='Name, username, and PIN are required.'; return; }
  // Strengthened from the original 4-digit minimum. Full hashing would mean moving PINs
  // onto Supabase Auth instead of this plain team_members table check — a bigger,
  // deployment-time architecture change to make once real client data is involved, not
  // something to do quietly in TEST_MODE. This is the strongest improvement possible
  // without that migration.
  if(!/^\d{6,}$/.test(pin)){ err.classList.remove('hidden'); err.textContent='PIN must be at least 6 digits.'; return; }
  if(/^(\d)\1+$/.test(pin)||'0123456789'.includes(pin)||'9876543210'.includes(pin)){ err.classList.remove('hidden'); err.textContent='That PIN is too easy to guess (repeated or sequential digits) — please choose a different one.'; return; }
  const dupe=state.teamMembers.find(m=>m.username===user&&m.id!==state.editingMemberId);
  if(dupe){ err.classList.remove('hidden'); err.textContent='Username "'+user+'" is already taken.'; return; }
  const data={name,username:user,pin,role:document.getElementById('m-role').value,dept:document.getElementById('m-dept').value.trim(),wa:document.getElementById('m-wa').value.trim(),email:document.getElementById('m-email').value.trim(),active:true,lastLogin:'Never'};
  if(state.editingMemberId){
    const idx=state.teamMembers.findIndex(m=>m.id===state.editingMemberId);
    state.teamMembers[idx]={...state.teamMembers[idx],...data};
    const {error}=await db.from('team_members').update(memberToRow(state.teamMembers[idx])).eq('id',state.editingMemberId);
    if(error){ console.error('Supabase update failed',error); err.classList.remove('hidden'); err.textContent='Could not save to database — check console.'; return; }
  } else {
    const {data:inserted,error}=await db.from('team_members').insert({id:state.nextMemberId,...memberToRow(data)}).select().single();
    if(error){ console.error('Supabase insert failed',error); err.classList.remove('hidden'); err.textContent='Could not save to database — check console.'; return; }
    state.nextMemberId++;
    state.teamMembers.push(rowToMember(inserted));
  }
  closePanel('panel-add-member'); renderTeamMgmt();
}
export async function toggleMemberStatus(id){
  const m=state.teamMembers.find(x=>x.id===id); if(!m) return;
  m.active=!m.active;
  const {error}=await db.from('team_members').update({active:m.active}).eq('id',id);
  if(error) console.error('Supabase update failed',error);
  renderTeamMgmt();
}
export async function deleteMember(id){
  if(!confirm('Remove this team member?')) return;
  const {error}=await db.from('team_members').delete().eq('id',id);
  if(error){ console.error('Supabase delete failed',error); alert('Could not delete from database — check console.'); return; }
  state.teamMembers=state.teamMembers.filter(m=>m.id!==id); renderTeamMgmt();
}

