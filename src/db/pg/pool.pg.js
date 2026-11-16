const {Pool}=require('pg'); 
const cfg=require('../../config'); 
const pool=new Pool({connectionString:cfg.pgUri}); 
module.exports=pool;