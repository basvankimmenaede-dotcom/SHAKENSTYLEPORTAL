// Temporary diagnostic for generating a reproducible npm lockfile in CI.
const fs=require('node:fs');
const text=fs.readFileSync('package-lock.json','utf8');
const size=1200,parts=Math.ceil(text.length/size);
console.log('SHAKEN_LOCK_BEGIN:'+parts);
for(let i=0;i<parts;i++)console.log('SHAKEN_LOCK_CHUNK:'+i+':'+JSON.stringify(text.slice(i*size,(i+1)*size)));
console.log('SHAKEN_LOCK_END');
