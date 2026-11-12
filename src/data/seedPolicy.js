/* ══ When may loadAllData() insert demo rows into an EMPTY table? (plan.md v2-73) ══
   The seed blocks exist for the very first run against a brand-new database and for TEST_MODE. They must NOT fire in
   production because of a one-off empty read: SEED_TEAM contains a plaintext `admin` / PIN `1234`, and demo projects/DPRs
   would be written next to the real ones. So seeding needs TEST_MODE or an explicit VITE_ALLOW_SEED_ON_EMPTY=true. */
export function shouldSeed(rows,allowSeed,tableName){
  if(rows&&rows.length) return false;
  if(allowSeed) return true;
  console.warn('loadAllData: '+tableName+' came back empty — NOT inserting demo data (set VITE_ALLOW_SEED_ON_EMPTY=true only for a brand-new database).');
  return false;
}
