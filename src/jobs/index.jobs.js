const cron=require('node-cron'); 
const pool=require('../db/pg/pool.pg'); 
const cfg=require('../config'); 
const {completeSubOrder}=require('../services/orders.services'); 
const {processPayout}=require('../services/payments.services'); 
const {getOrCreateAccount,transfer}=require('../db/pg/ledger.pg');
function start(){ cron.schedule('*/15 * * * *', async()=>{ // auto-complete 72h after SHIPPED, skip DISPUTED
  const client=await pool.connect(); 
  try{const rows=await client.query(`SELECT * FROM sub_orders WHERE status='SHIPPED' AND shipped_at < now() - INTERVAL '${cfg.escrowHours} hours'`); for(const so of rows.rows){ 
    await client.query('BEGIN'); 
    try{await completeSubOrder(client,so); 
      await client.query('COMMIT');}catch(e){await client.query('ROLLBACK'); 
        console.error(e);}}}finally{client.release();}});
 cron.schedule('*/5 * * * *', async()=>{ const client=await pool.connect(); try{const rows=await client.query(`SELECT * FROM payouts WHERE status='PENDING'`); 
  for(const p of rows.rows){ await client.query('BEGIN'); 
    try{const res=await processPayout(p); 
    if(res.success){ const clearing=(await client.query("SELECT * FROM accounts WHERE owner_type='SYSTEM' AND owner_id='PLATFORM_PAYOUT_CLEARING'")).rows[0]; const ext=(await client.query("SELECT * FROM accounts WHERE owner_type='SYSTEM' AND owner_id='EXTERNAL_BANK'")).rows[0]||(await client.query("INSERT INTO accounts(owner_type,owner_id) VALUES('SYSTEM','EXTERNAL_BANK') RETURNING *")).rows[0]; await transfer(client,{reference:'PAYOUT-OUT-'+p.id,type:'PAYOUT_SETTLE',fromAccount:clearing,toAccount:ext,amount:p.amount_kobo,metadata:{payoutId:p.id}}); 
    await client.query("UPDATE payouts SET status='SUCCESS' WHERE id=$1",[p.id]); } 
    else { const clearing=(await client.query("SELECT * FROM accounts WHERE owner_type='SYSTEM' AND owner_id='PLATFORM_PAYOUT_CLEARING'")).rows[0]; const vendor=await getOrCreateAccount(client,'USER',p.vendor_id); 
      await transfer(client,{reference:'PAYOUT-FAIL-'+p.id,type:'PAYOUT_REVERSAL',fromAccount:clearing,toAccount:vendor,amount:p.amount_kobo,metadata:{payoutId:p.id}}); 
    await client.query("UPDATE payouts SET status='FAILED' WHERE id=$1",[p.id]); } 
    await client.query('COMMIT');}catch(e){await client.query('ROLLBACK'); 
        console.error(e);}}}finally{client.release();}}); }

module.exports={start};