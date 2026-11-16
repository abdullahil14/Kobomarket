// Mock provider mimics Paystack: init returns checkout URL, webhook re-verified via verify().
// Swap PAYMENT_PROVIDER=paystack to call real API (see README).
const crypto=require('crypto'); const cfg=require('../config');
async function initFunding({email,amountKobo,reference}){ if(cfg.provider==='paystack'){ const r=await fetch('https://api.paystack.co/transaction/initialize',{method:'POST',headers:{Authorization:`Bearer ${cfg.paystackSecret}`,'Content-Type':'application/json'},body:JSON.stringify({email,amount:amountKobo,reference,callback_url:`${process.env.FRONTEND_URL}/wallet/callback`})}); const j=await r.json(); return j.data; } return {authorization_url:`https://mock.paystack/checkout/${reference}`,reference,access_code:'mock'}; }
async function verifyTransaction(reference){ if(cfg.provider==='paystack'){ const r=await fetch(`https://api.paystack.co/transaction/verify/${reference}`,{headers:{Authorization:`Bearer ${cfg.paystackSecret}`}}); const j=await r.json(); return j.data; } return {status:'success',reference,amount:0}; }
function verifyWebhookSignature(rawBody,signature){ const h=crypto.createHmac('sha512',cfg.paystackSecret).update(rawBody).digest('hex'); return h===signature; }
async function processPayout(payout){ // mock: 90% success deterministic for tests via amount parity? Use random in prod, success here
  return {success:true,providerRef:'mock_'+payout.id}; }
module.exports={initFunding,verifyTransaction,verifyWebhookSignature,processPayout};