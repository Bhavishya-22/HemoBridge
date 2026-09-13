const User = require("../model/userModel");

/**
 * Ensures that the system administrator account exists with configured credentials.
 * Reads credentials from environment variables or falls back to standard defaults:
 * username: admin
 * email: admin@bloodbank.com
 * password: Admin@1234
 */
async function ensureAdminUser() {
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminEmail = process.env.ADMIN_EMAIL || "admin@bloodbank.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin@1234";

  try {
    let admin = await User.findOne({
      $or: [{ username: adminUsername }, { email: adminEmail }, { role: "admin" }],
    });

    if (admin) {
      // If any of the essential fields or password need ensuring:
      let needsSave = false;
      if (admin.role !== "admin") {
        admin.role = "admin";
        needsSave = true;
      }
      if (admin.username !== adminUsername) {
        admin.username = adminUsername;
        needsSave = true;
      }
      if (admin.email !== adminEmail) {
        admin.email = adminEmail;
        needsSave = true;
      }
      if (!admin.profileCompleted) {
        admin.profileCompleted = true;
        needsSave = true;
      }
      if (admin.isBlocked) {
        admin.isBlocked = false;
        needsSave = true;
      }
      if (!admin.isVerified) {
        admin.isVerified = true;
        needsSave = true;
      }

      // Check if current password matches
      const adminWithPassword = await User.findById(admin._id).select("+password");
      const isMatch = await adminWithPassword.comparePassword(adminPassword);
      if (!isMatch) {
        admin.password = adminPassword;
        needsSave = true;
      }

      if (needsSave) {
        await admin.save();
        console.log(`🔒 Admin user (${adminUsername}) credentials synchronized in database.`);
      } else {
        console.log(`🔒 Admin user verified (${adminUsername} / ${adminEmail}).`);
      }
    } else {
      admin = new User({
        fullName: "System Administrator",
        username: adminUsername,
        email: adminEmail,
        password: adminPassword,
        role: "admin",
        isVerified: true,
        profileCompleted: true,
        isBlocked: false,
      });
      await admin.save();
      console.log(`🔒 Created system admin user (${adminUsername} / ${adminEmail}).`);
    }
  } catch (error) {
    console.error("⚠️ Failed to ensure admin user:", error.message);
  }
}

module.exports = ensureAdminUser;
