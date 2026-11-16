const mongoose = require('mongoose');
const cfg = require('../config');

async function connect() {
  console.log('Trying Mongo:', cfg.mongoUri);
  await mongoose.connect(cfg.mongoUri);
  console.log('MongoDB connected successfully:', mongoose.connection.name);
}

module.exports = { connect };