// utils/cardPdf.js
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const PDFDocument = require("pdfkit");
const { supabaseAdmin } = require("../config/supabaseClient");

// --- Template image paths (adjust filenames if yours differ) ---
const TEMPLATES = {
    edupass: {
        front: path.join(__dirname, "..", "templates", "edu_front.jpg"),
        back: path.join(__dirname, "..", "templates", "edu_back.jpg"),
    },
    scholarpass: {
        front: path.join(__dirname, "..", "templates", "scholar_front.jpg"),
        back: path.join(__dirname, "..", "templates", "scholar_back.jpg"),
    },
    infinitepass: {
        front: path.join(__dirname, "..", "templates", "infinite_front.jpg"),
        back: path.join(__dirname, "..", "templates", "infinite_back.jpg"),
    }
};

// --- Local font paths ---
const FONT_PATHS = {
    poppins: path.join(__dirname, "..", "fonts", "Poppins-Bold.ttf"),
    orbitron: path.join(__dirname, "..", "fonts", "Orbitron-Bold.ttf"),
    montserrat: path.join(__dirname, "..", "fonts", "Montserrat-SemiBold.ttf"),
};

// --- Positions and sizes (relative percentages) ---
const POSITIONS = {
    edupass: {
        name: { x: 0.10, y: 0.68, size: 40 },
        number: { x: 0.10, y: 0.78, size: 38, letterSpacing: 2 },
        validLine: { xLeft: 0.10, xRight: 0.55, y: 0.86, size: 24 }
    },

    scholarpass: {
        name: { x: 0.10, y: 0.68, size: 40 },
        number: { x: 0.10, y: 0.78, size: 38, letterSpacing: 2 },
        validLine: { xLeft: 0.10, xRight: 0.55, y: 0.86, size: 24 }
    },
    infinitepass: {
        name: { x: 0.10, y: 0.68, size: 40 },
        number: { x: 0.10, y: 0.78, size: 38, letterSpacing: 2 },
        validLine: { xLeft: 0.10, xRight: 0.55, y: 0.86, size: 30 }
    }
};

function escapeXml(unsafe) {
    return ("" + (unsafe ?? "")).replace(/[<>&'"]/g, c => ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;"
    }[c]));
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

/**
 * Build SVG overlay
 * - Name: only value
 * - Card number: only value
 * - Single line: "VALID FROM: <value>"  (left) and "VALID THRU: <value>" (right)
 */
function makeTextSVG({ width, height, cardKey, name, cardNumber, validFrom, validThru }) {
    const pos = POSITIONS[cardKey];
    if (!pos) throw new Error(`No positions configured for card type "${cardKey}"`);

    const nx = Math.round(width * pos.name.x);
    const ny = Math.round(height * pos.name.y);
    const ns = pos.name.size;

    const cx = Math.round(width * pos.number.x);
    const cy = Math.round(height * pos.number.y);
    const cs = pos.number.size;
    const tracking = pos.number.letterSpacing ?? 0;

    const fx = Math.round(width * pos.validLine.xLeft);
    const fy = Math.round(height * pos.validLine.y);
    const fs = pos.validLine.size;

    const tx = Math.round(width * pos.validLine.xRight);
    const ty = fy;

    const leftValid = `VALID FROM: ${validFrom ? formatDate(validFrom) : ""}`;
    const rightValid = `VALID THRU: ${validThru ? formatDate(validThru) : ""}`;

    return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        @font-face {
          font-family: 'Poppins';
          src: url('file://${FONT_PATHS.poppins}');
        }
        @font-face {
          font-family: 'Orbitron';
          src: url('file://${FONT_PATHS.orbitron}');
        }
        @font-face {
          font-family: 'Montserrat';
          src: url('file://${FONT_PATHS.montserrat}');
        }

        .name {
          font-family: 'Poppins';
          font-weight: 800;
          font-size: ${ns}px;
          fill: #ffffff;
          letter-spacing: 1px;
        }
        .number {
          font-family: 'Orbitron';
          font-weight: 900;
          font-size: ${cs}px;
          fill: #ffffff;
          letter-spacing: ${tracking + 1}px;
        }
        .valid {
          font-family: 'Montserrat';
          font-weight: 600;
          font-size: ${fs}px;
          fill: #ffffff;
          letter-spacing: 0.5px;
        }
      </style>

      <text x="${nx}" y="${ny}" class="name">${escapeXml(name ?? "")}</text>
      <text x="${cx}" y="${cy}" class="number">${escapeXml(cardNumber ?? "")}</text>

      <text x="${fx}" y="${fy}" class="valid">${escapeXml(leftValid)}</text>
      <text x="${tx}" y="${ty}" class="valid">${escapeXml(rightValid)}</text>
    </svg>
  `);
}

// Render front image buffer with overlay
async function renderFront(cardName, { name, cardNumber, validFrom, validThru }) {
    const cardKey = (cardName || "").toLowerCase();
    const tpl = TEMPLATES[cardKey];
    if (!tpl) throw new Error(`Unknown card template: ${cardName}`);

    // Ensure template file exists
    if (!fs.existsSync(tpl.front)) throw new Error(`Front template not found: ${tpl.front}`);
    if (!fs.existsSync(tpl.back)) throw new Error(`Back template not found: ${tpl.back}`);

    const img = sharp(tpl.front);
    const meta = await img.metadata();

    const svg = makeTextSVG({
        width: meta.width, height: meta.height, cardKey,
        name, cardNumber, validFrom, validThru
    });

    const outBuf = await img
        .composite([{ input: svg, top: 0, left: 0 }])
        .jpeg({ quality: 95 })
        .toBuffer();

    return { buffer: outBuf, width: meta.width, height: meta.height, backPath: tpl.back };
}

// Build a 2-page PDF (front + back) and return Buffer
async function makePdfBuffer(frontJpegBuffer, backImagePath) {
    return await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ autoFirstPage: false });
        const chunks = [];
        doc.on("data", (c) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        sharp(frontJpegBuffer).metadata()
            .then(({ width, height }) => {
                doc.addPage({ size: [width, height], margin: 0 });
                doc.image(frontJpegBuffer, 0, 0, { width, height });

                const backBuf = fs.readFileSync(backImagePath);
                return sharp(backBuf).metadata().then(({ width: bw, height: bh }) => {
                    doc.addPage({ size: [bw, bh], margin: 0 });
                    doc.image(backBuf, 0, 0, { width: bw, height: bh });
                    doc.end();
                });
            })
            .catch(reject);
    });
}

/**
 * Generate + Upload to Supabase Storage
 * - returns { storagePath, publicUrl }
 */
async function generateAndUploadCardPDF({
    cardName, name, cardNumber, validFrom, validThru,
    bucket = "elite-cards", pathPrefix = "cards/"
}) {
    if (!cardName) throw new Error("cardName is required");
    if (!cardNumber) throw new Error("cardNumber is required");

    // 1) Render front with overlay
    const { buffer: frontBuf, backPath } = await renderFront(cardName, {
        name, cardNumber, validFrom, validThru
    });

    // 2) Build PDF buffer
    const pdfBuffer = await makePdfBuffer(frontBuf, backPath);

    // 3) Prepare safe storage path (replace spaces and slashes)
    const safeCardNumber = String(cardNumber).replace(/[^\w\-]/g, "_");
    const storagePath = `${pathPrefix}${safeCardNumber}.pdf`;

    // 4) Upload to Supabase Storage (upsert)
    const { error: upErr } = await supabaseAdmin.storage
        .from(bucket)
        .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true });

    if (upErr) {
        // Provide useful error
        throw new Error(`Storage upload error: ${upErr.message || JSON.stringify(upErr)}`);
    }

    // 5) Get public URL
    const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);
    const publicUrl = pub?.publicUrl ?? null;

    return { storagePath, publicUrl };
}

module.exports = {
    renderFront,
    makePdfBuffer,
    generateAndUploadCardPDF,
};
