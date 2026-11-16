const mongoose=require('mongoose');
const v=new mongoose.Schema({label:String,priceKobo:{type:Number,min:0},stock:{type:Number,min:0}},{_id:false});
const s=new mongoose.Schema({vendorId:String,name:String,slug:{type:String,unique:true},description:String,priceKobo:{type:Number,min:0},category:String,images:[String],stock:{type:Number,min:0,default:0},variants:[v],tags:[String],isActive:{type:Boolean,default:true},ratingAvg:{type:Number,default:0},ratingCount:{type:Number,default:0},isDeleted:{type:Boolean,default:false}},{timestamps:true});
s.index({name:'text',description:'text'});
module.exports=mongoose.model('Product',s);