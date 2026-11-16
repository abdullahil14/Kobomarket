const r=require('express').Router(); 

const {auth,requireRole}=require('../middleware/auth.middleware'); 
const Vendor=require('../models/Vendor.models'); 
const User=require('../models/User.models'); 

r.post('/apply',auth,async(req,res,next)=>{try{const v=await Vendor.create({userId:req.user._id.toString(),...req.body}); res.status(201).json({success:true,data:v});}catch(e){next(e)}}); 

r.get('/:id',async(req,res)=>{const v=await Vendor.findById(req.params.id); res.json({success:true,data:v})}); 

module.exports=r;