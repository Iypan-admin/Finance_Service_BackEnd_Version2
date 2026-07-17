// file: cron/expireEnrollments.js
const { supabase } = require("../config/supabaseClient");
const cron = require("node-cron");

// ⚡ Temporary: run every 1 minute for testing
cron.schedule("0 0 * * *", async () => {
// cron.schedule("* * * * *", async () => {

    try {
        const today = new Date().toISOString().split("T")[0];

        // Update expired enrollments, but EXCLUDE permanent enrollments (final EMI completed)
        // Only expire enrollments where:
        // 1. end_date < today (expired)
        // 2. is_permanent != true (includes NULL and false values)
        const { data, error } = await supabase
            .from("enrollment")
            .update({ status: false })
            .lt("end_date", today)
            .neq("is_permanent", true) // Exclude permanent enrollments (NULL and false will be included)
            .select(); // ✅ ensure Supabase returns updated rows

        if (error) {
            console.error("❌ Error updating expired enrollments:", error);
        } else {
            const updatedCount = data ? data.length : 0;
            console.log(`ℹ️ Expired enrollments processed: ${updatedCount} (permanent enrollments excluded)`);
        }
    } catch (err) {
        console.error("❌ Cron job error:", err);
    }
},
    { timezone: "Asia/Kolkata" }
);

console.log("🕒 Enrollment expiry cron job started (once daily at 12:00 AM IST)...");