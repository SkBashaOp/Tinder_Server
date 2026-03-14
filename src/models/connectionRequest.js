const mongoose = require("mongoose");

const connectionRequestSchema = new mongoose.Schema(
  {
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: ["ignored", "interested", "accepted", "rejected"],
        message: `{VALUE} is incorect status`,
      },
    },
  },
  { timestamps: true }
);

connectionRequestSchema.index(
  { fromUserId: 1, toUserId: 1 },
  { unique: true }
);

connectionRequestSchema.index({ fromUserId: 1 });
connectionRequestSchema.index({ toUserId: 1 });
connectionRequestSchema.index({ status: 1 });
module.exports = new mongoose.model("ConnectionRequest", connectionRequestSchema);
