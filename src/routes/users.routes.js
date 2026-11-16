const r=require('express').Router(); 
const {auth}=require('../middleware/auth.middleware'); 
r.get('/me',auth,(req,res)=>res.json({success:true,data:{id:req.user._id,email:req.user.email,name:req.user.name,roles:req.user.roles,status:req.user.status}})); 
r.patch('/me',auth,async(req,res)=>{Object.assign(req.user,{name:req.body.name||req.user.name}); 
await req.user.save(); 
res.json({success:true,data:req.user})}); 

module.exports=r;