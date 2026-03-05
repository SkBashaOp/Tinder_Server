const mongoose = require("mongoose");

module.exports.connectDb = async () => {
  await mongoose.connect(process.env.DB_CONNECTION_STRING);
};

// module.exports = connectDb