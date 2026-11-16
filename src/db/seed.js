const mongoose=require('mongoose'); 
const bcrypt=require('bcryptjs'); 
const pool=require('./pg/pool.pg'); 
const {connect}=require('./mongo'); 
const User=require('../models/User.models'); 
const Product=require('../models/Product.models'); 
const Vendor=require('../models/Vendor.models'); 
const {getOrCreateAccount,postEntry,createTx}=require('./pg/ledger.pg'); 

(async()=>{await connect(); 
  await User.deleteMany({}); 
await Product.deleteMany({}); 
await Vendor.deleteMany({}); 
const pw=await bcrypt.hash('Password123!',10); 
const mk=async(email,name,roles)=>{
const u=await User.create({name,email,passwordHash:pw,roles,isEmailVerified:true}); 
const c=await pool.connect(); 
try{
  await c.query('BEGIN'); 
  const acc=await getOrCreateAccount(c,'USER',u._id.toString()); 
  const tx=await createTx(c,{reference:'SEED-'+u._id,type:'WALLET_FUND',metadata:{seed:true}}); 
  const ext=(await c.query("SELECT * FROM accounts WHERE owner_type='SYSTEM' AND owner_id='EXTERNAL_FUNDING'")).rows[0]||(await c.query("INSERT INTO accounts(owner_type,owner_id) VALUES('SYSTEM','EXTERNAL_FUNDING') RETURNING *")).rows[0]; 
  await postEntry(c,{txId:tx.id,accountId:ext.id,direction:'debit',amount:5000000}); 
  await postEntry(c,{txId:tx.id,accountId:acc.id,direction:'credit',amount:5000000}); 
  await c.query('COMMIT');}finally{c.release();} return u;}; 

const admin=await mk('admin@kobo.test','Admin',['admin','buyer']); 

const vendors=[]; for(let i=1;i<=3;i++){
  const v=await mk(`vendor${i}@kobo.test`,`Vendor ${i}`,['vendor','buyer']);

const store=await Vendor.create({userId:v._id.toString(),storeName:`Store ${i}`,description:'Great store',status:'approved'}); 
vendors.push(v); 
for(
  let j=1;j<=7;j++){if(vendors.length*7+j>20 && i===3) break; 
await Product.create({vendorId:v._id.toString(),name:`Product ${i}-${j}`,slug:`product-${i}-${j}`,description:'Quality product',priceKobo:10000*j,category:'general',stock:10,tags:['new']});}} 
for(let i=1;i<=5;i++) await mk(`buyer${i}@kobo.test`,`Buyer ${i}`,['buyer']); 

console.log('seeded admin@kobo.test / Password123!');
await pool.end(); 

await mongoose.disconnect(); })();