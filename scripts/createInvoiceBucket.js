// Script to create Supabase Storage bucket for invoices
// Run with: node scripts/createInvoiceBucket.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role key for admin operations

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function createInvoiceBucket() {
    try {
        console.log('🔧 Creating invoice storage bucket...');

        // Check if bucket already exists
        const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
        
        if (listError) {
            console.error('❌ Error listing buckets:', listError);
            return;
        }

        const bucketExists = existingBuckets.some(bucket => bucket.name === 'invoices');

        if (bucketExists) {
            console.log('✅ Bucket "invoices" already exists');
            return;
        }

        // Create the bucket
        const { data, error } = await supabase.storage.createBucket('invoices', {
            public: true, // Make bucket public for easier PDF access
            fileSizeLimit: 52428800, // 50 MB limit
            allowedMimeTypes: ['application/pdf'] // Only allow PDF files
        });

        if (error) {
            console.error('❌ Error creating bucket:', error);
            return;
        }

        console.log('✅ Bucket "invoices" created successfully!');
        console.log('📋 Bucket details:', data);

        // Set up bucket policies (optional - uncomment if needed)
        /*
        console.log('🔧 Setting up bucket policies...');
        
        // Note: RLS policies for storage.objects must be set up in Supabase Dashboard
        // or via SQL. This is just informational.
        
        console.log('ℹ️  Storage policies should be configured in Supabase Dashboard:');
        console.log('   1. Go to Storage → Policies');
        console.log('   2. Create policies for centers to upload/view their invoices');
        console.log('   3. Create policies for admins to manage all invoices');
        */
        
        console.log('\n✅ Setup complete!');
        console.log('📝 Next steps:');
        console.log('   1. Verify bucket exists in Supabase Dashboard → Storage');
        console.log('   2. Configure RLS policies if needed (see create_invoice_storage_bucket.sql)');
        console.log('   3. Test by uploading a PDF to verify bucket is working');

    } catch (error) {
        console.error('❌ Unexpected error:', error);
    }
}

// Run the script
createInvoiceBucket();







