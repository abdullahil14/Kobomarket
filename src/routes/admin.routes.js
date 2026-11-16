const r=require('express').Router(); 
const pool=require('../db/pg/pool.pg'); 
const {auth,requireRole}=require('../middleware/auth.middleware'); 
const User=require('../models/User.models'); 
const Vendor=require('../models/Vendor.models'); 

r.use(auth,requireRole('admin'));

r.get('/users',async(req,res)=>{const u=await User.find({email:new RegExp(req.query.q||'', 'i')}).limit(50); res.json({success:true,data:u})});

r.patch('/users/:id/freeze',async(req,res)=>{const u=await User.findByIdAndUpdate(req.params.id,{status:req.body.frozen?'FROZEN':'ACTIVE'},{new:true}); res.json({success:true,data:u})});

r.patch('/vendors/:id/approve',async(req,res)=>{const v=await Vendor.findByIdAndUpdate(req.params.id,{status:req.body.status||'approved'},{new:true}); if(v?.status==='approved') await User.findByIdAndUpdate(v.userId,{$addToSet:{roles:'vendor'}}); 

res.json({success:true,data:v})});

r.get('/wallets/:id/ledger',async(req,res)=>{const rows=await pool.query('SELECT le.*,t.type,t.reference FROM ledger_entries le JOIN transactions t ON t.id=le.transaction_id JOIN accounts a ON a.id=le.account_id WHERE a.owner_id=$1 ORDER BY le.created_at DESC',[req.params.id]); 
res.json({success:true,data:rows.rows})});

r.patch('/settings/commission',async(req,res)=>{await pool.query('UPDATE settings SET value=$1 WHERE key=$2',[String(req.body.commissionBps),'commission_bps']); process.env.COMMISSION_RATE_BPS=String(req.body.commissionBps); res.json({success:true})});

r.get('/reports/revenue',async(req,res)=>{const rows=await pool.query(`SELECT DATE(le.created_at) day, SUM(CASE WHEN le.direction='credit' THEN le.amount_kobo ELSE 0 END) revenue_kobo FROM ledger_entries le JOIN accounts a ON a.id=le.account_id JOIN transactions t ON t.id=le.transaction_id WHERE a.owner_id='PLATFORM_REVENUE' AND le.created_at BETWEEN $1 AND $2 GROUP BY day ORDER BY day`,[req.query.from||'2020-01-01',req.query.to||new Date().toISOString()]); 
res.json({success:true,data:rows.rows})});

r.get('/reports/top-vendors',async(req,res)=>{const rows=await pool.query(`SELECT vendor_id, SUM(total_kobo) total_kobo, COUNT(*) orders FROM sub_orders WHERE status='COMPLETED' AND created_at>=date_trunc('month',now()) GROUP BY vendor_id ORDER BY total_kobo DESC LIMIT 10`); res.json({success:true,data:rows.rows})});

r.get('/reports/escrow',async(req,res)=>{const rows=await pool.query(`SELECT balance_kobo FROM accounts WHERE owner_type='SYSTEM' AND owner_id='PLATFORM_ESCROW'`); res.json({success:true,data:{escrowKobo:rows.rows[0]?.balance_kobo||0}})});

r.get('/reports/reconciliation',async(req,res)=>{const rows=await pool.query(`SELECT a.id,a.owner_id,a.balance_kobo, COALESCE(SUM(CASE WHEN le.direction='credit' THEN le.amount_kobo ELSE -le.amount_kobo END),0) ledger_balance FROM accounts a LEFT JOIN ledger_entries le ON le.account_id=a.id GROUP BY a.id HAVING a.balance_kobo<>COALESCE(SUM(CASE WHEN le.direction='credit' THEN le.amount_kobo ELSE -le.amount_kobo END),0)`); 
res.json({success:true,data:rows.rows})});

module.exports=r;