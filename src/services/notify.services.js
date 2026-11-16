const bus=require('../utils/events.utils'); const Notification=require('../models/Notification.models');
// Async: listeners fire-and-forget, request never awaits DB write.
async function emitFor(userId,type,title,body,data={}){bus.emit('notify',{userId,type,title,body,data});}
bus.on('notify',async n=>{try{await Notification.create(n);}catch(e){console.error('notify fail',e.message)}});
module.exports={emitFor};