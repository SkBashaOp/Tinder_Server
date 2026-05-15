const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema({
    participants: [
        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
});

const Chat = mongoose.model("Chat", chatSchema);

module.exports = { Chat };