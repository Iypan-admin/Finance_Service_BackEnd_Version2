const { supabase, supabaseAdmin } = require("../config/supabaseClient");
const { generateCardDirect } = require("./cardController");

// 🔹 Get only success/approved/declined giveaways for finance admin
const getGiveawayApprovals = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("giveaway")
            .select("*")
            .in("status", ["success", "approved", "declined"])
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error fetching giveaways:", error);
            return res.status(500).json({ error: "Error fetching giveaways" });
        }

        res.status(200).json({ success: true, data });
    } catch (err) {
        console.error("Server error (getGiveawayApprovals):", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

// 🔹 Approve giveaway & generate card
const approveGiveaway = async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Giveaway ID is required" });

    try {
        // 1️⃣ Update giveaway status to approved
        const { data: entry, error: updateError } = await supabase
            .from("giveaway")
            .update({ status: "approved" })
            .eq("id", id)
            .eq("status", "success") // 🔄 ensure correct previous status (change to "pending" if needed)
            .select("*")
            .maybeSingle();

        if (updateError) {
            console.error("Supabase update error:", updateError);
            return res.status(500).json({ error: "Database update failed" });
        }

        if (!entry) {
            return res.status(404).json({ error: "Giveaway not found or not in valid state" });
        }

        // 2️⃣ Generate card (explicitly set type = giveaway)
        let card;
        try {
            card = await generateCardDirect(entry, "giveaway");
        } catch (cardErr) {
            console.error("Card generation failed:", cardErr);
            return res.status(500).json({ error: "Card generation failed" });
        }

        // 3️⃣ Success response
        return res.json({
            success: true,
            message: "Giveaway approved & card generated successfully",
            card,
        });
    } catch (err) {
        console.error("Server error (approveGiveaway):", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

// 🔹 Decline giveaway entry
const declineGiveaway = async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Giveaway ID is required" });

    try {
        const { error } = await supabase
            .from("giveaway")
            .update({ status: "declined" })
            .eq("id", id)
            .eq("status", "success");

        if (error) {
            console.error("Error declining giveaway:", error);
            return res.status(500).json({ error: "Error declining giveaway" });
        }

        res.json({ success: true, message: "Giveaway declined successfully" });
    } catch (err) {
        console.error("Server error (declineGiveaway):", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

module.exports = {
    getGiveawayApprovals,
    approveGiveaway,
    declineGiveaway,
};
