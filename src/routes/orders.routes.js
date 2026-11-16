const r=require('express').Router(); 
const crypto=require('crypto'); 
const pool=require('../db/pg/pool.pg'); 
const {auth,requireRole}=require('../middleware/auth.middleware'); 
const {getOrCreateAccount,transfer}=require('../db/pg/ledger.pg'); 
const {checkIdempotency}=require('../middleware/idempotency.middleware'); 
const Product=require('../models/Product.models'); 
const Cart=require('../models/Cart.models'); 
const {emitFor}=require('../services/notify.services'); 
const {completeSubOrder,TRANS}=require('../services/orders.services');
r.post('/checkout',auth,async(req,res,next)=>{try{const key=req.headers['idempotency-key']; if(!key) return res.status(400).json({success:false,error:{code:'BAD_REQUEST',message:'Idempotency-Key required'}}); 
const cart=await Cart.findOne({userId:req.user._id}); if(!cart||!cart.items.length) return res.status(400).json({success:false,error:{code:'BAD_REQUEST',message:'Cart empty'}}); 
const {hash:h,existing}=await checkIdempotency(key,{items:cart.items},req.user._id.toString()); if(existing) return res.json({success:true,data:existing.response,idempotent:true});
  // Validate price/stock fresh from Mongo
  let total=0; const fresh=[]; for(const it of cart.items){const p=await Product.findById(it.productId); 
    if(!p||!p.isActive||p.stock<it.qty) 
      return res.status(400).json({success:false,error:{code:'INSUFFICIENT_STOCK',message:`Stock issue for ${it.name}`}}); fresh.push({...it,unitPriceKobo:p.priceKobo}); total+=p.priceKobo*it.qty;}
  const client=await pool.connect(); let orderId; try{await client.query('BEGIN'); const buyer=await getOrCreateAccount(client,'USER',req.user._id.toString()); const locked=(await client.query('SELECT * FROM accounts WHERE id=$1 FOR UPDATE',[buyer.id])).rows[0]; if(locked.balance_kobo<total) throw Object.assign(new Error('Insufficient balance'),{status:400,code:'INSUFFICIENT_FUNDS'}); const escrow=(await client.query("SELECT * FROM accounts WHERE owner_type='SYSTEM' AND owner_id='PLATFORM_ESCROW'")).rows[0]; const o=await client.query('INSERT INTO orders(buyer_id,total_kobo) VALUES($1,$2) RETURNING *',[req.user._id.toString(),total]); orderId=o.rows[0].id;
    // group by vendor
    const groups={}; fresh.forEach(i=>{(groups[i.vendorId]=groups[i.vendorId]||[]).push(i)}); const subIds={};
    for(const [vendorId,items] of Object.entries(groups)){const st=items.reduce((s,i)=>s+i.unitPriceKobo*i.qty,0); const so=await client.query('INSERT INTO sub_orders(order_id,vendor_id,total_kobo) VALUES($1,$2,$3) RETURNING *',[orderId,vendorId,st]); subIds[vendorId]=so.rows[0].id; for(const i of items) await client.query('INSERT INTO order_items(sub_order_id,product_id,vendor_id,name,unit_price_kobo,qty,line_total_kobo) VALUES($1,$2,$3,$4,$5,$6,$7)',[so.rows[0].id,i.productId,vendorId,i.name,i.unitPriceKobo,i.qty,i.unitPriceKobo*i.qty]);}
    await transfer(client,{reference:'ESCROW-'+orderId,type:'ESCROW_HOLD',fromAccount:buyer,toAccount:escrow,amount:total,metadata:{orderId}}); await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK'); return next(e);} finally{client.release();}
  // Stock decrement AFTER PG commit; compensate on failure (saga)
  try{for(const it of fresh){const upd=await Product.updateOne({_id:it.productId,stock:{$gte:it.qty}},{$inc:{stock:-it.qty}}); if(upd.modifiedCount!==1) throw new Error('Stock race for '+it.productId);}}catch(e){ // compensate: refund escrow + cancel
    const c2=await pool.connect(); try{await c2.query('BEGIN'); const buyer=await getOrCreateAccount(c2,'USER',req.user._id.toString()); 
      const escrow=(await c2.query("SELECT * FROM accounts WHERE owner_type='SYSTEM' AND owner_id='PLATFORM_ESCROW'")).rows[0]; await transfer(c2,{reference:'REFUND-'+orderId,type:'ESCROW_REFUND',fromAccount:escrow,toAccount:buyer,amount:total,metadata:{orderId}}); await c2.query("UPDATE sub_orders SET status='CANCELLED' WHERE order_id=$1",[orderId]); await c2.query("UPDATE orders SET status='CANCELLED' WHERE id=$1",[orderId]); await c2.query('COMMIT');}catch(_){await c2.query('ROLLBACK');} finally{c2.release();} return next(e);}
  // store idempotency response in transactions? Use orders table + a tx row
  const c3=await pool.connect(); try{await c3.query('INSERT INTO transactions(reference,type,idempotency_key,request_hash,metadata,response) VALUES($1,$2,$3,$4,$5,$6)',['ORDER-'+orderId,'ORDER',key,h,JSON.stringify({orderId}),JSON.stringify({orderId,totalKobo:total})]);}catch(_){} finally{c3.release();}
  await Cart.deleteOne({userId:req.user._id}); emitFor(req.user._id.toString(),'ORDER_PLACED','Order placed','Your order is in escrow'); 
  res.status(201).json({success:true,data:{orderId,totalKobo:total}});}catch(e){next(e)}});
r.get('/',auth,async(req,res)=>{const rows=await pool.query('SELECT * FROM orders WHERE buyer_id=$1 ORDER BY created_at DESC',[req.user._id.toString()]); res.json({success:true,data:rows.rows})});
r.get('/:id',auth,async(req,res)=>{const rows=await pool.query('SELECT * FROM orders WHERE id=$1',[req.params.id]); res.json({success:true,data:rows.rows[0]||null})});
r.post('/:id/cancel',auth,async(req,res,next)=>{try{const client=await pool.connect(); try{await client.query('BEGIN'); 
  const subs=await client.query('SELECT * FROM sub_orders WHERE order_id=$1 FOR UPDATE',[req.params.id]); if(subs.rows.some(s=>s.status==='SHIPPED'||s.status==='DELIVERED'||s.status==='COMPLETED')) throw Object.assign(new Error('Cannot cancel after shipped'),{status:400}); const order=(await client.query('SELECT * FROM orders WHERE id=$1',[req.params.id])).rows[0]; const buyer=await getOrCreateAccount(client,'USER',order.buyer_id); 
  const escrow=(await client.query("SELECT * FROM accounts WHERE owner_type='SYSTEM' AND owner_id='PLATFORM_ESCROW'")).rows[0]; await transfer(client,{reference:'CANCEL-'+req.params.id,type:'ESCROW_REFUND',fromAccount:escrow,toAccount:buyer,amount:order.total_kobo,metadata:{orderId:req.params.id}}); 
  await client.query("UPDATE sub_orders SET status='CANCELLED' WHERE order_id=$1",[req.params.id]); 
  await client.query("UPDATE orders SET status='CANCELLED' WHERE id=$1",[req.params.id]); 
  await client.query('COMMIT'); res.json({success:true});}catch(e){await client.query('ROLLBACK'); next(e);} finally{client.release();}}catch(e){next(e)}});

module.exports=r;