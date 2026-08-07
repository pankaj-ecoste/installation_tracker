import { state } from './state.js';
import { db } from './supabaseClient.js';

// Fire-and-forget activity logging — covers the events you asked to track. Failures here
// are logged to console only, never block the actual user action that triggered them.
export async function logActivity(eventType, message){
  const entry={eventType, message, createdAt:new Date().toISOString()};
  state.activityLog.unshift(entry);
  try{
    await db.from('activity_log').insert({event_type:eventType, message, created_at:entry.createdAt});
  }catch(e){ console.warn('activity_log insert failed (has the table been created?)',e); }
}
