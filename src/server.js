const express=require('express'); 
const helmet=require('helmet'); 
const cors=require('cors'); 
const pinoHttp=require('pino-http'); 
const swaggerUi=require('swagger-ui-express'); 
const cfg=require('./config'); 
const {connect}=require('./db/mongo');
const err=require('./middleware/error.middleware'); 
const jobs=require('./jobs/index.jobs'); 
const app=express(); 

app.use(helmet()); 
app.use(cors()); 
app.use(pinoHttp()); 
app.use('/api/v1/webhooks/paystack',express.raw({type:'*/*'}),(req,res,next)=>{req.rawBody=req.body.toString(); try{req.body=JSON.parse(req.rawBody)}catch{req.body={}} next()}); 
app.use(express.json()); 
app.use('/api/v1/auth',require('./routes/auth.routes')); 
app.use('/api/v1/users',require('./routes/users.routes')); 
app.use('/api/v1/vendors',require('./routes/vendors.routes')); 
app.use('/api/v1/products',require('./routes/products.routes')); 
app.use('/api/v1/cart',require('./routes/cart.routes')); 
app.use('/api/v1/wallet',require('./routes/wallet.routes')); 
app.use('/api/v1/webhooks/paystack',require('./routes/wallet.routes')); 
app.use('/api/v1/orders',require('./routes/orders.routes')); 
app.use('/api/v1/sub-orders',require('./routes/suborders.routes')); 
app.use('/api/v1/disputes',require('./routes/disputes.routes')); 
app.use('/api/v1/sub-orders',require('./routes/disputes.routes')); // dispute creation mounted also here - see routes/disputes path handling
app.use('/api/v1/payouts',require('./routes/payouts.routes')); 
app.use('/api/v1/notifications',require('./routes/notifications.routes')); 
app.use('/api/v1/admin',require('./routes/admin.routes')); 
app.get('/health',(req,res)=>res.json({ok:true})); 
app.use('/api-docs',swaggerUi.serve,swaggerUi.setup({openapi:'3.0.0',info:{title:'KoboMarket API',version:'1.0.0'},paths:{}})); 
app.use(err);
if(require.main===module){
  connect().then(()=>{
    jobs.start();
    app.listen(cfg.port,()=>console.log('KoboMarket on port',cfg.port))
  }).catch(e=>{console.error(e);process.exit(1)})
}
module.exports=app;
