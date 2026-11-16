// All money integer kobo. No floats.
const commission=(amountKobo,bps)=>Math.floor(amountKobo*bps/100); // integer math only
const formatKobo=k=>`₦${Math.floor(k/100)}.${String(k%100).padStart(2,'0')}`;
module.exports={commission,formatKobo};