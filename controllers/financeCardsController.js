const supabase = require("../config/supabaseClient");

// GET all cards (only where status is false)
const getPendingCards = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("card_activations")
            .select("*")
            .eq("status", false)
            .order("created_at", { ascending: false });

        if (error) return res.status(500).json({ message: "Error fetching", error });

        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ message: "Server error", err });
    }
};

// PATCH status to true (approve card)
const approveCard = async (req, res) => {
    const { id } = req.params;

    try {
        const { data, error } = await supabase
            .from("card_activations")
            .update({ status: true })
            .eq("id", id)
            .select();

        if (error) return res.status(500).json({ message: "Approval failed", error });

        res.status(200).json({ message: "Card approved", data });
    } catch (err) {
        res.status(500).json({ message: "Server error", err });
    }
};

module.exports = {
    getPendingCards,
    approveCard,
};
