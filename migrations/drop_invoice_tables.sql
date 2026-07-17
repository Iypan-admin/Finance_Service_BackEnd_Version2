-- Invoice System Database Removal
-- Run this script to drop all invoice-related tables and their dependencies

-- Drop tables in reverse order of dependencies (children first, then parents)

-- 1. Drop status history table (depends on center_invoices)
DROP TABLE IF EXISTS invoice_status_history CASCADE;

-- 2. Drop invoice items table (depends on center_invoices)
DROP TABLE IF EXISTS center_invoice_items CASCADE;

-- 3. Drop invoices table (parent table)
DROP TABLE IF EXISTS center_invoices CASCADE;

-- 4. Drop any indexes that might remain
DROP INDEX IF EXISTS idx_center_invoices_center_id;
DROP INDEX IF EXISTS idx_center_invoices_status;
DROP INDEX IF EXISTS idx_center_invoices_period;
DROP INDEX IF EXISTS idx_center_invoices_created_at;
DROP INDEX IF EXISTS idx_center_invoices_number;
DROP INDEX IF EXISTS idx_center_invoices_unique_cycle;
DROP INDEX IF EXISTS idx_invoice_items_invoice_id;
DROP INDEX IF EXISTS idx_invoice_items_payment_id;
DROP INDEX IF EXISTS idx_invoice_items_student_id;
DROP INDEX IF EXISTS idx_status_history_invoice_id;
DROP INDEX IF EXISTS idx_status_history_changed_at;

-- Verification query
SELECT 
    'Tables dropped successfully' as status,
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'center_invoices') THEN 'center_invoices: DROPPED'
        ELSE 'center_invoices: EXISTS'
    END as center_invoices_status,
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'center_invoice_items') THEN 'center_invoice_items: DROPPED'
        ELSE 'center_invoice_items: EXISTS'
    END as invoice_items_status,
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoice_status_history') THEN 'invoice_status_history: DROPPED'
        ELSE 'invoice_status_history: EXISTS'
    END as history_status;







