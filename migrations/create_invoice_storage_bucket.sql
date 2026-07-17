-- Invoice System Storage Bucket Creation
-- Run this script to create the Supabase Storage bucket for invoice PDFs
--
-- NOTE: This script is for reference. Supabase Storage buckets must be created
-- through the Supabase Dashboard or using the Supabase Management API.
-- 
-- To create the bucket manually:
-- 1. Go to Supabase Dashboard → Storage
-- 2. Click "New bucket"
-- 3. Name: "invoices"
-- 4. Public: Yes (if PDFs should be publicly accessible) or No (if authentication required)
-- 5. File size limit: Set as needed (default is fine)
-- 6. Allowed MIME types: application/pdf (optional, for security)
--
-- OR use the Supabase Management API with the following settings:

-- Bucket Configuration:
-- Name: invoices
-- Public: true (recommended for PDF access)
-- File size limit: 52428800 (50 MB) - adjust as needed
-- Allowed MIME types: application/pdf

-- Storage policies (Row Level Security) should be configured based on your needs:
-- - Centers can upload their own invoices
-- - Centers can view their own invoices
-- - Admins can view all invoices

-- Example RLS Policies (run these in Supabase SQL Editor after bucket creation):

-- Policy: Centers can upload invoices
-- CREATE POLICY "Centers can upload invoices"
-- ON storage.objects FOR INSERT
-- TO authenticated
-- WITH CHECK (
--     bucket_id = 'invoices' AND
--     (storage.foldername(name))[1] = auth.uid()::text OR
--     EXISTS (
--         SELECT 1 FROM centers 
--         WHERE center_admin = auth.uid()
--     )
-- );

-- Policy: Centers can view their own invoices
-- CREATE POLICY "Centers can view invoices"
-- ON storage.objects FOR SELECT
-- TO authenticated
-- USING (
--     bucket_id = 'invoices' AND
--     (storage.foldername(name))[1] = auth.uid()::text OR
--     EXISTS (
--         SELECT 1 FROM centers 
--         WHERE center_admin = auth.uid()
--     )
-- );

-- Policy: Admins can manage all invoices
-- CREATE POLICY "Admins can manage all invoices"
-- ON storage.objects FOR ALL
-- TO authenticated
-- USING (
--     bucket_id = 'invoices' AND
--     EXISTS (
--         SELECT 1 FROM users 
--         WHERE id = auth.uid() AND role IN ('admin', 'financial')
--     )
-- );

-- Note: For public bucket (recommended for easier PDF access):
-- - Set bucket to public
-- - No RLS policies needed for SELECT
-- - Still use RLS for INSERT/UPDATE/DELETE if needed







