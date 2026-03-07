require("dotenv").config();
require("./utils/cronjob.js");
const express = require("express");
const app = express();
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { connectDb } = require("./config/database");
const authRouter = require("./routes/auth");
const profileRouter = require("./routes/profile");
const requestRouter = require("./routes/request");
const userRouter = require("./routes/user");
const paymentRouter = require("./routes/payment");

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://devtinder.singles",
    "http://devtinder.singles"
  ],
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cookieParser());

// API's
app.use("/", authRouter);
app.use("/", profileRouter);
app.use("/", requestRouter);
app.use("/", userRouter);
app.use("/", paymentRouter);

connectDb()
  .then(() => {
    console.log("Db is connected");
    app.listen(3000, () => {
      console.log("Server is running on port 3000...");
    });
  })
  .catch((err) => {
    console.error("Db is not connected!! : " + err.message);
  });

// Global error handler — catches any unhandled errors in routes
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({ message: err.message || "Internal Server Error" });
});
