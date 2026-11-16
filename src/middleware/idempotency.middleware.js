// Generic idempotency for PG-backed endpoints: stored in transactions table.
// Usage: wrap handler; key from header, requestHash = sha256(body+user). Same key+same hash -> return stored response. Diff hash -> 409.
const pool=require('../db/pg/pool.pg'); 
const {hash}=require('../utils/crypto.utils');
async function checkIdempotency(key,body,userId){if(!key) return null; 
  const h=hash(JSON.stringify(body)+userId); 
  const r=await pool.query('SELECT * FROM transactions WHERE idempotency_key=$1',[key]); if(!r.rows[0]) return {hash:h,existing:null}; if(r.rows[0].request_hash!==h) {const e=new Error('Idempotency-Key reused with different body'); 
    e.status=409; 
    e.code='IDEMPOTENCY_CONFLICT'; throw e;} return {hash:h,existing:r.rows[0]};}

module.exports={checkIdempotency};