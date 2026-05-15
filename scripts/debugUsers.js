const mongoose = require("mongoose");
const User = require("./src/models/user");
require("dotenv").config();

async function checkUsers() {
  await mongoose.connect(process.env.MONGO_CONNECTION_STRING);
  const users = await User.find({});
  console.log("Total Users:", users.length);
  users.forEach(u => {
    console.log(`- ${u.firstName} ${u.lastName} (Email: ${u.emailId || 'None'})`);
  });
  process.exit();
}

checkUsers();
