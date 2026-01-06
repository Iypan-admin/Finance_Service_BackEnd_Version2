
// utils/invoicePdf.js
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const PDFDocument = require("pdfkit");
const { PDFDocument: PDFLib, rgb, degrees } = require("pdf-lib");
const { supabaseAdmin } = require("../config/supabaseClient");

// --- Template image path ---
const INVOICE_TEMPLATE = path.join(
  __dirname,
  "..",
  "templates",
  "invoice_letterpad.jpg"
);

// --- Font paths ---
const FONT_PATHS = {
  poppins: path.join(__dirname, "..", "fonts", "Poppins-Bold.ttf"),
  dejavu: path.join(__dirname, "..", "fonts", "DejaVuSans.ttf"),
};

/**
 * Format date to DD.MM.YYYY format
 */
function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Format currency to Indian format
 */
function formatCurrency(amount) {
  return `INR ${Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getFiscalYearLabel(date) {
  const d = new Date(date || Date.now());
  const startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

function formatInvoiceDisplayNumber(invoiceData = {}) {
  const getInitials = (name = "") =>
    String(name)
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .toUpperCase();

  const sanitizeCode = (value = "") =>
    String(value)
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();

  const rawDisplay = invoiceData.invoice_display_number;
  if (rawDisplay) {
    return String(rawDisplay).toUpperCase();
  }

  const rawNumber = invoiceData.invoice_number;
  if (typeof rawNumber === "string" && rawNumber.includes("/")) {
    return rawNumber.toUpperCase();
  }

  const user = invoiceData.currentUser || invoiceData.user || {};

  const codeCandidates = [
    invoiceData.center_admin_name,
    invoiceData.center_admin_full_name,
    invoiceData.currentUser?.name,
    invoiceData.currentUser?.full_name,
    invoiceData.center_username,
    invoiceData.centerUserName,
    user.center_username,
    user.centerUserName,
    invoiceData.center_shortcode,
    invoiceData.center_short_code,
    invoiceData.center_shortname,
    invoiceData.center_short_name,
    user.center_shortcode,
    user.center_short_code,
    user.center_shortname,
    user.center_short_name,
    invoiceData.center_code,
    invoiceData.short_code,
    invoiceData.shortcode,
    user.center_code,
    user.short_code,
    user.shortcode,
  ];

  let centerSegment = codeCandidates
    .map(sanitizeCode)
    .find((code) => Boolean(code));

  if (!centerSegment) {
    const nameCandidates = [
      invoiceData.center_admin_name,
      invoiceData.center_admin_full_name,
      invoiceData.center_name,
      user.center_name,
      user.name,
      invoiceData.currentUser?.name,
      invoiceData.currentUser?.full_name,
    ];
    const nameInitials = nameCandidates
      .map(getInitials)
      .find((initials) => Boolean(initials));
    centerSegment = nameInitials || "INV";
  }

  const yearSegment = getFiscalYearLabel(invoiceData.invoice_date);

  let sequence = "001";
  const sourceSequence =
    invoiceData.sequence_number ||
    invoiceData.invoice_sequence ||
    invoiceData.invoice_count ||
    invoiceData.next_sequence;

  if (sourceSequence) {
    sequence = String(sourceSequence).padStart(3, "0");
  } else if (typeof rawNumber === "string") {
    const match = rawNumber.match(/(\d{1,})$/);
    if (match) {
      sequence = match[1].padStart(3, "0");
    }
  }

  return `${centerSegment}/INV/${yearSegment}/${sequence}`;
}

/**
 * Generate invoice PDF using letter pad template
 * @param {Object} invoiceData - Invoice data including items, center info, dates
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function generateInvoicePDF(invoiceData) {
  try {
    // Check if template exists
    if (!fs.existsSync(INVOICE_TEMPLATE)) {
      throw new Error(`Invoice template not found: ${INVOICE_TEMPLATE}`);
    }

    // Read template image
    const templateImage = await sharp(INVOICE_TEMPLATE);
    const templateMeta = await templateImage.metadata();
    const { width, height } = templateMeta;

    // Create PDF document
    const doc = new PDFDocument({
      size: [width, height],
      margin: 0,
      autoFirstPage: false,
    });

    // Prepare font paths
    const fontPath = fs.existsSync(FONT_PATHS.poppins)
      ? FONT_PATHS.poppins
      : FONT_PATHS.dejavu;

    return new Promise((resolve, reject) => {
      const chunks = [];
      doc.on("data", chunks.push.bind(chunks));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      try {
        // Add page with template as background
        doc.addPage({ size: [width, height], margin: 0 });

        // Draw template image as background
        doc.image(INVOICE_TEMPLATE, 0, 0, { width, height });

        // Register font
        if (fs.existsSync(fontPath)) {
          doc.registerFont("InvoiceFont", fontPath);
        }

        const headingFont = fs.existsSync(fontPath) ? "InvoiceFont" : "Helvetica-Bold";
        const bodyFont = "Helvetica";
        const BASE_FONT_SIZE = 14;
        const CHARACTER_SPACING = 1.5;
const getLineAdvance = (size = BASE_FONT_SIZE, multiplier = 1.5) => size * multiplier;

const drawTextWithSpacing = (text, x, y, options = {}) => {
          if (!text && options.defaultText) {
            text = options.defaultText;
          }
          if (!text) {
            return 0;
          }

          const characters = String(text).split("");
          const fontName = options.font ?? bodyFont;
          const fontSize = options.fontSize ?? BASE_FONT_SIZE;
          const color = options.color ?? "#0f172a";
  const align = options.align || "left";
  const verticalAlign = options.verticalAlign || "top";
          const width = options.width;

          doc.font(fontName).fontSize(fontSize).fillColor(color);

          if (!width) {
            doc.text(text, x, y);
            return doc.widthOfString(text);
          }

          const rawWidth = doc.widthOfString(text);
          const maxSpacing = CHARACTER_SPACING;
          const available = Math.max(width, rawWidth);

          if (rawWidth > width) {
            doc.text(text, x, y, { width, align });
            return width;
          }

          let spacing = 0;
          if (characters.length > 1) {
            spacing = Math.min(
              maxSpacing,
              Math.max((available - rawWidth) / (characters.length - 1), 0)
            );
          }

          const totalWidth = rawWidth + spacing * Math.max(characters.length - 1, 0);
          let startX = x;

          if (align === "center") {
            startX = x + (width - totalWidth) / 2;
          } else if (align === "right") {
            startX = x + width - totalWidth;
          }

  let cursorX = startX;
  let cursorY = y;

  if (verticalAlign === "middle") {
    const ascent = doc.currentLineHeight(true);
    cursorY = y - ascent / 2;
  } else if (verticalAlign === "bottom") {
    const lineHeight = doc.currentLineHeight(true);
    cursorY = y - lineHeight;
  }
          characters.forEach((char, index) => {
    doc.text(char, cursorX, cursorY);
            cursorX += doc.widthOfString(char);
            if (index !== characters.length - 1) {
              cursorX += spacing;
            }
          });

          return cursorX - startX;
        };

        const applyTextStyle = (fontName, size, color = "#000000") => {
          doc.font(fontName).fontSize(size).fillColor(color);
        };

        // === INVOICE DATA OVERLAY ===
        // Position constants (adjust these based on your letter pad template)
        const leftMargin = 100;
        const rightMargin = 100;
        const topMargin = 180;
        let currentY = topMargin;

        const advance = getLineAdvance(BASE_FONT_SIZE);

        const drawCenteredLine = (text, options = {}) => {
          const fontName = options.font ?? bodyFont;
          const fontSize = options.fontSize ?? BASE_FONT_SIZE;
          const color = options.color ?? "#0f172a";
          const spacingMultiplier = options.lineSpacingMultiplier ?? 1.5;
          doc.font(fontName).fontSize(fontSize).fillColor(color);

          const contentWidth = doc.widthOfString(text) + CHARACTER_SPACING * (text.length - 1);
          const centerX = (width - contentWidth) / 2;
          drawTextWithSpacing(text, centerX, currentY, {
            font: fontName,
            fontSize,
            color,
            verticalAlign: options.verticalAlign,
          });
          currentY += getLineAdvance(fontSize, spacingMultiplier);
        };

        // Headings and metadata
        // Add 2 rows of spacing before INVOICE BILL heading
        currentY += advance * 4;
        drawCenteredLine("INVOICE BILL", {
          font: headingFont,
          fontSize: BASE_FONT_SIZE + 12,
          color: "#1e3a8a",
          lineSpacingMultiplier: 1.1,
          verticalAlign: "baseline",
        });
        const cycleText = invoiceData.cycle_number ? `Cycle ${invoiceData.cycle_number}` : "Cycle";
        drawCenteredLine(cycleText, {
          font: headingFont,
          fontSize: BASE_FONT_SIZE + 6,
          lineSpacingMultiplier: 1.2,
          verticalAlign: "baseline",
        });

        const drawLabelValue = (label, value) => {
          const labelText = `${label} `;
          const labelWidth = doc.widthOfString(labelText) + CHARACTER_SPACING * (labelText.length - 1);
          const valueWidth = doc.widthOfString(value) + CHARACTER_SPACING * (value.length - 1);
          const totalWidth = labelWidth + valueWidth;
          const startX = width - rightMargin - totalWidth;

          drawTextWithSpacing(labelText, startX, currentY, {
            font: "Helvetica-Bold",
            fontSize: BASE_FONT_SIZE,
          });

          const valueX = startX + labelWidth;
          drawTextWithSpacing(value, valueX, currentY, {
            fontSize: BASE_FONT_SIZE,
          });
          currentY += advance;
        };

        drawLabelValue("Date:", formatDate(invoiceData.invoice_date) || "-");
        drawLabelValue("Invoice No:", formatInvoiceDisplayNumber(invoiceData));

        // Address block
        drawTextWithSpacing("To:", leftMargin, currentY, {
          font: "Helvetica-Bold",
          fontSize: BASE_FONT_SIZE,
        });
        currentY += advance;

        const addressLines = [
          "IYAPAN EDUCATIONAL CENTRE PRIVATE LIMITED",
          "8/3, Athreyapuram 2nd Street,",
          "Choolaimedu, Chennai–600094.",
          "CIN: U85300TN2024PTC168304",
        ];

        addressLines.forEach((line) => {
          drawTextWithSpacing(line, leftMargin, currentY, {
            fontSize: BASE_FONT_SIZE,
          });
          currentY += advance;
        });

        const periodText = `Payment Period: ${formatDate(invoiceData.period_start)} - ${formatDate(
          invoiceData.period_end
        )}`;
        drawCenteredLine(periodText);
        currentY += advance;

        // === STUDENT PAYMENT TABLE ===
        const cellPadding = 12;
        const headerHeight = BASE_FONT_SIZE * 3.8;
        const minRowHeight = BASE_FONT_SIZE * 2;
        const rowSpacing = 0;

        const getColumnPadding = (columnKey) =>
          columnKey === "sno" ? Math.max(4, cellPadding - 4) : cellPadding;
        
        const colWidths = {
          sno: 55,
          studentInfo: 180,
          course: 150,
          date: 110,
          feeTerm: 90,
          eliteDiscount: 100,
          feePaid: 120,
          netAmount: 130,
          totalAmount: 130,
        };

        const columnOrder = [
          "sno",
          "studentInfo",
          "course",
          "date",
          "feeTerm",
          "eliteDiscount",
          "feePaid",
          "netAmount",
          "totalAmount",
        ];

        const tableWidth =
          colWidths.sno +
          colWidths.studentInfo +
          colWidths.course +
          colWidths.date +
          colWidths.feeTerm +
          colWidths.eliteDiscount +
          colWidths.feePaid +
          colWidths.netAmount +
          colWidths.totalAmount;
        
        // Position table centered on page
        const tableLeft = (width - tableWidth) / 2;
        
        // Place table directly after Payment Period
        const tableTop = currentY;

        // Helper function to draw cell border
        const drawCellBorder = (x, y, width, height, color = "#e0e0e0") => {
          doc.strokeColor(color).lineWidth(0.5);
          // Top border
          doc.moveTo(x, y).lineTo(x + width, y).stroke();
          // Bottom border
          doc.moveTo(x, y + height).lineTo(x + width, y + height).stroke();
          // Left border
          doc.moveTo(x, y).lineTo(x, y + height).stroke();
          // Right border
          doc.moveTo(x + width, y).lineTo(x + width, y + height).stroke();
        };

        // Draw table header background
        doc.fillColor("#e5e7eb")
          .rect(tableLeft, tableTop, tableWidth, headerHeight)
          .fill();

        // Draw header cell borders
        let borderX = tableLeft;
        const headerColumns = [
          colWidths.sno,
          colWidths.studentInfo,
          colWidths.course,
          colWidths.date,
          colWidths.feeTerm,
          colWidths.eliteDiscount,
          colWidths.feePaid,
          colWidths.netAmount,
          colWidths.totalAmount,
        ];
        
        headerColumns.forEach((width, index) => {
          drawCellBorder(borderX, tableTop, width, headerHeight, "#d1d5db");
          borderX += width;
        });

        // Pre-compute column start positions
        const columnPositions = columnOrder.reduce((positions, columnKey, index) => {
          if (index === 0) {
            positions.push(tableLeft);
          } else {
            const prevColumn = columnOrder[index - 1];
            positions.push(positions[index - 1] + colWidths[prevColumn]);
          }
          return positions;
        }, []);

        // Header text with better spacing and styling
        applyTextStyle(headingFont, BASE_FONT_SIZE, "#111827");
        
        // Center header text vertically in doubled header height
        const headerTextBaseline = tableTop + headerHeight / 2;
        
        const payoutLabelLines =
          invoiceData.center_admin_name || invoiceData.center_name
            ? [
                "20% & 80%",
                "Payout",
                `(${invoiceData.center_admin_name || invoiceData.center_name})`,
              ]
            : ["20% & 80%", "Payout"];

        const netAmountLabelLines = ["Net Amount", "(Excl. GST)"];

        const headerLinesMap = {
          sno: ["S.No"],
          studentInfo: ["Student Info"],
          course: ["Course"],
          date: ["Transaction", "Date"],
          feeTerm: ["Fee Term"],
          eliteDiscount: ["Elite", "Discount"],
          feePaid: ["Fee Paid"],
          netAmount: netAmountLabelLines,
          totalAmount: payoutLabelLines,
        };

        columnOrder.forEach((columnKey, index) => {
          const columnPadding = getColumnPadding(columnKey);
          const columnWidth = colWidths[columnKey] - columnPadding * (columnKey === "studentInfo" ? 1.2 : 1.6);
          const lines = headerLinesMap[columnKey];

          if (lines.length === 1) {
            drawTextWithSpacing(
              lines[0],
              columnPositions[index] + columnPadding,
              headerTextBaseline,
              {
                font: headingFont,
                fontSize: BASE_FONT_SIZE,
                color: "#111827",
                width: columnWidth,
                align: "center",
                verticalAlign: "middle",
              }
            );
          } else {
            const totalHeight = lines.length * BASE_FONT_SIZE + (lines.length - 1) * 3;
            let currentLineY = headerTextBaseline - totalHeight / 2 + BASE_FONT_SIZE / 2;

            lines.forEach((line) => {
              drawTextWithSpacing(line, columnPositions[index] + columnPadding, currentLineY, {
                font: headingFont,
                fontSize: BASE_FONT_SIZE,
                color: "#111827",
                width: columnWidth,
                align: "center",
                verticalAlign: "middle",
              });

              currentLineY += BASE_FONT_SIZE + 3;
            });
          }
        });

        applyTextStyle(bodyFont, BASE_FONT_SIZE, "#1f2937");

        const normalizedRows = invoiceData.items.map((item, index) => {
          const cellValues = {
            sno: String(index + 1),
            studentInfo: [
              item.student_name || "N/A",
              item.registration_number || "N/A",
            ],
            course: item.course_name || "N/A",
            date: formatDate(item.transaction_date),
            feeTerm: item.fee_term || "Full",
            eliteDiscount: item.discount_percentage != null ? `${item.discount_percentage}%` : "0%",
            feePaid: formatCurrency(item.fee_paid),
            netAmount: formatCurrency(item.net_amount),
            totalAmount: formatCurrency(item.total_amount),
          };
          const textHeights = columnOrder.map((columnKey) => {
            const printable = cellValues[columnKey];
            const columnPadding = getColumnPadding(columnKey);
            let usableWidth = colWidths[columnKey] - columnPadding * 2;

            if (columnKey === "studentInfo") {
              usableWidth -= columnPadding * 0.6;
            } else if (columnKey === "course") {
              usableWidth -= columnPadding * 0.6;
            }

            if (Array.isArray(printable)) {
              doc.font(bodyFont).fontSize(BASE_FONT_SIZE);
              const lineHeights = printable.map((line) =>
                doc.heightOfString(line, { width: usableWidth, align: "center" })
              );
              return lineHeights.reduce((total, h) => total + h, 0) + (printable.length - 1) * 4;
            }

            return doc.heightOfString(printable ?? "", {
              width: usableWidth,
              align: "center",
            });
          });

          const rowHeight = Math.max(
            minRowHeight,
            ...textHeights.map((h) => h + cellPadding * 1.5)
          ) + rowSpacing;

          return { cellValues, rowHeight, textHeights };
        });

        const totalRowHeight = 32;

        // Table Rows
        currentY = tableTop + headerHeight;
        doc.fontSize(13).fillColor("#1f2937");

        normalizedRows.forEach(({ cellValues, rowHeight, textHeights }) => {
          const rowY = currentY;

          // Draw row cell borders
          borderX = tableLeft;
          headerColumns.forEach((width) => {
            drawCellBorder(borderX, rowY, width, rowHeight, "#e5e7eb");
            borderX += width;
          });

          // Draw cell text
          columnOrder.forEach((columnKey, columnIndex) => {
            const value = cellValues[columnKey] ?? "";
            const columnPadding = getColumnPadding(columnKey);

            const textHeight = textHeights[columnIndex] ?? minRowHeight;
            const textBaseline = rowY + rowHeight / 2;

          const maxContentWidth = colWidths[columnKey] - columnPadding * 2;
          const renderWidth =
            columnKey === "studentInfo"
              ? maxContentWidth - columnPadding * 0.6
              : columnKey === "course"
              ? maxContentWidth - columnPadding * 0.6
              : maxContentWidth;

          if (Array.isArray(value)) {
            doc.font(bodyFont).fontSize(BASE_FONT_SIZE).fillColor("#1f2937");
            const lineHeights = value.map((line) =>
              doc.heightOfString(line, { width: renderWidth, align: "center" })
            );
            const totalHeight =
              lineHeights.reduce((total, h) => total + h, 0) +
              (value.length - 1) * 4;

            let currentLineY = textBaseline - totalHeight / 2;

            value.forEach((line, idx) => {
              const lineHeight = lineHeights[idx];
              doc.text(line, columnPositions[columnIndex] + columnPadding, currentLineY, {
                width: renderWidth,
                align: "center",
              });
              currentLineY += lineHeight + 4;
            });
          } else {
            drawTextWithSpacing(value, columnPositions[columnIndex] + columnPadding, textBaseline, {
              font: bodyFont,
              fontSize: BASE_FONT_SIZE,
              color: "#1f2937",
              width: renderWidth,
              align: "center",
              verticalAlign: "middle",
            });
          }
          });

          currentY += rowHeight;
        });

        // Total Row
        const totalRowY = currentY;

        // Total row background (slightly gray)
        doc.fillColor("#f9f9f9")
          .rect(tableLeft, totalRowY, tableWidth, totalRowHeight)
          .fill();

        // Total row borders
        borderX = tableLeft;
        headerColumns.forEach((width) => {
          drawCellBorder(borderX, totalRowY, width, totalRowHeight, "#d1d5db");
          borderX += width;
        });

        // Total label and values
        const netAmountIndex = columnOrder.indexOf("netAmount");
        const totalAmountIndex = columnOrder.indexOf("totalAmount");

        const totalTextY = totalRowY + (totalRowHeight / 2) - 2;
        
        // "Total:" text in Net Amount column (right-aligned)
        drawTextWithSpacing("Total:", 
          columnPositions[netAmountIndex] + getColumnPadding("netAmount"),
          totalTextY,
          {
            font: headingFont,
            fontSize: BASE_FONT_SIZE,
            color: "#111827",
            width: colWidths.netAmount - getColumnPadding("netAmount") * 2,
            align: "right",
          }
        );

        // Total amount in 20% & 80% column (centered)
        drawTextWithSpacing(
          formatCurrency(invoiceData.total_center_share),
          columnPositions[totalAmountIndex] + getColumnPadding("totalAmount"),
          totalTextY,
          {
            font: headingFont,
            fontSize: BASE_FONT_SIZE,
            color: "#111827",
            width: colWidths.totalAmount - getColumnPadding("totalAmount") * 2,
            align: "center",
          }
        );

        // === AFTER TABLE: AUTHORIZED SIGNATURE ===
        currentY = totalRowY + totalRowHeight + advance;
        // Add 2 rows of spacing before Authorized Signature
        currentY += advance * 2;
        
        // Authorized Signature (Right Side)
        applyTextStyle(bodyFont, BASE_FONT_SIZE, "#000000");
        const signatureText = "Authorized Signature";
        const signatureTextWidth = doc.widthOfString(signatureText) + CHARACTER_SPACING * (signatureText.length - 1);
        const signatureRightX = width - rightMargin - signatureTextWidth;
 
        drawTextWithSpacing(signatureText, signatureRightX, currentY, {
          font: bodyFont,
          fontSize: BASE_FONT_SIZE,
          color: "#000000",
        });
        currentY += advance;
 
         // Center Name (Right Side, below signature)
         applyTextStyle(bodyFont, BASE_FONT_SIZE, "#000000");
         const centerNameText = ` ${invoiceData.center_name}`;
         const centerNameTextWidth = doc.widthOfString(centerNameText) + CHARACTER_SPACING * (centerNameText.length - 1);
         const centerNameRightX = width - rightMargin - centerNameTextWidth;
 
         applyTextStyle(bodyFont, BASE_FONT_SIZE, "#000000");
         drawTextWithSpacing(centerNameText, centerNameRightX, currentY, {
           font: bodyFont,
           fontSize: BASE_FONT_SIZE,
           color: "#000000",
         });
         currentY += advance;

         // Digital invoice disclaimer (Last row at bottom of page)
         applyTextStyle(bodyFont, BASE_FONT_SIZE, "#4b5563");
         const digitalDisclaimer = "Digital Invoice - Computer Generated";
         const disclaimerWidth = doc.widthOfString(digitalDisclaimer) + CHARACTER_SPACING * (digitalDisclaimer.length - 1);
         const disclaimerX = (width - disclaimerWidth) / 2;
         drawTextWithSpacing(digitalDisclaimer, disclaimerX, currentY, {
           font: bodyFont,
           fontSize: BASE_FONT_SIZE,
           color: "#4b5563",
         });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    throw new Error(`Failed to generate invoice PDF: ${error.message}`);
  }
}

/**
 * Generate invoice PDF and upload to Supabase Storage
 * @param {Object} invoiceData - Invoice data
 * @param {string} bucket - Storage bucket name (default: 'invoices')
 * @param {string} pathPrefix - Storage path prefix (default: 'invoices/')
 * @returns {Promise<Object>} - { storagePath, publicUrl }
 */
async function generateAndUploadInvoicePDF(
  invoiceData,
  bucket = "invoices",
  pathPrefix = "invoices/"
) {
  try {
    // 1) Generate PDF buffer
    const pdfBuffer = await generateInvoicePDF(invoiceData);

    // 2) Prepare safe storage path
    // Use invoice_id as primary identifier (UUID ensures uniqueness)
    // Also include invoice_number for readability in storage
    let storagePath;
    let filesToDelete = [];
    
    if (invoiceData.invoice_id) {
      // Use invoice_id for unique filename
      const safeInvoiceId = String(invoiceData.invoice_id).replace(/[^\w\-]/g, "_");
      storagePath = `${pathPrefix}${safeInvoiceId}.pdf`;
      
      // Delete old PDF file for this invoice (if exists)
      try {
        // Check if file exists and delete it
        const { data: existingFile } = await supabaseAdmin.storage
          .from(bucket)
          .list(pathPrefix, {
            search: safeInvoiceId
          });
        
        if (existingFile && existingFile.length > 0) {
          filesToDelete = existingFile
            .filter(file => file.name.includes(safeInvoiceId) && file.name.endsWith('.pdf'))
            .map(file => `${pathPrefix}${file.name}`);
          
          if (filesToDelete.length > 0) {
            await supabaseAdmin.storage
              .from(bucket)
              .remove(filesToDelete);
          }
        }
      } catch (deleteError) {
        // If deletion fails, continue with upload (non-critical)
        console.warn('Could not delete old PDF files:', deleteError);
      }
    } else {
      // Fallback: use invoice_number with timestamp if invoice_id not available
      const safeInvoiceNumber = String(invoiceData.invoice_number || 'invoice').replace(
        /[^\w\-]/g,
        "_"
      );
      const timestamp = Date.now();
      storagePath = `${pathPrefix}${safeInvoiceNumber}_${timestamp}.pdf`;
    }

    // 4) Upload to Supabase Storage with cache-control headers
    const { error: upErr } = await supabaseAdmin.storage
      .from(bucket)
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
        cacheControl: "no-cache, no-store, must-revalidate", // Prevent caching
      });

    if (upErr) {
      throw new Error(
        `Storage upload error: ${upErr.message || JSON.stringify(upErr)}`
      );
    }

    // 5) Get public URL with cache-busting parameter
    const { data: pub } = supabaseAdmin.storage
      .from(bucket)
      .getPublicUrl(storagePath);

    // Add cache-busting parameters to force fresh load
    const timestamp = Date.now();
    const publicUrl = pub?.publicUrl 
      ? `${pub.publicUrl}?v=${timestamp}&t=${timestamp}` // Add cache-busting parameters
      : null;

    return { storagePath, publicUrl };
  } catch (error) {
    throw new Error(
      `Failed to generate and upload invoice PDF: ${error.message}`
    );
  }
}

/**
 * Add "PAID" watermark to existing PDF and upload it back to Supabase
 * @param {string} pdfUrl - Public URL of the existing PDF
 * @param {string} invoiceId - Invoice ID for storage path
 * @param {string} bucket - Storage bucket name (default: 'invoices')
 * @param {string} pathPrefix - Storage path prefix (default: 'invoices/')
 * @returns {Promise<Object>} - { storagePath, publicUrl }
 */
async function addPaidWatermarkToPDF(
  pdfUrl,
  invoiceId,
  bucket = "invoices",
  pathPrefix = "invoices/"
) {
  try {
    // 1) Download the existing PDF from Supabase Storage
    // Extract storage path from URL or construct it from invoiceId
    const safeInvoiceId = String(invoiceId).replace(/[^\w\-]/g, "_");
    const storagePath = `${pathPrefix}${safeInvoiceId}.pdf`;
    
    // Download PDF from Supabase Storage
    const { data: existingPdfBytes, error: downloadError } = await supabaseAdmin.storage
      .from(bucket)
      .download(storagePath);
    
    if (downloadError || !existingPdfBytes) {
      throw new Error(`Failed to download PDF from storage: ${downloadError?.message || 'PDF not found'}`);
    }
    
    // Convert Blob to ArrayBuffer
    const pdfArrayBuffer = await existingPdfBytes.arrayBuffer();
    
    // 2) Load the PDF using pdf-lib
    const pdfDoc = await PDFLib.load(pdfArrayBuffer);
    const pages = pdfDoc.getPages();
    
    // 3) Add "PAID" watermark to each page
    pages.forEach((page) => {
      const { width, height } = page.getSize();
      
      // Calculate diagonal position (from top-left to bottom-right)
      const fontSize = Math.max(width, height) * 0.15; // 15% of page size
      const text = "PAID";
      
      // Calculate center of page
      const centerX = width / 2;
      const centerY = height / 2;
      
      // Calculate rotation angle (45 degrees clockwise)
      const angle = -45; // Degrees clockwise
      
      // Approximate text dimensions for centering
      const textWidth = fontSize * text.length * 0.6; // Approximate text width
      const textHeight = fontSize;
      
      // Draw centered diagonal "PAID" watermark
      page.drawText(text, {
        x: centerX - textWidth / 2,
        y: centerY - textHeight / 2,
        size: fontSize,
        color: rgb(1, 0, 0), // Red: RGB(255, 0, 0)
        opacity: 0.4, // 40% opacity for semi-transparent
        rotate: { angleRadians: angle }, // Rotate 45 degrees diagonally
      });
    });
    
    // 4) Save the modified PDF
    const modifiedPdfBytes = await pdfDoc.save();
    
    // 5) Upload the modified PDF back to Supabase (replace existing)
    // Use the same storage path that was downloaded
    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(storagePath, modifiedPdfBytes, {
        contentType: "application/pdf",
        upsert: true, // Replace existing file
        cacheControl: "no-cache, no-store, must-revalidate",
      });
    
    if (uploadError) {
      throw new Error(
        `Storage upload error: ${uploadError.message || JSON.stringify(uploadError)}`
      );
    }
    
    // 7) Get public URL with cache-busting parameter
    const { data: pub } = supabaseAdmin.storage
      .from(bucket)
      .getPublicUrl(storagePath);
    
    const timestamp = Date.now();
    const publicUrl = pub?.publicUrl 
      ? `${pub.publicUrl}?v=${timestamp}&t=${timestamp}`
      : null;
    
    return { storagePath, publicUrl };
  } catch (error) {
    throw new Error(
      `Failed to add PAID watermark to PDF: ${error.message}`
    );
  }
}

module.exports = {
  generateInvoicePDF,
  generateAndUploadInvoicePDF,
  addPaidWatermarkToPDF,
  formatDate,
  formatCurrency,
};
