require('dotenv').config();
module.exports={port:+process.env.PORT||5001,mongoUri:process.env.MONGO_URI||'mongodb://localhost:27017/kobomarket',
pgUri:process.env.PG_URI||'postgresql://postgres:postgres@localhost:5432/kobomarket',
accessSecret:process.env.JWT_ACCESS_SECRET||'access',
refreshSecret:process.env.JWT_REFRESH_SECRET||'refresh',
commissionBps:+(process.env.COMMISSION_RATE_BPS||500),escrowHours:+(process.env.ESCROW_TIMEOUT_HOURS||72),payoutMinKobo:+(process.env.PAYOUT_MIN_KOBO||100000),paystackSecret:process.env.PAYSTACK_SECRET_KEY||'sk_test_mock',
provider:process.env.PAYMENT_PROVIDER||'mock'};