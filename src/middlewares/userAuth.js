const jwt = require("jsonwebtoken");
const userModel = require("../models/user");
module.exports.userAuth = async (req, res, next) => {
  try {
    const { token } = req.cookies;

    if (!token) {
      return res.status(401).send("Please login!!")
    }

    const decodedData = await jwt.verify(token, process.env.JWT_SECRET);

    if (!decodedData) {
      throw new Error("Login First!");
    }

    const user = await userModel.findById({ _id: decodedData._id });

    if (!user) {
      throw new Error("No such user find");
    }

    req.user = user;

    next();
  } catch (error) {
    res.status(400).send("EROOR: " + error.message);
  }
};
