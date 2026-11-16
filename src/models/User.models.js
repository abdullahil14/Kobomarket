const mongoose=require('mongoose');
const s=new mongoose.Schema({name:String,
  email:{type:String,
  unique:true,lowercase:true},passwordHash:String,
  roles:{type:[String],default:['buyer']},
  isEmailVerified:{type:Boolean,default:false},emailVerifyTokenHash:String,emailVerifyExpires:Date,passwordResetTokenHash:String,passwordResetExpires:Date,
  status:{type:String,default:'ACTIVE',enum:['ACTIVE','FROZEN']},refreshTokens:[{tokenHash:String,createdAt:Date}]},{timestamps:true});
module.exports=mongoose.model('User',s);