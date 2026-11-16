const r=require('express').Router(); 
const bcrypt=require('bcryptjs'); 
const jwt=require('jsonwebtoken'); 
const Joi=require('joi'); 
const cfg=require('../config'); 
const User=require('../models/User.models'); 
const pool=require('../db/pg/pool.pg'); 
const {getOrCreateAccount}=require('../db/pg/ledger.pg'); 
const {hash,rand}=require('../utils/crypto.utils'); 
const {bad,unauthorized}=require('../utils/errors.utils'); 
const validate=require('../middleware/validate.middleware'); 

const rateLimit=require('express-rate-limit');

const loginLimiter=rateLimit({windowMs:15*60*1000,max:5,keyGenerator:(req)=>req.body?.email+'|'+req.ip,message:{success:false,error:{code:'RATE_LIMITED',message:'Too many login attempts'}}});

const regSchema=Joi.object({name:Joi.string().required(),email:Joi.string().email().required(),password:Joi.string().min(8).required()});

const loginSchema=Joi.object({email:Joi.string().email().required(),password:Joi.string().min(8).required()});

function tokens(u){
  const access = jwt.sign(
    { id: u._id.toString(), email: u.email },
    cfg.JWT_SECRET || cfg.jwtSecret || process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '15m' }
  );
  const refresh = rand();
  return { access, refresh, accessToken: access, refreshToken: refresh };
}

r.post('/register',validate(regSchema),async(req,res,next)=>{
  try{
    const {name,email,password}=req.body; 
    if(await User.findOne({email})) throw bad('Email exists'); 
const passwordHash=await bcrypt.hash(password,10); 

const token=rand(); 
const user=new User({name,email,passwordHash,emailVerifyTokenHash:hash(token),emailVerifyExpires:new Date(Date.now()+3600e3)}); await user.save();

  // Cross-DB: if PG wallet fails, compensate by deleting Mongo user (saga). Outbox alternative documented in README.

const client=await pool.connect(); 
try{await client.query('BEGIN'); 
  await getOrCreateAccount(client,'USER',user._id.toString()); await client.query('COMMIT');}catch(e){await client.query('ROLLBACK'); 
    await User.deleteOne({_id:user._id}); 
    throw e;} finally{client.release();}

console.log('[EMAIL] verify token for',email,token); res.status(201).json({success:true,data:{id:user._id,email,verifyTokenForDev:token}});
}catch(e){next(e)}
});

r.post('/login',loginLimiter,validate(loginSchema),async(req,res,next)=>{
  try{
    const {email,password}=req.body; 
    const u=await User.findOne({email}); 
    if(!u||!(await bcrypt.compare(password,u.passwordHash))) throw unauthorized('Invalid credentials'); const t=tokens(u); 
u.refreshTokens=[{tokenHash:hash(t.refresh),createdAt:new Date()}]; 
await u.save(); 
res.json({success:true,data:t});
}catch(e){next(e)}
});

r.post('/verify-email', async(req,res,next)=>{
  try{
    const token = req.body.token || req.query.token;
    if(!token) throw bad('Token required');
    const u = await User.findOne({ emailVerifyTokenHash: hash(token) });
    if(!u || u.emailVerifyExpires < Date.now()) throw bad('Invalid or expired token');
    u.emailVerified = true;
    u.isVerified = true;
    u.emailVerifyTokenHash = undefined;
    u.emailVerifyExpires = undefined;
    await u.save();
    res.json({success:true, message:'Email verified'});
  }catch(e){next(e)}
});

r.post('/logout',async(req,res,next)=>{
  try{
    const u=await User.findOne({'refreshTokens.tokenHash':hash(req.body.refresh)}); 
if(u){u.refreshTokens=[]; await u.save();} 
res.json({success:true});
}catch(e){next(e)}
});

r.post('/forgot-password',async(req,res,next)=>{
  try{
    const u=await User.findOne({email:req.body.email}); 
    if(u){const tok=rand(); 
u.passwordResetTokenHash=hash(tok); 
u.passwordResetExpires=new Date(Date.now()+3600e3); await u.save(); 
console.log('[EMAIL] reset token',tok);} 
res.json({success:true});
}catch(e){next(e)}
});

r.post('/reset-password',async(req,res,next)=>{
  try{
    const u=await User.findOne({passwordResetTokenHash:hash(req.body.token)}); if(!u||u.passwordResetExpires<Date.now()) throw bad('Invalid token'); 
    u.passwordHash=await bcrypt.hash(req.body.password,10); 
u.passwordResetTokenHash=undefined; 
u.refreshTokens=[]; 
await u.save(); 
res.json({success:true});
}catch(e){next(e)}
});

module.exports=r;