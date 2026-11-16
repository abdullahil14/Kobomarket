const mongoose=require('mongoose'); 
const s=new mongoose.Schema({userId:String,type:String,title:String,body:String,
  data:{type:Object,default:{}},isRead:{type:Boolean,default:false}},{timestamps:true}); 
module.exports=mongoose.model('Notification',s);