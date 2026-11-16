const pool=require('../db/pg/pool.pg'); (async()=>{ 
  const a=await pool.query(`SELECT COALESCE(SUM(balance_kobo),0) s FROM accounts WHERE owner_type='USER'`); 
  const sys=await pool.query(`SELECT owner_id,balance_kobo FROM accounts WHERE owner_type='SYSTEM'`); 
  const funded=await pool.query(`SELECT COALESCE(SUM(amount_kobo),0) s FROM ledger_entries le JOIN accounts ac ON ac.id=le.account_id WHERE ac.owner_id='EXTERNAL_FUNDING' AND le.direction='debit'`); 
  const paidOut=await pool.query(`SELECT COALESCE(SUM(amount_kobo),0) s FROM ledger_entries le JOIN accounts ac ON ac.id=le.account_id WHERE ac.owner_id='EXTERNAL_BANK' AND le.direction='credit'`); 
  const lhs=+a.rows[0].s + sys.rows.reduce((s,r)=>s+ +r.balance_kobo,0) - (+paidOut.rows[0].s); // EXTERNAL_BANK is outside system, adjust: total held = user+escrow+revenue+clearing ; funded-paidOut should equal it
  const held=sys.rows.filter(r=>['PLATFORM_ESCROW','PLATFORM_REVENUE','PLATFORM_PAYOUT_CLEARING'].includes(r.owner_id)).reduce((s,r)=>s+ +r.balance_kobo,0); 
  const expected=+funded.rows[0].s - +paidOut.rows[0].s; const actual=+a.rows[0].s+held; console.log({user:+a.rows[0].s,held,expected,actual}); console.log(actual===expected?'PASS':'FAIL'); await pool.end(); })();