const r=require('express').Router(); 
const crypto=require('crypto'); 
const pool=require('../db/pg/pool.pg'); 
const {auth}=require('../middleware/auth.middleware'); 
const {getOrCreateAccount,transfer,createTx,postEntry}=require('../db/pg/ledger.pg'); 
const {initFunding,verifyTransaction,verifyWebhookSignature}=require('../services/payments.services'); 
const {checkIdempotency}=require('../middleware/idempotency.middleware'); 
const {hash}=require('../utils/crypto.utils');
r.get('/',auth,async(req,res,next)=>{try{const a=await getOrCreateAccount(await pool.connect().then(c=>c), 'USER', req.user._id.toString()).catch(()=>null); const client=await pool.connect(); try{const acc=await getOrCreateAccount(client,'USER',req.user._id.toString()); res.json({success:true,data:acc});}finally{client.release();}}catch(e){next(e)}});
r.get('/transactions',auth,async(req,res)=>{const rows=await pool.query('SELECT t.* FROM transactions t JOIN ledger_entries le ON le.transaction_id=t.id JOIN accounts a ON a.id=le.account_id WHERE a.owner_id=$1 ORDER BY t.created_at DESC LIMIT 50',[req.user._id.toString()]); res.json({success:true,data:rows.rows})});
r.post('/fund',auth,async(req,res,next)=>{try{const key=req.headers['idempotency-key']; const {hash:h,existing}=await checkIdempotency(key,req.body,req.user._id.toString()); if(existing) return res.json({success:true,data:existing.response, idempotent:true}); const amount=req.body.amountKobo; if(!amount||amount<=0) return res.status(400).json({success:false,error:{code:'BAD_REQUEST',message:'amountKobo required'}}); const ref='FUND-'+crypto.randomUUID(); const init=await initFunding({email:req.user.email,amountKobo:amount,reference:ref}); // store pending tx with idempotency

const client=await pool.connect(); try{await client.query('BEGIN'); const tx=await createTx(client,{reference:ref,type:'WALLET_FUND',idempotencyKey:key||null,requestHash:h,metadata:{amountKobo:amount,userId:req.user._id.toString(),authorizationUrl:init.authorization_url}}); await client.query('COMMIT'); res.status(201).json({success:true,data:{reference:ref,authorizationUrl:init.authorization_url,tx}});}catch(e){await client.query('ROLLBACK'); next(e);} finally{client.release();}}catch(e){next(e)}});

r.post('/webhooks/paystack',async(req,res,next)=>{try{const raw=req.rawBody||JSON.stringify(req.body); if(!verifyWebhookSignature(raw,req.headers['x-paystack-signature'])) return res.status(401).json({success:false,error:{code:'UNAUTHORIZED',message:'Bad signature'}}); 
const event=req.body; if(event.event!=='charge.success') return res.json({success:true}); 
const ref=event.data.reference; const client=await pool.connect(); try{await client.query('BEGIN'); const txR=await client.query('SELECT * FROM transactions WHERE reference=$1 FOR UPDATE',[ref]); if(!txR.rows.length) throw new Error('Unknown funding ref'); const tx=txR.rows[0]; if(tx.status==='COMPLETED' && tx.metadata?.credited) {await client.query('COMMIT'); return res.json({success:true,duplicate:true});}

const verified=await verifyTransaction(ref); if(verified.status!=='success') throw new Error('Verification failed'); 
const amount=event.data.amount; const userId=tx.metadata.userId; const userAcc=await getOrCreateAccount(client,'USER',userId); 
const ext=(await client.query("SELECT * FROM accounts WHERE owner_type='SYSTEM' AND owner_id='EXTERNAL_FUNDING'")).rows[0] || (await client.query("INSERT INTO accounts(owner_type,owner_id) VALUES('SYSTEM','EXTERNAL_FUNDING') RETURNING *")).rows[0];
  // credit user: debit EXTERNAL, credit USER via new tx linked? Use same tx: create entries
  await postEntry(client,{txId:tx.id,accountId:ext.id,direction:'debit',amount}); await postEntry(client,{txId:tx.id,accountId:userAcc.id,direction:'credit',amount}); await client.query('UPDATE transactions SET metadata=metadata||$1 WHERE id=$2',[JSON.stringify({credited:true}) ,tx.id]); await client.query('COMMIT'); 
  res.json({success:true});}catch(e){await client.query('ROLLBACK'); next(e);} finally{client.release();}}catch(e){next(e)}});

module.exports=r;