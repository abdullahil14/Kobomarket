const mongoose=require('mongoose'); 
const s=new mongoose.Schema
( 
{userId:{type:String,unique:true},
storeName:String,slug:String,description:String,
bank:{accountName:String,accountNumber:String,bankName:String,bankCode:String},
status:{type:String,
default:'pending',
enum:['pending','approved','rejected']}},
{timestamps:true}); 

module.exports=mongoose.model('Vendor',s);