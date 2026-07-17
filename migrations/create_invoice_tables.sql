-- Invoice System Database Creation
-- Run this script to create all invoice-related tables and their dependencies

-- Create immutable function for date truncation (required for generated columns and indexes)
CREATE OR REPLACE FUNCTION immutable_date_trunc_month(date_val DATE)
RETURNS DATE AS $$
BEGIN
    RETURN DATE_TRUNC('month', date_val)::DATE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 1. Create center_invoices table (main invoice table)
CREATE TABLE IF NOT EXISTS center_invoices (
    invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT NOT NULL UNIQUE,
    center_id UUID NOT NULL REFERENCES centers(center_id) ON DELETE CASCADE,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    period_month DATE NOT NULL GENERATED ALWAYS AS (immutable_date_trunc_month(period_start)) STORED, -- For unique constraint
    cycle_number INTEGER NOT NULL, -- 1, 2, or 3 for the cycle in the month
    total_net_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total_center_share DECIMAL(12, 2) NOT NULL DEFAULT 0, -- 20% of net amount
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Verified', 'Approved')),
    pdf_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- 2. Create center_invoice_items table (individual payment items in invoice)
CREATE TABLE IF NOT EXISTS center_invoice_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES center_invoices(invoice_id) ON DELETE CASCADE,
    payment_id TEXT NOT NULL, -- Store payment_id as text (Razorpay payment ID or manual ID)
    payment_uuid UUID, -- Reference to student_course_payment table's primary key (id) if exists
    student_id UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    registration_number TEXT,
    course_name TEXT NOT NULL,
    transaction_date DATE NOT NULL,
    fee_term TEXT NOT NULL, -- 'Full' or 'EMI - 1', 'EMI - 2', etc.
    fee_paid DECIMAL(12, 2) NOT NULL, -- Final amount
    net_amount DECIMAL(12, 2) NOT NULL, -- Excluding GST (18%)
    center_share DECIMAL(12, 2) NOT NULL, -- 20% of net amount
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one payment appears in only one invoice (using payment_id)
    UNIQUE(payment_id)
);

-- 3. Create invoice_status_history table (optional: track status changes)
CREATE TABLE IF NOT EXISTS invoice_status_history (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES center_invoices(invoice_id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT
);

-- 4. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_center_invoices_center_id ON center_invoices(center_id);
CREATE INDEX IF NOT EXISTS idx_center_invoices_status ON center_invoices(status);
CREATE INDEX IF NOT EXISTS idx_center_invoices_period ON center_invoices(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_center_invoices_created_at ON center_invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_center_invoices_number ON center_invoices(invoice_number);

-- Unique index to ensure one invoice per center per cycle per month
-- Uses the generated column period_month for immutable index expression
CREATE UNIQUE INDEX IF NOT EXISTS idx_center_invoices_unique_cycle 
    ON center_invoices(center_id, cycle_number, period_month);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON center_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_payment_id ON center_invoice_items(payment_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_student_id ON center_invoice_items(student_id);

CREATE INDEX IF NOT EXISTS idx_status_history_invoice_id ON invoice_status_history(invoice_id);
CREATE INDEX IF NOT EXISTS idx_status_history_changed_at ON invoice_status_history(changed_at DESC);

-- 5. Create function to auto-generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
    center_prefix TEXT;
    year_month TEXT;
    sequence_num INTEGER;
BEGIN
    -- Get center code or use first 3 letters of center name
    SELECT UPPER(SUBSTRING(REPLACE(center_name, ' ', ''), 1, 3))
    INTO center_prefix
    FROM centers
    WHERE center_id = NEW.center_id;
    
    -- Format: YYYYMM (e.g., 202510)
    year_month := TO_CHAR(NEW.period_start, 'YYYYMM');
    
    -- Get sequence number for this center and month
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM center_invoices
    WHERE center_id = NEW.center_id
    AND period_month = immutable_date_trunc_month(NEW.period_start);
    
    -- Format: CENTER-YYYYMM-001
    NEW.invoice_number := center_prefix || '-' || year_month || '-' || LPAD(sequence_num::TEXT, 3, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create trigger to auto-generate invoice number
DROP TRIGGER IF EXISTS trigger_generate_invoice_number ON center_invoices;
CREATE TRIGGER trigger_generate_invoice_number
    BEFORE INSERT ON center_invoices
    FOR EACH ROW
    WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
    EXECUTE FUNCTION generate_invoice_number();

-- 7. Create trigger to track status changes
CREATE OR REPLACE FUNCTION track_invoice_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO invoice_status_history (invoice_id, old_status, new_status, changed_by)
        VALUES (NEW.invoice_id, OLD.status, NEW.status, NEW.created_by);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_track_invoice_status ON center_invoices;
CREATE TRIGGER trigger_track_invoice_status
    AFTER UPDATE OF status ON center_invoices
    FOR EACH ROW
    EXECUTE FUNCTION track_invoice_status_change();

-- Verification query
SELECT 
    'Tables created successfully' as status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'center_invoices') THEN 'center_invoices: CREATED'
        ELSE 'center_invoices: FAILED'
    END as center_invoices_status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'center_invoice_items') THEN 'center_invoice_items: CREATED'
        ELSE 'center_invoice_items: FAILED'
    END as invoice_items_status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoice_status_history') THEN 'invoice_status_history: CREATED'
        ELSE 'invoice_status_history: FAILED'
    END as history_status;

