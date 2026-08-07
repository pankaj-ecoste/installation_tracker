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
