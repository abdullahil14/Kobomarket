const crypto=require('crypto'); 
const h=(s)=>crypto.createHash('sha256').update(String(s)).digest('hex'); const rand=()=>crypto.randomBytes(32).toString('hex'); 
module.exports={hash: h, rand};