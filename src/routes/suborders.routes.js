const r=require('express').Router(); 
const pool=require('../db/pg/pool.pg'); 
const {auth}=require('../middleware/auth.middleware'); 
const {completeSubOrder,TRANS}=require('../services/orders.services'); 
const {emitFor}=require('../services/notify.services');
r.patch('/:id/ship',auth,async(req,res,next)=>{try{const client=await pool.connect(); try{await client.query('BEGIN'); const so=(await client.query('SELECT * FROM sub_orders WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0]; 
  if(!so||so.vendor_id!==req.user._id.toString()) throw Object.assign(new Error('Not your sub-order'),{status:403}); if(so.status!=='PAID') throw Object.assign(new Error('Invalid transition'),{status:400}); await client.query("UPDATE sub_orders SET status='SHIPPED',shipped_at=now() WHERE id=$1",[req.params.id]); await client.query('COMMIT'); emitFor(so.vendor_id,'ORDER_SHIPPED','Order shipped','Sub-order shipped'); res.json({success:true});}catch(e){await client.query('ROLLBACK'); next(e);} finally{client.release();}}catch(e){next(e)}});
r.patch('/:id/confirm',auth,async(req,res,next)=>{try{const client=await pool.connect(); try{await client.query('BEGIN'); 
  const so=(await client.query('SELECT * FROM sub_orders WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0]; 
  const order=(await client.query('SELECT * FROM orders WHERE id=$1',[so.order_id])).rows[0]; 
  if(order.buyer_id!==req.user._id.toString()) throw Object.assign(new Error('Not your order'),{status:403}); if(so.status!=='SHIPPED') throw Object.assign(new Error('Invalid transition'),{status:400}); 
  await client.query("UPDATE sub_orders SET status='DELIVERED',delivered_at=now() WHERE id=$1",[req.params.id]); // DELIVERED -> COMPLETED immediately on confirm in this impl (release funds)
  const updated=(await client.query('SELECT * FROM sub_orders WHERE id=$1',[req.params.id])).rows[0]; await completeSubOrder(client,updated); await client.query('COMMIT'); emitFor(so.vendor_id,'FUNDS_RELEASED','Funds released','Escrow released to your wallet'); 
res.json({success:true});}catch(e){await client.query('ROLLBACK'); next(e);} finally{client.release();}}catch(e){next(e)}});

module.exports=r;