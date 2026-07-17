-- Update invoice statuses to support new workflow
-- Run this script to add new status values

-- First, update existing invoices if needed (optional migration)
-- No data changes needed if current statuses are fine

-- Update the CHECK constraint to include new statuses
ALTER TABLE center_invoices 
DROP CONSTRAINT IF EXISTS center_invoices_status_check;

ALTER TABLE center_invoices 
ADD CONSTRAINT center_invoices_status_check 
CHECK (status IN ('Pending', 'MF Verified', 'Finance Accepted', 'Invoice Paid', 'Verified', 'Approved'));

-- Note: Keeping old statuses ('Verified', 'Approved') for backward compatibility
-- New workflow: Pending → MF Verified → Finance Accepted → Invoice Paid







