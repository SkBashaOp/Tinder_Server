const express = require("express");
const clerkRouter = express.Router();
const User = require("../models/user");
const { clerkAuth } = require("../middlewares/clerkAuth");
const ConnectionRequestModel = require("../models/connectionRequest");
const { Chat } = require("../models/chat");
const Message = require("../models/message");
const razorpayInstance = require("../utils/razorpay");
const Payment = require("../models/payment");
const { membershipAmount } = require("../utils/constants");
const { validatePaymentVerification } = require("razorpay/dist/utils/razorpay-utils");

/**
 * POST /clerk/create-profile
 * Called by the frontend right after Clerk auth succeeds.
 * Creates the user in MongoDB if they don't exist yet (upsert).
 */
clerkRouter.post("/clerk/create-profile", clerkAuth, async (req, res) => {
  try {
    const { firstName, lastName, emailId, photoUrl } = req.body;
    const clerkId = req.clerkId;

    // Check if this Clerk user already has a profile
    let user = await User.findOne({ clerkId });

    if (!user) {
      // 2. Check if a standard user exists with this email - if so, link them!
      user = await User.findOne({ emailId });

      if (user) {
        // Link the existing account to Clerk
        user.clerkId = clerkId;
        // Optionally update the photo if they don't have one
        if (!user.photoUrl || user.photoUrl.includes("placeholder") || user.photoUrl.includes("vecteezy")) {
          user.photoUrl = photoUrl;
        }
        await user.save();
      } else {
        // 3. First time login with a new email — create the profile
        user = await User.create({
          clerkId,
          firstName: firstName || "Dev",
          lastName: lastName || "",
          emailId,
          photoUrl:
            photoUrl ||
            "https://static.vecteezy.com/system/resources/thumbnails/020/911/746/small_2x/user-profile-icon-profile-avatar-user-icon-male-icon-face-icon-profile-icon-free-png.png",
        });
      }
    }

    res.status(200).json({
      message: `Welcome to DevFind, ${user.firstName}!`,
      loginUser: user,
    });
  } catch (error) {
    console.error("Clerk create-profile error:", error.message);
    res.status(400).json({ message: "ERROR: " + error.message });
  }
});

/**
 * GET /clerk/profile
 * Returns the authenticated Clerk user's full DevFind profile.
 */
clerkRouter.get("/clerk/profile", clerkAuth, async (req, res) => {
  try {
    const user = await User.findOne({ clerkId: req.clerkId });

    if (!user) {
      return res.status(404).json({ message: "Profile not found. Please create one first." });
    }

    res.status(200).json({ loginUser: user });
  } catch (error) {
    console.error("Clerk get-profile error:", error.message);
    res.status(400).json({ message: "ERROR: " + error.message });
  }
});

/**
 * PATCH /clerk/profile
 * Update the Clerk user's DevFind profile (bio, skills, photo, etc.)
 */
clerkRouter.patch("/clerk/profile", clerkAuth, async (req, res) => {
  try {
    const ALLOWED_FIELDS = ["firstName", "lastName", "photoUrl", "about", "skills", "github", "gender", "age", "fcmToken"];

    const updates = {};
    ALLOWED_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const user = await User.findOneAndUpdate(
      { clerkId: req.clerkId },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ message: "Profile not found." });
    }

    res.status(200).json({ message: "Profile updated!", loginUser: user });
  } catch (error) {
    console.error("Clerk update-profile error:", error.message);
    res.status(400).json({ message: "ERROR: " + error.message });
  }
});

/**
 * GET /clerk/feed
 * Returns other users for the feed (excludes the current user and interacted users).
 * Supports ?page=1&limit=10 pagination.
 */
clerkRouter.get("/clerk/feed", clerkAuth, async (req, res) => {
  try {
    const user = await User.findOne({ clerkId: req.clerkId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 50;
    limit = limit > 50 ? 50 : limit;
    const skip = (page - 1) * limit;

    // Exclude users we've already interacted with
    const connectionRequests = await ConnectionRequestModel.find({
      $or: [{ fromUserId: user._id }, { toUserId: user._id }],
    }).select("fromUserId toUserId");

    const hideUsersFromFeed = new Set();
    hideUsersFromFeed.add(user._id.toString());

    connectionRequests.forEach((request) => {
      hideUsersFromFeed.add(request.fromUserId.toString());
      hideUsersFromFeed.add(request.toUserId.toString());
    });

    const feedUsers = await User.find({
      _id: { $nin: Array.from(hideUsersFromFeed) },
    })
      .select("firstName lastName age gender about skills photoUrl")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({ data: feedUsers });
  } catch (error) {
    console.error("Clerk feed error:", error.message);
    res.status(400).json({ message: "ERROR: " + error.message });
  }
});

/**
 * POST /clerk/save-fcm-token
 * Saves the FCM device token for push notifications
 */
clerkRouter.post("/clerk/save-fcm-token", clerkAuth, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    const updatedUser = await User.findOneAndUpdate(
      { clerkId: req.clerkId },
      { fcmToken: token },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "Profile not found." });
    }

    res.json({ message: "FCM token saved successfully" });
  } catch (error) {
    console.error("Clerk save-fcm-token error:", error);
    res.status(500).json({ error: "Failed to save FCM token" });
  }
});

/**
 * GET /clerk/request/accepted
 * Returns all accepted connection requests for the Clerk user
 */
clerkRouter.get("/clerk/request/accepted", clerkAuth, async (req, res) => {
  try {
    const user = await User.findOne({ clerkId: req.clerkId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const allAcceptedRequest = await ConnectionRequestModel.find({
      $or: [
        { toUserId: user._id, status: "accepted" },
        { fromUserId: user._id, status: "accepted" },
      ],
    })
      .populate("fromUserId", "firstName lastName age gender about skills photoUrl")
      .populate("toUserId", "firstName lastName age gender about skills photoUrl");

    const data = allAcceptedRequest
      .filter((row) => row.fromUserId && row.toUserId)
      .map((row) => {
        if (row.fromUserId._id.toString() === user._id.toString()) {
          return row.toUserId;
        }
        return row.fromUserId;
      });

    res.json({ message: "Fetched all accepted requests", data });
  } catch (error) {
    res.status(400).json({ message: "ERROR: " + error.message });
  }
});

/**
 * DELETE /clerk/request/remove/:userId
 * Removes a connection request (unmatch)
 */
clerkRouter.delete("/clerk/request/remove/:userId", clerkAuth, async (req, res) => {
  try {
    const user = await User.findOne({ clerkId: req.clerkId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const loggedInUserId = user._id;
    const { userId } = req.params;

    const connectionRequest = await ConnectionRequestModel.findOne({
      $or: [
        { fromUserId: loggedInUserId, toUserId: userId, status: "accepted" },
        { fromUserId: userId, toUserId: loggedInUserId, status: "accepted" },
      ],
    });

    if (!connectionRequest) {
      return res.status(404).json({ message: "Connection not found" });
    }

    await connectionRequest.deleteOne();

    res.json({ message: "Connection removed successfully" });
  } catch (err) {
    res.status(400).send("ERROR: " + err.message);
  }
});

/**
 * GET /clerk/request/received
 * Returns all pending received requests
 */
clerkRouter.get("/clerk/request/received", clerkAuth, async (req, res) => {
  try {
    const user = await User.findOne({ clerkId: req.clerkId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const allReceivedRequest = await ConnectionRequestModel.find({
      toUserId: user._id,
      status: "interested",
    }).populate("fromUserId", "firstName lastName age gender about skills photoUrl");

    res.json({ message: "Fetch request data!", allReceivedRequest });
  } catch (error) {
    res.status(400).json({ message: "ERROR: " + error.message });
  }
});

/**
 * POST /clerk/request/review/:status/:requestId
 * Review (accept/reject) a connection request
 */
clerkRouter.post("/clerk/request/review/:status/:requestId", clerkAuth, async (req, res) => {
  try {
    const user = await User.findOne({ clerkId: req.clerkId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const { status, requestId } = req.params;

    const allowedStatus = ["accepted", "rejected"];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({ message: "Status not allowed!" });
    }

    const connectionRequest = await ConnectionRequestModel.findOne({
      _id: requestId,
      toUserId: user._id,
      status: "interested",
    });

    if (!connectionRequest) {
      return res.status(404).json({ message: "Connection request not found" });
    }

    connectionRequest.status = status;
    const data = await connectionRequest.save();

    res.json({ message: "Connection request " + status, data });
  } catch (err) {
    res.status(400).send("ERROR: " + err.message);
  }
});

/**
 * POST /clerk/request/send/:status/:toUserId
 * Send a connection request (interested/ignored)
 */
clerkRouter.post("/clerk/request/send/:status/:toUserId", clerkAuth, async (req, res) => {
  try {
    const fromUser = await User.findOne({ clerkId: req.clerkId });
    if (!fromUser) return res.status(404).json({ message: "User not found" });

    const toUserId = req.params.toUserId;
    const status = req.params.status;

    const allowedStatus = ["ignored", "interested"];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({ message: "Invalid status type: " + status });
    }

    const toUser = await User.findById(toUserId);
    if (!toUser) {
      return res.status(404).json({ message: "Target User not found!" });
    }

    const existingConnectionRequest = await ConnectionRequestModel.findOne({
      $or: [
        { fromUserId: fromUser._id, toUserId },
        { fromUserId: toUserId, toUserId: fromUser._id },
      ],
    });

    if (existingConnectionRequest) {
      return res.status(400).send({ message: "Connection Request Already Exists!!" });
    }

    const connectionRequest = new ConnectionRequestModel({
      fromUserId: fromUser._id,
      toUserId,
      status,
    });

    await connectionRequest.save();

    res.json({
      message: fromUser.firstName + " is " + status + " in " + toUser.firstName,
      data: connectionRequest,
    });
  } catch (err) {
    res.status(400).send("ERROR: " + err.message);
  }
});

/**
 * GET /clerk/user/:id
 * Fetches basic info for a specific user
 */
clerkRouter.get("/clerk/user/:id", clerkAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("firstName lastName photoUrl");
    if (!user) {
      return res.status(404).json({ message: "User not found!" });
    }
    res.json(user);
  } catch (error) {
    res.status(400).json({ message: "ERROR: " + error.message });
  }
});

/**
 * GET /clerk/chat/:targetUserId
 * Fetches chat history
 */
clerkRouter.get("/clerk/chat/:targetUserId", clerkAuth, async (req, res) => {
  const { targetUserId } = req.params;

  try {
    const user = await User.findOne({ clerkId: req.clerkId });
    if (!user) return res.status(404).json({ message: "User not found" });
    const userId = user._id;

    let chat = await Chat.findOne({
      participants: { $all: [userId, targetUserId], $size: 2 },
    });

    if (!chat) {
      chat = await Chat.create({
        participants: [userId, targetUserId],
      });
    }

    const messages = await Message.find({ chatId: chat._id })
      .populate("senderId", "firstName lastName photoUrl")
      .sort({ createdAt: 1 });

    res.json({
      chatId: chat._id,
      messages,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load chat" });
  }
});

/**
 * POST /clerk/payment/create
 * Creates a Razorpay order for Clerk users
 */
clerkRouter.post("/clerk/payment/create", clerkAuth, async (req, res) => {
  try {
    const user = await User.findOne({ clerkId: req.clerkId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const { membershipType } = req.body;
    const { firstName, lastName, emailId } = user;

    let amount = membershipAmount[membershipType];

    // If upgrading silver -> gold
    if (user.membershipType && user.membershipType.includes("silver") && membershipType.includes("gold")) {
      amount = membershipAmount[membershipType] - membershipAmount.silver_monthly;
    }

    const order = await razorpayInstance.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "receipt#" + Date.now(),
      notes: {
        firstName,
        lastName,
        emailId,
        membershipType: membershipType,
      },
    });

    const payment = new Payment({
      userId: user._id,
      orderId: order.id,
      status: order.status,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      notes: order.notes,
    });

    const savedPayment = await payment.save();

    res.json({ ...savedPayment.toJSON(), keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error("Clerk payment-create error:", err.message);
    res.status(500).json({ msg: err.message });
  }
});

/**
 * POST /clerk/payment/verify
 * Verifies Razorpay signature and updates Clerk user's premium status
 */
clerkRouter.post("/clerk/payment/verify", clerkAuth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const isValid = validatePaymentVerification(
      { order_id: razorpay_order_id, payment_id: razorpay_payment_id },
      razorpay_signature,
      process.env.RAZORPAY_KEY_SECRET
    );

    if (!isValid) {
      return res.status(400).json({ msg: "Payment verification failed" });
    }

    const payment = await Payment.findOne({ orderId: razorpay_order_id });
    if (!payment) {
      return res.status(400).json({ msg: "Payment not found" });
    }

    payment.status = "captured";
    payment.paymentId = razorpay_payment_id;
    await payment.save();

    const user = await User.findOne({ clerkId: req.clerkId });
    if (!user) return res.status(404).json({ message: "User not found" });

    let updateData = {};
    if (payment.notes.membershipType === "boost") {
      updateData = {
        boostActive: true,
        boostCount: (user.boostCount || 0) + 1,
        boostExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
      };
    } else {
      updateData = {
        isPremium: true,
        membershipType: payment.notes.membershipType
      };
    }

    const updatedUser = await User.findByIdAndUpdate(user._id, updateData, { new: true });

    return res.status(200).json({ msg: "Payment verified successfully", user: updatedUser.toJSON() });
  } catch (err) {
    console.error("Clerk payment-verify error:", err.message);
    res.status(500).json({ msg: err.message });
  }
});

/**
 * GET /clerk/premium/verify
 * Checks premium status for Clerk user
 */
clerkRouter.get("/clerk/premium/verify", clerkAuth, async (req, res) => {
  try {
    const userDoc = await User.findOne({ clerkId: req.clerkId });
    if (!userDoc) return res.status(404).json({ message: "User not found" });

    const user = userDoc.toJSON();
    res.json({ ...user });
  } catch (error) {
    console.error("Clerk premium-verify error:", error.message);
    res.status(400).json({ message: "ERROR: " + error.message });
  }
});

module.exports = clerkRouter;
