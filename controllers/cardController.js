// controllers/cardController.js
const { supabase, supabaseAdmin } = require("../config/supabaseClient");
const { generateAndUploadCardPDF } = require("../utils/cardPdf"); // ✅ Correct import

/**
 * Generate Card Number Based on Card Type (Always 10 chars)
 * EduPass      -> ISMLE + 4 digits + 1 letter
 * ScholarPass  -> ISMLS + 4 digits + 1 letter
 * InfinitePass -> ISMLI + 4 digits + 1 letter
 */
function generateCardNumber(cardName) {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";

    // Default prefix (EduPass)
    let prefix = "ISMLE";
    if (cardName?.toLowerCase() === "scholarpass") prefix = "ISMLS";
    if (cardName?.toLowerCase() === "infinitepass") prefix = "ISMLI";

    // Generate 4 random digits
    let numPart = "";
    for (let i = 0; i < 4; i++) {
        numPart += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }

    // Generate 1 random letter
    const letterPart = letters.charAt(Math.floor(Math.random() * letters.length));

    return prefix + numPart + letterPart; // 10 chars
}

/**
 * Calculate Validity Dates Based on Card Type
 */
function calculateValidity(cardName) {
    const today = new Date();
    let years = 1; // default EduPass

    if (cardName?.toLowerCase() === "scholarpass") years = 2;
    if (cardName?.toLowerCase() === "infinitepass") years = 3;

    const validFrom = today.toISOString().split("T")[0];
    const expiry = new Date(today);
    expiry.setFullYear(expiry.getFullYear() + years);
    const validThru = expiry.toISOString().split("T")[0];

    return { validFrom, validThru };
}

/**
 * 🔹 API Version - Generate Card (using payment_id from request body)
 */
exports.generateCard = async (req, res) => {
    try {
        const { payment_id } = req.body;
        if (!payment_id) {
            return res.status(400).json({ error: "Missing payment_id" });
        }

        // Fetch payment record
        const { data: payment, error: payErr } = await supabase
            .from("elite_card_payment")
            .select("id, card_name, name_on_the_pass, customer_email, status")
            .eq("payment_id", payment_id)
            .single();

        if (payErr || !payment) {
            return res.status(404).json({ error: "Payment not found" });
        }

        if (payment.status?.toLowerCase() !== "approved") {
            return res.status(400).json({ error: "Payment not approved yet" });
        }

        // Generate card from payment
        const card = await generateCardInternal(payment, "payment");

        res.status(201).json({
            message: "✅ Card generated successfully",
            card,
        });
    } catch (err) {
        console.error("Error generating card:", err.message);
        res.status(500).json({ error: err.message });
    }
};

/**
 * 🔹 API Version - Generate Card (using giveaway_id from request body)
 */
exports.generateCardFromGiveaway = async (req, res) => {
    try {
        const { giveaway_id } = req.body;
        if (!giveaway_id) {
            return res.status(400).json({ error: "Missing giveaway_id" });
        }

        // Fetch giveaway record
        const { data: giveaway, error: gErr } = await supabase
            .from("giveaway")
            .select("id, card_name, name_on_the_pass, customer_email, status")
            .eq("id", giveaway_id)
            .single();

        if (gErr || !giveaway) {
            return res.status(404).json({ error: "Giveaway not found" });
        }

        if (giveaway.status?.toLowerCase() !== "approved") {
            return res.status(400).json({ error: "Giveaway not approved yet" });
        }

        // Generate card from giveaway
        const card = await generateCardInternal(giveaway, "giveaway");

        res.status(201).json({
            message: "✅ Giveaway Card generated successfully",
            card,
        });
    } catch (err) {
        console.error("Error generating giveaway card:", err.message);
        res.status(500).json({ error: err.message });
    }
};

/**
 * 🔹 Direct Function - For financeController or others to call directly
 */
exports.generateCardDirect = async (source, type = "payment") => {
    try {
        const card = await generateCardInternal(source, type);
        return card;
    } catch (err) {
        console.error("Error in generateCardDirect:", err.message);
        throw err;
    }
};

/**
 * 🔹 Shared Internal Logic
 */
async function generateCardInternal(source, type = "payment") {
    // 1. Unique Card Number
    let cardNumber;
    let isUnique = false;
    while (!isUnique) {
        cardNumber = generateCardNumber(source.card_name);
        const { data: exists } = await supabase
            .from("elite_card_generate")
            .select("id")
            .eq("card_number", cardNumber)
            .maybeSingle();
        if (!exists) isUnique = true;
    }

    // 2. Validity Dates
    const { validFrom, validThru } = calculateValidity(source.card_name);

    // 3. Build insert payload
    const insertData = {
        card_name: source.card_name,
        name_on_the_pass: source.name_on_the_pass,
        email: source.customer_email,
        card_number: cardNumber,
        valid_from: validFrom,
        valid_thru: validThru,
        status: "card_generated",
    };

    if (type === "payment") {
        insertData.payment_id = source.id; // ✅ link payment
    } else if (type === "giveaway") {
        insertData.giveaway_id = source.id; // ✅ link giveaway
    }

    // 4. Insert into DB
    const { data: newCard, error } = await supabaseAdmin
        .from("elite_card_generate")
        .insert([insertData])
        .select()
        .single();

    if (error) throw error;

    // 5. Generate PDF & Upload
    const pdfInfo = await generateAndUploadCardPDF({
        name: newCard.name_on_the_pass,
        cardNumber: newCard.card_number,
        validFrom,
        validThru,
        cardName: newCard.card_name,
        id: newCard.id,
    });

    const pdfUrl = pdfInfo?.publicUrl || null;

    // 6. Update DB with pdf_url
    await supabaseAdmin
        .from("elite_card_generate")
        .update({ pdf_url: pdfUrl })
        .eq("id", newCard.id);

    return { ...newCard, pdf_url: pdfUrl };
}
