const express = require("express");
const { userAuth } = require("../middlewares/userAuth");
const ConnectionRequestModel = require("../models/connectionRequest");
const UserModel = require("../models/user");
const userRouter = express.Router();

const USER_POPULATE_DATA =
  "firstName lastName age gender about skills photoUrl"; // or ["firstName" "lastName" "age" "gender" "about" "skills"]

userRouter.get("/user/request/received", userAuth, async (req, res, next) => {
  try {
    const loggedInUser = req.user;
    const allReceivedRequest = await ConnectionRequestModel.find({
      toUserId: loggedInUser._id,
      status: "interested",
    }).populate("fromUserId", USER_POPULATE_DATA);
    res.json({ message: "Fetch request data!", allReceivedRequest });
  } catch (error) {
    next(error);
  }
});

userRouter.get("/user/request/accepted", userAuth, async (req, res, next) => {
  try {
    const loggedInUser = req.user;
    const allAcceptedRequest = await ConnectionRequestModel.find({
      $or: [
        { toUserId: loggedInUser._id, status: "accepted" },
        { fromUserId: loggedInUser._id, status: "accepted" },
      ],
    })
      .populate("fromUserId", [
        "firstName",
        "lastName",
        "age",
        "gender",
        "about",
        "skills",
        "photoUrl",
      ])
      .populate("toUserId", USER_POPULATE_DATA);

    const data = allAcceptedRequest
      .filter((row) => row.fromUserId && row.toUserId) // skip if user was deleted
      .map((row) => {
        if (row.fromUserId._id.toString() === loggedInUser._id.toString()) {
          return row.toUserId;
        }
        return row.fromUserId;
      });

    res.json({ message: "Fetched all accepted requests", data });
  } catch (error) {
    next(error);
  }
});

userRouter.get("/user/feed", userAuth, async (req, res) => {
  try {
    const loggedInUser = req.user;

    const page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 50;

    limit = limit > 50 ? 50 : limit;

    const skip = (page - 1) * limit;

    // Exclude users where ANY connection request exists (any swipe direction/status)
    const connectionRequests = await ConnectionRequestModel.find({
      $or: [{ fromUserId: loggedInUser._id }, { toUserId: loggedInUser._id }],
    }).select("fromUserId toUserId");

    const hideUsersFromFeed = new Set();
    hideUsersFromFeed.add(loggedInUser._id.toString());

    connectionRequests.forEach((request) => {
      hideUsersFromFeed.add(request.fromUserId.toString());
      hideUsersFromFeed.add(request.toUserId.toString());
    });

    // 1. Expire old boosts before querying feed
    await UserModel.updateMany(
      { boostExpiresAt: { $lt: new Date() }, boostActive: true },
      { $set: { boostActive: false } }
    );

    // 2. Query users, sorting boosted ones to the top
    const users = await UserModel.find({
      _id: { $nin: Array.from(hideUsersFromFeed) },
    })
      .select(USER_POPULATE_DATA)
      .sort({ boostActive: -1, createdAt: -1 }) // Boosted users first
      .skip(skip)
      .limit(limit);

    res.json({ data: users });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

userRouter.get("/user/:id", userAuth, async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.params.id)
      .select("firstName lastName photoUrl");
    if (!user) {
      return res.status(404).json({ message: "User not found!" });
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
});

userRouter.post("/save-fcm-token", userAuth, async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "Token is required" });

    req.user.fcmToken = token;
    await req.user.save();

    res.json({ message: "FCM token saved successfully" });
  } catch (error) {
    next(error);
  }
});

module.exports = userRouter;
