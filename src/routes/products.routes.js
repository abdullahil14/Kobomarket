const r=require('express').Router(); 
const Joi=require('joi'); 
const Product=require('../models/Product.models'); 
const Review=require('../models/Review.models'); 
const pool=require('../db/pg/pool.pg'); 
const {auth,requireRole}=require('../middleware/auth.middleware'); 
const validate=require('../middleware/validate.middleware');
const slugify=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
r.get('/',async(req,res,next)=>{try{const {q,category,minPrice,maxPrice,vendorId,minRating,sort='newest',cursor,limit=20}=req.query; 
const f={isActive:true,isDeleted:false}; if(q) f.$text={$search:q}; if(category) f.category=category; if(vendorId) f.vendorId=vendorId; if(minPrice||maxPrice) f.priceKobo={...(minPrice?{$gte:+minPrice}:{}),...(maxPrice?{$lte:+maxPrice}:{})}; if(minRating) f.ratingAvg={$gte:+minRating}; if(cursor) f._id={$lt:cursor}; // cursor pagination on _id (newest first); for price sort use same cursor semantics in prod
const sortMap={price:{priceKobo:1},'-price':{priceKobo:-1},newest:{createdAt:-1},rating:{ratingAvg:-1}}; 
const items=await Product.find(f).sort(sortMap[sort]||sortMap.newest).limit(+limit+1); const hasMore=items.length>+limit; 
const data=items.slice(0,+limit); res.json({success:true,data,nextCursor:hasMore?data[data.length-1]._id:null});}catch(e){next(e)}});
r.get('/:slug',async(req,res,next)=>{try{const p=await Product.findOne({slug:req.params.slug,isDeleted:false}); if(!p) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Product not found'}}); res.json({success:true,data:p});}catch(e){next(e)}});
const schema=Joi.object({name:Joi.string().required(),description:Joi.string().allow(''),priceKobo:Joi.number().integer().min(0).required(),category:Joi.string().required(),images:Joi.array().items(Joi.string()),stock:Joi.number().integer().min(0).default(0),variants:Joi.array(),tags:Joi.array().items(Joi.string())});
r.post('/',auth,requireRole('vendor','admin'),validate(schema),async(req,res,next)=>{try{const p=await Product.create({...req.body,vendorId:req.user._id.toString(),slug:slugify(req.body.name)+'-'+Date.now()}); res.status(201).json({success:true,data:p});}catch(e){next(e)}});
r.patch('/:id',auth,requireRole('vendor','admin'),async(req,res,next)=>{try{const p=await Product.findOneAndUpdate({_id:req.params.id,vendorId:req.user._id.toString()},req.body,{new:true}); res.json({success:true,data:p});}catch(e){next(e)}});
r.delete('/:id',auth,requireRole('vendor','admin'),async(req,res,next)=>{try{await Product.findOneAndUpdate({_id:req.params.id,vendorId:req.user._id.toString()},{isDeleted:true}); res.json({success:true});}catch(e){next(e)}});
r.post('/:id/reviews',auth,async(req,res,next)=>{try{const product=await Product.findById(req.params.id); if(!product) throw new Error('Product not found');
  // Only completed order buyer: check PG sub_orders COMPLETED + order_items for product
  const chk=await pool.query(`SELECT 1 FROM order_items oi JOIN sub_orders so ON so.id=oi.sub_order_id JOIN orders o ON o.id=so.order_id WHERE so.status='COMPLETED' AND o.buyer_id=$1 AND oi.product_id=$2 LIMIT 1`,[req.user._id.toString(),req.params.id]); if(!chk.rows.length) return res.status(403).json({success:false,error:{code:'FORBIDDEN',message:'Only buyers with completed order can review'}});
  const rev=await Review.create({productId:req.params.id,buyerId:req.user._id.toString(),rating:req.body.rating,comment:req.body.comment}); 
  const agg=await Review.aggregate([{$match:{productId:req.params.id}},{$group:{_id:null,avg:{$avg:'$rating'},n:{$sum:1}}}]); 
  await Product.updateOne({_id:req.params.id},{ratingAvg:agg[0]?.avg||0,ratingCount:agg[0]?.n||0}); 
  res.status(201).json({success:true,data:rev});}catch(e){if(e.code===11000) 
  return res.status(409).json({success:false,error:{code:'CONFLICT',message:'Already reviewed'}}); next(e)}});

module.exports=r;