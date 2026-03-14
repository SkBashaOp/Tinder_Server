const express = require("express");
const router = express.Router();
const { Webhook } = require("svix");
const User = require("../models/user");

router.post("/webhooks/clerk", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const payload = req.body.toString();
    const headers = req.headers;

    const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);

    // Verify the webhook signature
    const evt = wh.verify(payload, headers);

    if (evt.type === "user.created") {
      const user = evt.data;

      // Extract details
      const clerkId = user.id;

      let emailId = null;
      if (user.email_addresses && user.email_addresses.length > 0) {
        const primaryEmail = user.email_addresses.find(
          (e) => e.id === user.primary_email_address_id
        );
        emailId = primaryEmail ? primaryEmail.email_address : user.email_addresses[0].email_address;
      }

      // fallback if webhook test event has no email
      if (!emailId) {
        emailId = `${clerkId}@clerk.dev`;
      }

      const firstName = user.first_name || "Dev";
      const lastName = user.last_name || "";
      const photoUrl = user.image_url;

      // Create user in MongoDB
      await User.create({
        clerkId,
        emailId,
        firstName,
        lastName,
        photoUrl
      });

      console.log("New user created via webhook:", clerkId);
    }

    res.status(200).json({ success: true });

  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(400).send("Webhook Error: " + err.message);
  }
});

module.exports = router;
