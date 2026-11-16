const r=require('express').Router(); 
const {auth}=require('../middleware/auth.middleware'); 
const Cart=require('../models/Cart.models'); 
const Product=require('../models/Product.models'); 
r.use(auth); 
r.get('/',async(req,res)=>{let c=await Cart.findOne({userId:req.user._id}); 
res.json({success:true,data:c||{items:[]}})}); 
r.post('/items',async(req,res,next)=>{try{const p=await Product.findById(req.body.productId); if(!p||p.stock<req.body.qty) 
  return res.status(400).json({success:false,error:{code:'INSUFFICIENT_STOCK',message:'Out of stock'}}); 
  let c=await Cart.findOne({userId:req.user._id})||await Cart.create({userId:req.user._id,items:[]}); const ex=c.items.find(i=>i.productId===req.body.productId); 
  if(ex) ex.qty=req.body.qty; 
  else c.items.push({productId:p._id,vendorId:p.vendorId,name:p.name,unitPriceKobo:p.priceKobo,qty:req.body.qty}); await c.save(); res.json({success:true,data:c});}catch(e){next(e)}}); 
  r.patch('/items/:itemId',async(req,res)=>{const c=await Cart.findOne({userId:req.user._id}); 
  const it=c.items.id(req.params.itemId); if(it) it.qty=req.body.qty; 
  await c.save(); res.json({success:true,data:c})}); 
  r.delete('/items/:itemId',async(req,res)=>{const c=await Cart.findOne({userId:req.user._id}); c.items=c.items.filter(i=>i._id.toString()!==req.params.itemId); 
  await c.save(); res.json({success:true,data:c})});

  module.exports=r;