const { supabase, supabaseAdmin } = require("../config/supabaseClient");

const { generateCardDirect } = require("./cardController");

// 🔹 Get only success payments for finance admin
const getPendingApprovals = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("elite_card_payment")
            .select("*")
            .in("status", ["success", "approved", "declined"])
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error fetching success payments:", error);
            return res.status(500).json({ error: "Error fetching payments" });
        }

        res.status(200).json({ success: true, data });
    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

// 🔹 Approve payment + auto-generate card
const approvePayment = async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Payment ID is required" });

    try {
        // 1. Update status -> approved
        const { data: payment, error } = await supabase
            .from("elite_card_payment")
            .update({ status: "approved" })
            .eq("id", id)
            .eq("status", "success") // only if it was success
            .select("*")
            .single();

        if (error || !payment) {
            console.error("Error approving payment:", error);
            return res.status(500).json({ error: "Error approving payment" });
        }

        // 2. Auto-generate card
        const card = await generateCardDirect(payment);

        res.json({
            success: true,
            message: "Payment approved & card generated successfully",
            card,
        });
    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

// 🔹 Decline payment
const declinePayment = async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Payment ID is required" });

    try {
        const { error } = await supabase
            .from("elite_card_payment")
            .update({ status: "declined" })
            .eq("id", id)
            .eq("status", "success"); // only if it was success

        if (error) {
            console.error("Error declining payment:", error);
            return res.status(500).json({ error: "Error declining payment" });
        }

        res.json({ success: true, message: "Payment declined successfully" });
    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

module.exports = {
    getPendingApprovals,
    approvePayment,
    declinePayment,
};
