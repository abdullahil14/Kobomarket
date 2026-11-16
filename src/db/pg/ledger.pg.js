const pool=require('./pool.pg');

// Double-entry: every movement creates debit+credit, updates cached balances in same tx.
// debit = money out (balance decreases), credit = money in (balance increases) for user wallets.
// For system accounts same convention, so SUM(credits-debits) == balance.

async function getOrCreateAccount(client,ownerType,ownerId){
  let r=await client.query('SELECT * FROM accounts WHERE owner_type=$1 AND owner_id=$2',[ownerType,ownerId]); 
  if(r.rows[0]) 
    return r.rows[0]; 
  r=await client.query('INSERT INTO accounts(owner_type,owner_id) VALUES($1,$2) RETURNING *',[ownerType,ownerId]); 
  return r.rows[0];}

async function postEntry(client,{txId,accountId,direction,amount}){
  if(amount<=0) throw new Error('amount>0'); 
  await client.query('INSERT INTO ledger_entries(transaction_id,account_id,direction,amount_kobo) VALUES($1,$2,$3,$4)',[txId,accountId,direction,amount]); const delta=direction==='credit'?amount:-amount; 
  await client.query('UPDATE accounts SET balance_kobo=balance_kobo+$1 WHERE id=$2',[delta,accountId]);}

async function createTx(client,{reference,type,idempotencyKey=null,requestHash=null,metadata={}}){
  const r=await client.query('INSERT INTO transactions(reference,type,idempotency_key,request_hash,metadata,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[reference,type,idempotencyKey,requestHash,metadata,'COMPLETED']); 
  return r.rows[0];}

async function transfer(client,{reference,type,fromAccount,toAccount,amount,metadata={}}){
  const tx=await createTx(client,{reference,type,metadata}); 
  await postEntry(client,{txId:tx.id,accountId:fromAccount.id,direction:'debit',amount}); 
  await postEntry(client,{txId:tx.id,accountId:toAccount.id,direction:'credit',amount}); return tx;}

module.exports={getOrCreateAccount,postEntry,createTx,transfer,pool};