const jwt=require('jsonwebtoken'); 
const cfg=require('../config'); 
const {unauthorized,forbidden}=require('../utils/errors.utils'); 
const User=require('../models/User.models');
async function auth(req,res,next){try{const h=req.headers.authorization; if(!h?.startsWith('Bearer ')) throw unauthorized(); 
  const p=jwt.verify(h.slice(7),cfg.accessSecret); const u=await User.findById(p.sub); if(!u||u.status==='FROZEN') throw unauthorized('Account frozen or missing'); req.user=u; next();}catch(e){next(unauthorized(e.message))}}
function requireRole(...roles){return (req,res,next)=>{ if(!req.user) return next(unauthorized()); if(!roles.some(r=>req.user.roles.includes(r))) return next(forbidden('Missing role')); next();}}

module.exports={auth,requireRole};