import { db } from './supabaseClient.js';

export function pickFilesOrWarn(inputEl, max){
  const files=Array.from(inputEl.files);
  if(files.length>max){
    alert('You selected '+files.length+' files, but the limit here is '+max+'. Please choose '+max+' or fewer.');
    inputEl.value='';
    return null;
  }
  return files;
}
// Renders one document as a link, showing its real filename — handles both the new
// {name,url} format and any older plain-URL-string entries gracefully.
export function docLink(doc,i,style){
  const isObj=doc&&typeof doc==='object';
  const url=isObj?doc.url:doc;
  const name=isObj&&doc.name?doc.name:'Document '+(i+1);
  return '<a href="'+url+'" target="_blank" style="'+(style||'font-size:11px;color:#1D9E75')+'">📎 '+name+'</a>';
}
// v2-50: shows a document's real file name. New uploads carry {name,url}; older entries are plain
// URLs whose file name is "<timestamp>_<original name>" — strip the timestamp so staff see what they
// uploaded. Separate from docLink on purpose (other lists keep their existing labels). Escapes the
// name because it comes from a user's file.
export function docDisplayName(doc,i){
  const isObj=doc&&typeof doc==='object';
  if(isObj&&doc.name) return doc.name;
  const url=isObj?doc.url:doc;
  try{
    const last=decodeURIComponent(String(url||'').split('?')[0].split('/').pop()||'');
    const name=last.replace(/^\d{10,}_/,'');
    if(name) return name;
  }catch(e){ /* fall through */ }
  return 'Document '+(i+1);
}
export function namedDocLink(doc,i,style){
  const isObj=doc&&typeof doc==='object';
  const url=isObj?doc.url:doc;
  const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return '<a href="'+esc(url)+'" target="_blank" style="'+(style||'font-size:11px;color:#1D9E75')+'">📎 '+esc(docDisplayName(doc,i))+'</a>';
}
export async function uploadFiles(fileList, folder){
  const urls=[];
  for(const file of fileList){
    const path=folder+'/'+Date.now()+'_'+file.name.replace(/[^a-zA-Z0-9.\-_]/g,'_');
    const {error}=await db.storage.from('uploads').upload(path, file);
    if(error){ console.error('Upload failed for', file.name, error); continue; }
    const {data}=db.storage.from('uploads').getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}
// Same as uploadFiles, but also keeps the original filename — used wherever the document
// list needs to show real names instead of a generic "File 1, File 2..." sequence.
export async function uploadFilesWithNames(fileList, folder){
  const results=[];
  for(const file of fileList){
    const path=folder+'/'+Date.now()+'_'+file.name.replace(/[^a-zA-Z0-9.\-_]/g,'_');
    const {error}=await db.storage.from('uploads').upload(path, file);
    if(error){ console.error('Upload failed for', file.name, error); continue; }
    const {data}=db.storage.from('uploads').getPublicUrl(path);
    results.push({name:file.name, url:data.publicUrl});
  }
  return results;
}
export function fileUploadRowHTML(id, label, maxFiles){
  return '<div class="form-group" style="margin-bottom:10px">'+
    '<label class="form-label">'+label+' (up to '+maxFiles+' files)</label>'+
    '<input type="file" id="'+id+'" multiple accept="image/*,.pdf,.doc,.docx" style="font-size:12px">'+
    '<div id="'+id+'-list" style="font-size:11px;color:#1D9E75;margin-top:4px"></div>'+
  '</div>';
}
