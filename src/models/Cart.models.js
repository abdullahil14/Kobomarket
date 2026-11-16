const mongoose=require('mongoose'); 
const s=new mongoose.Schema({userId:{type:String,unique:true},items:[{productId:String,vendorId:String,name:String,unitPriceKobo:Number,qty:Number}]},{timestamps:true}); 
module.exports=mongoose.model('Cart',s);