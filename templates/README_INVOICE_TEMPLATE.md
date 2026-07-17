# Invoice Letter Pad Template

## 📋 Required Template File

The invoice PDF generation requires a letter pad template image file.

### File Location
Place your invoice letter pad template at:
```
Finance_Service_Backend-main/templates/invoice_letterpad.jpg
```

### Requirements
- **Format**: JPG/JPEG image
- **Recommended Size**: A4 size (2480 x 3508 pixels at 300 DPI)
- **Content**: Your official invoice letter pad design with logo, company details, etc.
- **Background**: The template will be used as the background, and invoice data will be overlayed on top

### How It Works
1. The template image is loaded as the PDF background
2. Invoice data (center name, date, period, student payment table) is overlayed on top
3. The PDF is generated and uploaded to Supabase Storage

### Testing Without Template
If you don't have the template yet:
1. Create a simple A4-sized JPG with your letter pad design
2. Save it as `invoice_letterpad.jpg` in the templates folder
3. The system will automatically use it when generating invoices

### Position Adjustments
If the text positioning doesn't match your letter pad:
- Edit `Finance_Service_Backend-main/utils/invoicePdf.js`
- Adjust the position constants (leftMargin, topMargin, etc.) based on your template layout







