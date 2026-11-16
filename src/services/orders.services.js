const pool=require('../db/pg/pool.pg'); 
const {getOrCreateAccount,transfer,createTx,postEntry}=require('../db/pg/ledger.pg'); 
const {commission}=require('../utils/money.utils'); 
const cfg=require('../config'); 
const Product=require('../models/Product.models'); 
const {emitFor}=require('./notify.services');
const TRANS={PENDING_PAYMENT:['PAID','CANCELLED'],PAID:['SHIPPED','CANCELLED','DISPUTED'],SHIPPED:['DELIVERED','DISPUTED'],DELIVERED:['COMPLETED','DISPUTED'],DISPUTED:['COMPLETED','CANCELLED'],COMPLETED:[],CANCELLED:[]};
async function releaseFunds(client,sub){ // escrow -> vendor (net) + revenue (commission)
  const escrow=(await client.query("SELECT * FROM accounts WHERE owner_type='SYSTEM' AND owner_id='PLATFORM_ESCROW'")).rows[0];
  const vendor=await getOrCreateAccount(client,'USER',sub.vendor_id); const rev=(await client.query("SELECT * FROM accounts WHERE owner_type='SYSTEM' AND owner_id='PLATFORM_REVENUE'")).rows[0];
  const comm=commission(sub.total_kobo,cfg.commissionBps); const net=sub.total_kobo-comm;
  await transfer(client,{reference:`release-${sub.id}-${Date.now()}`,type:'ESCROW_RELEASE',fromAccount:escrow,toAccount:vendor,amount:net,metadata:{subOrderId:sub.id}});
  if(comm>0) await transfer(client,{reference:`commission-${sub.id}-${Date.now()}`,type:'COMMISSION',fromAccount:escrow,toAccount:rev,amount:comm,metadata:{subOrderId:sub.id}});
}
async function completeSubOrder(client,sub){ await client.query('UPDATE sub_orders SET status=$1 WHERE id=$2',['COMPLETED',sub.id]); await releaseFunds(client,sub); }
module.exports={TRANS,releaseFunds,completeSubOrder};