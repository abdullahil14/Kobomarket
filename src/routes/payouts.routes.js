const r=require('express').Router(); 
const pool=require('../db/pg/pool.pg'); 
const {auth,requireRole}=require('../middleware/auth.middleware'); 
const cfg=require('../config'); 
const {getOrCreateAccount,transfer}=require('../db/pg/ledger.pg'); 
const {checkIdempotency}=require('../middleware/idempotency.middleware'); 
const {emitFor}=require('../services/notify.services');
r.post('/',auth,requireRole('vendor','admin'),async(req,res,next)=>{try{const key=req.headers['idempotency-key']; 
const {hash:h,existing}=await checkIdempotency(key,req.body,req.user._id.toString()); if(existing) return res.json({success:true,data:existing.response,idempotent:true}); const amount=req.body.amountKobo; if(amount<cfg.payoutMinKobo) return res.status(400).json({success:false,error:{code:'BAD_REQUEST',message:`Minimum ${cfg.payoutMinKobo} kobo`}});
const client=await pool.connect(); try{await client.query('BEGIN'); 
const vendor=await getOrCreateAccount(client,'USER',req.user._id.toString()); 
const locked=(await client.query('SELECT * FROM accounts WHERE id=$1 FOR UPDATE',[vendor.id])).rows[0]; // row lock serialises concurrent payouts - second waits, then sees reduced balance / pending check
  const pend=await client.query("SELECT 1 FROM payouts WHERE vendor_id=$1 AND status='PENDING'",[req.user._id.toString()]); if(pend.rows.length) throw Object.assign(new Error('One pending payout already'),{status:409}); if(locked.balance_kobo<amount) throw Object.assign(new Error('Insufficient balance'),{status:400,code:'INSUFFICIENT_FUNDS'}); 
  const clearing=(await client.query("SELECT * FROM accounts WHERE owner_type='SYSTEM' AND owner_id='PLATFORM_PAYOUT_CLEARING'")).rows[0]; await transfer(client,{reference:'PAYOUT-'+Date.now()+'-'+req.user._id,type:'PAYOUT',fromAccount:vendor,toAccount:clearing,amount,metadata:{vendorId:req.user._id.toString()}}); const p=await client.query('INSERT INTO payouts(vendor_id,amount_kobo,idempotency_key) VALUES($1,$2,$3) RETURNING *',[req.user._id.toString(),amount,key||null]); await client.query('COMMIT'); res.status(201).json({success:true,data:p.rows[0]});}catch(e){await client.query('ROLLBACK'); next(e);} finally{client.release();}}catch(e){next(e)}});
r.get('/',auth,async(req,res)=>{const rows=await pool.query('SELECT * FROM payouts WHERE vendor_id=$1 ORDER BY created_at DESC',[req.user._id.toString()]); res.json({success:true,data:rows.rows})});

module.exports=r;