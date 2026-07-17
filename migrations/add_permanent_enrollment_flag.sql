-- Migration: Add is_permanent flag to enrollment table
-- Purpose: Mark enrollments that have completed final EMI as permanent (never expire)
-- Date: 2024

-- Add is_permanent column to enrollment table
ALTER TABLE public.enrollment 
ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN DEFAULT false;

-- Add comment
COMMENT ON COLUMN public.enrollment.is_permanent IS 
    'If true, enrollment will never auto-expire (set when final EMI payment is approved)';

-- Create index for performance (optional, but helpful for expiration queries)
CREATE INDEX IF NOT EXISTS idx_enrollment_is_permanent ON public.enrollment(is_permanent) 
WHERE is_permanent = true;

-- Update existing enrollments to ensure default value
UPDATE public.enrollment 
SET is_permanent = false 
WHERE is_permanent IS NULL;




