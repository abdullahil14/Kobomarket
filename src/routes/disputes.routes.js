const r=require('express').Router(); 
const pool=require('../db/pg/pool.pg'); 
const {auth,requireRole}=require('../middleware/auth.middleware'); 
const {getOrCreateAccount,transfer}=require('../db/pg/ledger.pg'); 
const {commission}=require('../utils/money.utils'); 
const cfg=require('../config'); 
const {emitFor}=require('../services/notify.services');

r.post('/sub-orders/:id/disputes',auth,async(req,res,next)=>{try{const client=await pool.connect(); try{await client.query('BEGIN'); 
const so=(await client.query('SELECT * FROM sub_orders WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0]; if(!['SHIPPED','DELIVERED'].includes(so.status)) throw Object.assign(new Error('Cannot dispute this state'),{status:400}); 
const d=await client.query('INSERT INTO disputes(sub_order_id,buyer_id,reason,evidence) VALUES($1,$2,$3,$4) RETURNING *',[req.params.id,req.user._id.toString(),req.body.reason,JSON.stringify(req.body.evidence||[])]); await client.query("UPDATE sub_orders SET status='DISPUTED' WHERE id=$1",[req.params.id]); await client.query('COMMIT'); emitFor(so.vendor_id,'DISPUTE_OPENED','Dispute opened','A dispute was opened'); 
res.status(201).json({success:true,data:d.rows[0]});}catch(e){await client.query('ROLLBACK'); next(e);} finally{client.release();}}catch(e){next(e)}});
r.get('/',auth,requireRole('admin'),async(req,res)=>{const rows=await pool.query('SELECT * FROM disputes ORDER BY created_at DESC'); res.json({success:true,data:rows.rows})});

r.patch('/:id/resolve',auth,requireRole('admin'),async(req,res,next)=>{try{const {resolution,refundKobo=0,note}=req.body; 
const client=await pool.connect(); 
try{await client.query('BEGIN'); 
const d=(await client.query('SELECT * FROM disputes WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0]; if(!d||d.status!=='OPEN') throw Object.assign(new Error('Dispute not open'),{status:400}); 
const so=(await client.query('SELECT * FROM sub_orders WHERE id=$1 FOR UPDATE',[d.sub_order_id])).rows[0]; 
const order=(await client.query('SELECT * FROM orders WHERE id=$1',[so.order_id])).rows[0]; 
const escrow=(await client.query("SELECT * FROM accounts WHERE owner_type='SYSTEM' AND owner_id='PLATFORM_ESCROW'")).rows[0]; 
const vendor=await getOrCreateAccount(client,'USER',so.vendor_id); const buyer=await getOrCreateAccount(client,'USER',order.buyer_id); 
const rev=(await client.query("SELECT * FROM accounts WHERE owner_type='SYSTEM' AND owner_id='PLATFORM_REVENUE'")).rows[0];
if(resolution==='FULL_REFUND'){ await transfer(client,{reference:'DISPUTE-FULL-'+d.id,type:'DISPUTE_REFUND',fromAccount:escrow,toAccount:buyer,amount:so.total_kobo,metadata:{disputeId:d.id}}); await client.query("UPDATE sub_orders SET status='CANCELLED' WHERE id=$1",[so.id]); }
else if(resolution==='PARTIAL_REFUND'){ 
const vendorPart=so.total_kobo-refundKobo; 
const comm=commission(vendorPart,cfg.commissionBps); await transfer(client,{reference:'DISPUTE-PART-B-'+d.id,type:'DISPUTE_REFUND',fromAccount:escrow,toAccount:buyer,amount:refundKobo,metadata:{disputeId:d.id}}); if(vendorPart-comm>0) await transfer(client,{reference:'DISPUTE-PART-V-'+d.id,type:'ESCROW_RELEASE',fromAccount:escrow,toAccount:vendor,amount:vendorPart-comm,metadata:{disputeId:d.id}}); if(comm>0) await transfer(client,{reference:'DISPUTE-PART-C-'+d.id,type:'COMMISSION',fromAccount:escrow,toAccount:rev,amount:comm,metadata:{disputeId:d.id}}); 
await client.query("UPDATE sub_orders SET status='COMPLETED' WHERE id=$1",[so.id]); }
else if(resolution==='REJECT'){ const comm=commission(so.total_kobo,cfg.commissionBps); await transfer(client,{reference:'DISPUTE-REJ-V-'+d.id,type:'ESCROW_RELEASE',fromAccount:escrow,toAccount:vendor,amount:so.total_kobo-comm,metadata:{disputeId:d.id}}); 
if(comm>0) await transfer(client,{reference:'DISPUTE-REJ-C-'+d.id,type:'COMMISSION',fromAccount:escrow,toAccount:rev,amount:comm,metadata:{disputeId:d.id}}); await client.query("UPDATE sub_orders SET status='COMPLETED' WHERE id=$1",[so.id]); }
else throw Object.assign(new Error('Invalid resolution'),{status:400});
await client.query('UPDATE disputes SET status=$1,resolution=$2,resolved_by=$3,resolution_note=$4,refund_kobo=$5 WHERE id=$6',['RESOLVED',resolution,req.user._id.toString(),note,refundKobo,d.id]); await client.query('COMMIT'); emitFor(order.buyer_id,'DISPUTE_RESOLVED','Dispute resolved',resolution); 
res.json({success:true});}catch(e){await client.query('ROLLBACK'); next(e);} finally{client.release();}}catch(e){next(e)}});

module.exports=r;