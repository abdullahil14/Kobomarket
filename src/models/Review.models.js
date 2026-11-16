const mongoose=require('mongoose'); 
const s=new mongoose.Schema({productId:String,buyerId:String,rating:{type:Number,min:1,max:5},comment:String},{timestamps:true}); s.index({productId:1,buyerId:1},{unique:true}); 
module.exports=mongoose.model('Review',s);