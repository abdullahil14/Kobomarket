const r=require('express').Router(); 
const {auth}=require('../middleware/auth.middleware'); 
const N=require('../models/Notification.models'); 
r.get('/',auth,async(req,res)=>{const page=+(req.query.page||1); 
const items=await N.find({userId:req.user._id}).sort({createdAt:-1}).skip((page-1)*20).limit(20); 
const unread=await N.countDocuments({userId:req.user._id,isRead:false}); res.json({success:true,data:items,unreadCount:unread})}); 
r.patch('/:id/read',auth,async(req,res)=>{await N.updateOne({_id:req.params.id,userId:req.user._id},{isRead:true}); res.json({success:true})}); 
r.patch('/read-all',auth,async(req,res)=>{await N.updateMany({userId:req.user._id},{isRead:true}); 
res.json({success:true})}); 

module.exports=r;