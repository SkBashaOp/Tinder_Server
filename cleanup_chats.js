require("dotenv").config();
const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
    { participants: [mongoose.Schema.Types.ObjectId], messages: { type: [], default: [] } },
    { strict: false }
);
const Chat = mongoose.model("Chat", chatSchema);

const dbUrl =
    process.env.DB_CONNECTION_STRING ||
    process.env.MONGODB_URI ||
    process.env.DB_URL ||
    process.env.MONGO_URI;

if (!dbUrl) {
    console.error("No MongoDB connection string found in .env");
    process.exit(1);
}

mongoose
    .connect(dbUrl)
    .then(async () => {
        const chats = await Chat.find({});
        console.log("Total chat documents:", chats.length);

        const seen = {};
        const toDelete = [];

        for (const c of chats) {
            const key = c.participants
                .map((p) => p.toString())
                .sort()
                .join("-");
            if (seen[key]) {
                toDelete.push(c._id);
                console.log("  Duplicate to delete:", c._id, "| participants:", key);
            } else {
                seen[key] = c._id;
                console.log("  Keeping:", c._id, "| participants:", key, "| messages:", c.messages.length);
            }
        }

        if (toDelete.length > 0) {
            await Chat.deleteMany({ _id: { $in: toDelete } });
            console.log("Deleted", toDelete.length, "duplicate chat(s).");
        } else {
            console.log("No duplicates found — database is clean.");
        }

        mongoose.disconnect();
    })
    .catch((err) => {
        console.error("DB error:", err.message);
        process.exit(1);
    });
