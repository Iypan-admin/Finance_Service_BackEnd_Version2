const { supabase } = require("../config/supabaseClient");
const { generateAndUploadInvoicePDF, addPaidWatermarkToPDF } = require("../utils/invoicePdf");

const sanitizeCode = (value = "") =>
  String(value)
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

const getInitials = (name = "") =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

const getFiscalYearInfo = (dateInput) => {
  const date = dateInput ? new Date(dateInput) : new Date();
  const currentYear = date.getFullYear();
  const currentMonth = date.getMonth(); // 0-11

  const startYear = currentMonth >= 3 ? currentYear : currentYear - 1;
  const endYear = startYear + 1;

  const startDate = new Date(Date.UTC(startYear, 3, 1)); // April 1st
  const endDate = new Date(Date.UTC(endYear, 2, 31, 23, 59, 59, 999)); // March 31st

  const label = `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
  return { label, startDate, endDate };
};

/**
 * Get current invoice cycle based on date
 * Returns cycle number (1, 2, or 3), payment period, and generation period
 * 
 * New Fixed Structure:
 * - Cycle 1: Payment Period 1-10, Generation Period 11-13 (3 days)
 * - Cycle 2: Payment Period 11-20, Generation Period 21-23 (3 days)
 * - Cycle 3: Payment Period 21-End, Generation Period 1-3 of next month (3 days)
 */
function getCurrentInvoiceCycle(date = new Date()) {
    const day = date.getDate();
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11
    
    let cycleNumber, periodStart, periodEnd, generationStart, generationEnd, periodYear, periodMonth;

    if (day >= 1 && day <= 3) {
        // Days 1-3: Show Cycle 3 from previous month (generation period)
        cycleNumber = 3;
        const prevMonth = month === 0 ? 11 : month - 1;
        const prevYear = month === 0 ? year - 1 : year;
        // Get last day of previous month (handles 28, 29, 30, or 31 days automatically)
        // new Date(year, month + 1, 0) returns the last day of the specified month
        const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
        periodStart = new Date(prevYear, prevMonth, 21);
        periodEnd = new Date(prevYear, prevMonth, daysInPrevMonth);
        generationStart = new Date(year, month, 1); // 1st of current month
        generationEnd = new Date(year, month, 3); // 3rd of current month (3 days)
        periodYear = prevYear;
        periodMonth = prevMonth;
    } else if (day >= 4 && day <= 10) {
        // Days 4-10: Show Cycle 1 of current month (payment period, not yet generation period)
        cycleNumber = 1;
        periodStart = new Date(year, month, 1);
        periodEnd = new Date(year, month, 10);
        generationStart = new Date(year, month, 11);
        generationEnd = new Date(year, month, 13); // 3 days: 11-13
        periodYear = year;
        periodMonth = month;
    } else if (day >= 11 && day <= 13) {
        // Days 11-13: Show Cycle 1 of current month (generation period)
        cycleNumber = 1;
        periodStart = new Date(year, month, 1);
        periodEnd = new Date(year, month, 10);
        generationStart = new Date(year, month, 11);
        generationEnd = new Date(year, month, 13); // 3 days: 11-13
        periodYear = year;
        periodMonth = month;
    } else if (day >= 14 && day <= 20) {
        // Days 14-20: Show Cycle 2 of current month (payment period, not yet generation period)
        cycleNumber = 2;
        periodStart = new Date(year, month, 11);
        periodEnd = new Date(year, month, 20);
        generationStart = new Date(year, month, 21);
        generationEnd = new Date(year, month, 23); // 3 days: 21-23
        periodYear = year;
        periodMonth = month;
    } else if (day >= 21 && day <= 23) {
        // Days 21-23: Show Cycle 2 of current month (generation period)
        cycleNumber = 2;
        periodStart = new Date(year, month, 11);
        periodEnd = new Date(year, month, 20);
        generationStart = new Date(year, month, 21);
        generationEnd = new Date(year, month, 23); // 3 days: 21-23
        periodYear = year;
        periodMonth = month;
    } else {
        // Days 24-31: Show Cycle 3 of current month (payment period, not yet generation period)
        // Handles variable month lengths: 28 (Feb non-leap), 29 (Feb leap), 30, or 31 days
        cycleNumber = 3;
        // Get last day of current month (handles 28, 29, 30, or 31 days automatically)
        // new Date(year, month + 1, 0) returns the last day of the specified month
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        periodStart = new Date(year, month, 21);
        periodEnd = new Date(year, month, daysInMonth);
        const nextMonth = month === 11 ? 0 : month + 1;
        const nextYear = month === 11 ? year + 1 : year;
        generationStart = new Date(nextYear, nextMonth, 1);
        generationEnd = new Date(nextYear, nextMonth, 3); // 3 days: 1-3
        periodYear = year;
        periodMonth = month;
    }

    // Format dates as YYYY-MM-DD using local time components (avoid timezone conversion issues)
    const formatDateLocal = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    return {
        cycleNumber,
        periodStart: formatDateLocal(periodStart),
        periodEnd: formatDateLocal(periodEnd),
        generationStart: formatDateLocal(generationStart),
        generationEnd: formatDateLocal(generationEnd),
        year: periodYear,
        month: periodMonth + 1
    };
}

/**
 * Check if payments can be invoiced (current date is within generation period window)
 * 
 * New Fixed Structure:
 * - Cycle 1: Generation Period 11-13 (3 days)
 * - Cycle 2: Generation Period 21-23 (3 days)
 * - Cycle 3: Generation Period 1-3 of next month (3 days)
 */
function canGenerateInvoice(cycle) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison
    
    const generationStart = new Date(cycle.generationStart);
    generationStart.setHours(0, 0, 0, 0);
    
    const generationEnd = new Date(cycle.generationEnd);
    generationEnd.setHours(23, 59, 59, 999); // End of day for inclusive comparison

    // Check if today is within the generation period window
    return today >= generationStart && today <= generationEnd;
}

/**
 * Format date for display (DD/MM/YYYY)
 */
function formatDateForDisplay(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Calculate net amount (excluding 18% GST)
 */
function calculateNetAmount(finalFees) {
    // If finalFees includes GST (118%), then net = finalFees / 1.18
    // Assuming finalFees is the amount including GST
    return finalFees / 1.18;
}

/**
 * Calculate center share based on student type
 * Direct student: 80% of net amount
 * Referred student: 20% of net amount
 */
function calculateCenterShare(netAmount, isDirectStudent = true) {
    if (isDirectStudent) {
        return netAmount * 0.80; // 80% for direct students
    } else {
        return netAmount * 0.20; // 20% for referred students
    }
}

/**
 * Get payments for current invoice cycle (Generate Invoice Tab)
 * GET /api/financial/invoices/cycle-payments
 */
const getCyclePayments = async (req, res) => {
    try {
        let centerId = req.user.center_id;

        // If center_id not in token (for center admin), fetch it from centers table
        if (!centerId && req.user.role === "center") {
            const userId = req.user.id;
            const { data: centerData, error: centerError } = await supabase
                .from('centers')
                .select('center_id')
                .eq('center_admin', userId)
                .single();

            if (centerError || !centerData) {
                return res.status(404).json({ success: false, error: "Center not found for this admin" });
            }

            centerId = centerData.center_id;
        }
        
        if (!centerId) {
            return res.status(400).json({ 
                success: false, 
                error: "Center ID not found" 
            });
        }

        // Get current invoice cycle
        const cycle = getCurrentInvoiceCycle();

        // Check if invoice can be generated for this cycle
        const canGenerate = canGenerateInvoice(cycle);
        
        // Get all payments for this center (center students + referred students)
        const { data: allPayments, error: paymentsError } = await supabase
            .from('student_course_payment')
            .select(`
                *,
                enrollment:enrollment (
                    enrollment_id,
                    student:students (
                        student_id,
                        email,
                        registration_number,
                        name,
                        center,
                        is_referred,
                        referred_by_center,
                        referring_center:centers!students_referred_by_center_fkey (
                            center_id,
                            center_name
                        )
                    ),
                    batch:batches (
                        batch_id,
                        batch_name,
                        centers!batches_center_fkey (
                            center_id,
                            center_name
                        ),
                        course:courses (
                            id,
                            course_name,
                            mode
                        )
                    )
                )
            `)
            .eq('status', true); // Only approved payments

        if (paymentsError) {
            console.error('Error fetching payments:', paymentsError);
            return res.status(500).json({ 
                success: false, 
                error: "Error fetching payments" 
            });
        }

        // Filter payments:
        // 1. Student is in this center OR referred by this center
        // 2. Payment date is within current cycle
        // 3. Payment has not been invoiced yet
        const cyclePayments = allPayments.filter(payment => {
            const student = payment.enrollment?.student;
            const studentCenterId = student?.center;
            const isReferred = student?.is_referred === true;
            const referredByCenterId = student?.referred_by_center;
            
            // Direct student: student.center = this center_id (student belongs to this center)
            const isDirectStudent = studentCenterId === centerId;
            
            // Referred student: is_referred = true AND referred_by_center = this center_id
            const isReferredByUs = isReferred && referredByCenterId === centerId;

            // Debug logging for first few payments
            if (allPayments.indexOf(payment) < 5) {
                console.log('getCyclePayments Debug:', {
                    payment_id: payment.payment_id,
                    student_name: student?.name,
                    student_center: studentCenterId,
                    isDirectStudent,
                    isReferred,
                    referredByCenterId,
                    currentCenterId: centerId,
                    isReferredByUs,
                    shouldInclude: isDirectStudent || isReferredByUs
                });
            }

            if (!isDirectStudent && !isReferredByUs) return false;

            // Check if payment is within cycle date range
            const paymentDate = new Date(payment.created_at).toISOString().split('T')[0];
            if (paymentDate < cycle.periodStart || paymentDate > cycle.periodEnd) {
                return false;
            }

            return true;
        });

        // Log summary of filtered payments
        const directCount = cyclePayments.filter(p => {
            const studentCenterId = p.enrollment?.student?.center;
            return studentCenterId === centerId;
        }).length;
        const referredCount = cyclePayments.filter(p => {
            const student = p.enrollment?.student;
            const isReferred = student?.is_referred === true;
            const referredByCenterId = student?.referred_by_center;
            return isReferred && referredByCenterId === centerId;
        }).length;
        console.log(`getCyclePayments Summary - Center: ${centerId}, Total: ${cyclePayments.length}, Direct: ${directCount}, Referred: ${referredCount}`);

        // Check which payments have already been invoiced
        const { data: existingInvoiceItems } = await supabase
            .from('center_invoice_items')
            .select('payment_id')
            .in('payment_id', cyclePayments.map(p => p.payment_id));

        const invoicedPaymentIds = new Set(
            (existingInvoiceItems || []).map(item => item.payment_id)
        );

        // Filter out already invoiced payments
        const availablePayments = cyclePayments.filter(
            payment => !invoicedPaymentIds.has(payment.payment_id)
        );

        // Transform payments for display
        const transformedPayments = availablePayments.map(payment => {
            const netAmount = calculateNetAmount(payment.final_fees || 0);
            const courseMode = payment.enrollment?.batch?.course?.mode || 'Online';
            
            // Determine if student is direct or referred
            const student = payment.enrollment?.student;
            const studentCenterId = student?.center;
            const isReferred = student?.is_referred === true;
            const referredByCenterId = student?.referred_by_center;
            const isDirectStudent = studentCenterId === centerId;
            const isReferredByUs = isReferred && referredByCenterId === centerId;
            
            // Center share: Direct = 80%, Referred = 20%
            const centerShare = calculateCenterShare(netAmount, isDirectStudent);
            
            // Determine fee term
            let feeTerm = 'Full';
            if (payment.payment_type === 'emi' && payment.current_emi) {
                feeTerm = `EMI - ${payment.current_emi}`;
            }

            return {
                payment_id: payment.payment_id,
                student_name: payment.enrollment?.student?.name || 'N/A',
                registration_number: payment.enrollment?.student?.registration_number || 'N/A',
                course_name: payment.enrollment?.batch?.course?.course_name || 'N/A',
                course_mode: courseMode,
                transaction_date: payment.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
                fee_term: feeTerm,
                fee_paid: payment.final_fees || 0,
                net_amount: netAmount,
                total_amount: centerShare
            };
        });

        res.status(200).json({
            success: true,
            data: {
                cycle: cycle,
                canGenerate: canGenerate,
                payments: transformedPayments,
                summary: {
                    totalPayments: transformedPayments.length,
                    totalNetAmount: transformedPayments.reduce((sum, p) => sum + p.net_amount, 0),
                    totalCenterShare: transformedPayments.reduce((sum, p) => sum + p.total_amount, 0)
                }
            }
        });

    } catch (err) {
        console.error('Error fetching cycle payments:', err);
        res.status(500).json({ 
            success: false, 
            error: "Internal server error" 
        });
    }
};

/**
 * Generate invoice for current cycle
 * POST /api/financial/invoices/generate
 */
const generateInvoice = async (req, res) => {
    try {
        let centerId = req.user.center_id;
        const userId = req.user.id;

        // If center_id not in token (for center admin), fetch it from centers table
        if (!centerId && req.user.role === "center") {
            const { data: centerData, error: centerError } = await supabase
                .from('centers')
                .select('center_id')
                .eq('center_admin', userId)
                .single();

            if (centerError || !centerData) {
                return res.status(404).json({ success: false, error: "Center not found for this admin" });
            }

            centerId = centerData.center_id;
        }

        if (!centerId) {
            return res.status(400).json({ 
                success: false, 
                error: "Center ID not found" 
            });
        }

        // Get current invoice cycle
        const cycle = getCurrentInvoiceCycle();

        // Check if invoice can be generated
        const canGenerate = canGenerateInvoice(cycle);
        if (!canGenerate) {
            let errorMsg = '';
            
            if (cycle.cycleNumber === 1) {
                errorMsg = `Invoice for Cycle 1 (Payment Period: ${formatDateForDisplay(cycle.periodStart)} – ${formatDateForDisplay(cycle.periodEnd)}) can only be generated during the generation period: ${formatDateForDisplay(cycle.generationStart)} – ${formatDateForDisplay(cycle.generationEnd)}`;
            } else if (cycle.cycleNumber === 2) {
                errorMsg = `Invoice for Cycle 2 (Payment Period: ${formatDateForDisplay(cycle.periodStart)} – ${formatDateForDisplay(cycle.periodEnd)}) can only be generated during the generation period: ${formatDateForDisplay(cycle.generationStart)} – ${formatDateForDisplay(cycle.generationEnd)}`;
            } else if (cycle.cycleNumber === 3) {
                errorMsg = `Invoice for Cycle 3 (Payment Period: ${formatDateForDisplay(cycle.periodStart)} – ${formatDateForDisplay(cycle.periodEnd)}) can only be generated during the generation period: ${formatDateForDisplay(cycle.generationStart)} – ${formatDateForDisplay(cycle.generationEnd)}`;
            } else {
                errorMsg = `Invoice can only be generated during the specified generation period for each cycle`;
            }
            
            return res.status(400).json({
                success: false,
                error: errorMsg
            });
        }

        // Check if invoice already exists for this cycle
        const { data: existingInvoice } = await supabase
            .from('center_invoices')
            .select('invoice_id')
            .eq('center_id', centerId)
            .eq('cycle_number', cycle.cycleNumber)
            .eq('period_start', cycle.periodStart)
            .single();

        if (existingInvoice) {
            return res.status(400).json({
                success: false,
                error: 'Invoice already generated for this cycle'
            });
        }

        // Get payments for this cycle (same logic as getCyclePayments)
        const { data: allPayments, error: paymentsError } = await supabase
            .from('student_course_payment')
            .select(`
                *,
                enrollment:enrollment (
                    enrollment_id,
                    student:students (
                        student_id,
                        email,
                        registration_number,
                        name,
                        center,
                        is_referred,
                        referred_by_center,
                        referring_center:centers!students_referred_by_center_fkey (
                            center_id,
                            center_name
                        )
                    ),
                    batch:batches (
                        batch_id,
                        batch_name,
                        center,
                        centers!batches_center_fkey (
                            center_id,
                            center_name
                        ),
                        course:courses (
                            id,
                            course_name,
                            mode
                        )
                    )
                )
            `)
            .eq('status', true);

        if (paymentsError) {
            return res.status(500).json({ 
                success: false, 
                error: "Error fetching payments" 
            });
        }

        // Filter payments for this center and cycle
        const cyclePayments = allPayments.filter(payment => {
            const student = payment.enrollment?.student;
            const studentCenterId = student?.center;
            const isReferred = student?.is_referred === true;
            const referredByCenterId = student?.referred_by_center;
            
            // Direct student: student.center = this center_id (student belongs to this center)
            const isDirectStudent = studentCenterId === centerId;
            
            // Referred student: is_referred = true AND referred_by_center = this center_id
            const isReferredByUs = isReferred && referredByCenterId === centerId;

            // Debug logging for first few payments
            if (allPayments.indexOf(payment) < 5) {
                console.log('Payment Debug:', {
                    payment_id: payment.payment_id,
                    student_name: student?.name,
                    student_center: studentCenterId,
                    isDirectStudent,
                    isReferred,
                    referredByCenterId,
                    currentCenterId: centerId,
                    isReferredByUs,
                    shouldInclude: isDirectStudent || isReferredByUs
                });
            }

            if (!isDirectStudent && !isReferredByUs) return false;

            const paymentDate = new Date(payment.created_at).toISOString().split('T')[0];
            return paymentDate >= cycle.periodStart && paymentDate <= cycle.periodEnd;
        });

        // Log summary of filtered payments
        const directCount = cyclePayments.filter(p => {
            const studentCenterId = p.enrollment?.student?.center;
            return studentCenterId === centerId;
        }).length;
        const referredCount = cyclePayments.filter(p => {
            const student = p.enrollment?.student;
            const isReferred = student?.is_referred === true;
            const referredByCenterId = student?.referred_by_center;
            return isReferred && referredByCenterId === centerId;
        }).length;
        console.log(`Invoice Generation Summary - Center: ${centerId}, Total: ${cyclePayments.length}, Direct: ${directCount}, Referred: ${referredCount}`);

        // Check which payments have already been invoiced
        const { data: existingInvoiceItems } = await supabase
            .from('center_invoice_items')
            .select('payment_id')
            .in('payment_id', cyclePayments.map(p => p.payment_id));

        const invoicedPaymentIds = new Set(
            (existingInvoiceItems || []).map(item => item.payment_id)
        );

        const availablePayments = cyclePayments.filter(
            payment => !invoicedPaymentIds.has(payment.payment_id)
        );

        if (availablePayments.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No payments available for invoice generation'
            });
        }

        // Get center info
        const { data: centerData, error: centerError } = await supabase
            .from('centers')
            .select('*')
            .eq('center_id', centerId)
            .single();

        if (centerError || !centerData) {
            return res.status(500).json({ 
                success: false, 
                error: "Error fetching center information" 
            });
        }

        let centerAdminName = req.user?.name || null;
        let centerAdminFullName = req.user?.full_name || null;

        if ((!centerAdminName || !centerAdminFullName) && (req.user?.id || centerData.center_admin)) {
            const lookupUserId = req.user?.id || centerData.center_admin;
            const { data: centerAdminRecord, error: centerAdminError } = await supabase
                .from('users')
                .select('name, full_name')
                .eq('id', lookupUserId)
                .single()
                .catch(() => ({ data: null, error: null }));

            if (!centerAdminError && centerAdminRecord) {
                centerAdminName = centerAdminName || centerAdminRecord.name || centerAdminRecord.full_name || centerAdminName;
                centerAdminFullName = centerAdminFullName || centerAdminRecord.full_name || centerAdminRecord.name || centerAdminFullName;
            }
        }

        // Calculate totals
        let totalNetAmount = 0;
        let totalCenterShare = 0;

        const invoiceItems = availablePayments.map(payment => {
            const netAmount = calculateNetAmount(payment.final_fees || 0);
            const courseMode = payment.enrollment?.batch?.course?.mode || 'Online';
            
            // Determine if student is direct or referred
            const student = payment.enrollment?.student;
            const studentCenterId = student?.center;
            const isReferred = student?.is_referred === true;
            const referredByCenterId = student?.referred_by_center;
            const isDirectStudent = studentCenterId === centerId;
            const isReferredByUs = isReferred && referredByCenterId === centerId;
            
            // Center share: Direct = 80%, Referred = 20%
            const centerShare = calculateCenterShare(netAmount, isDirectStudent);
            
            totalNetAmount += netAmount;
            totalCenterShare += centerShare;

            let feeTerm = 'Full';
            if (payment.payment_type === 'emi' && payment.current_emi) {
                feeTerm = `EMI - ${payment.current_emi}`;
            }

            return {
                payment_id: payment.payment_id,
                student_id: payment.enrollment?.student?.student_id,
                student_name: payment.enrollment?.student?.name || 'N/A',
                registration_number: payment.enrollment?.student?.registration_number || 'N/A',
                course_name: payment.enrollment?.batch?.course?.course_name || 'N/A',
                course_mode: courseMode,
                transaction_date: payment.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
                fee_term: feeTerm,
                discount_percentage: payment.discount_percentage || payment.enrollment?.student?.discount_percentage || payment.enrollment?.discount_percentage || 0,
                fee_paid: payment.final_fees || 0,
                net_amount: netAmount,
                center_share: centerShare
            };
        });

        // Create invoice record
        const { data: invoiceRecord, error: invoiceError } = await supabase
            .from('center_invoices')
            .insert({
                center_id: centerId,
                invoice_date: new Date().toISOString().split('T')[0],
                period_start: cycle.periodStart,
                period_end: cycle.periodEnd,
                cycle_number: cycle.cycleNumber,
                total_net_amount: totalNetAmount,
                total_center_share: totalCenterShare,
                status: 'Pending',
                created_by: userId
            })
            .select()
            .single();

        if (invoiceError) {
            console.error('Error creating invoice:', invoiceError);
            return res.status(500).json({ 
                success: false, 
                error: "Error creating invoice record" 
            });
        }

        // Determine invoice number in desired format
        const fiscalYearInfo = getFiscalYearInfo(invoiceRecord.invoice_date);

        const { count: fiscalInvoiceCount, error: fiscalCountError } = await supabase
            .from('center_invoices')
            .select('invoice_id', { count: 'exact', head: true })
            .eq('center_id', centerId)
            .gte('invoice_date', fiscalYearInfo.startDate.toISOString().split('T')[0])
            .lte('invoice_date', fiscalYearInfo.endDate.toISOString().split('T')[0]);

        if (fiscalCountError) {
            console.error('Error counting fiscal year invoices:', fiscalCountError);
        }

        const sequenceNumber = (fiscalInvoiceCount || 0).toString().padStart(3, '0');

        const centerCodeCandidates = [
            centerAdminName,
            centerAdminFullName,
            req.user?.name,
            req.user?.full_name,
            centerData.center_username,
            centerData.centerUserName,
            centerData.center_shortcode,
            centerData.center_short_code,
            centerData.center_shortname,
            centerData.center_short_name,
            centerData.center_code,
            centerData.short_code,
            centerData.shortcode,
            req.user?.center_username,
            req.user?.center_shortcode,
            req.user?.center_code
        ];

        let centerSegment = centerCodeCandidates.map(sanitizeCode).find(Boolean);
        if (!centerSegment) {
            centerSegment = getInitials(centerData.center_name) || 'INV';
        }

        const formattedInvoiceNumber = `${centerSegment}/INV/${fiscalYearInfo.label}/${sequenceNumber}`;

        await supabase
            .from('center_invoices')
            .update({ invoice_number: formattedInvoiceNumber })
            .eq('invoice_id', invoiceRecord.invoice_id);

        invoiceRecord.invoice_number = formattedInvoiceNumber;
        invoiceRecord.sequence_number = Number(sequenceNumber);
        invoiceRecord.fiscal_year = fiscalYearInfo.label;

        // Prepare invoice data for PDF generation
        const invoiceData = {
            invoice_id: invoiceRecord.invoice_id, // Include invoice_id for PDF file management
            invoice_number: invoiceRecord.invoice_number,
            center_name: centerData.center_name,
            center_username: centerData.center_username,
            center_shortcode: centerData.center_shortcode,
            center_code: centerData.center_code,
            center_admin_name: centerAdminName,
            center_admin_full_name: centerAdminFullName,
            currentUser: {
                center_username: req.user?.center_username,
                center_shortcode: req.user?.center_shortcode,
                center_code: req.user?.center_code,
                name: centerAdminName || req.user?.name,
                full_name: centerAdminFullName || req.user?.full_name
            },
            sequence_number: invoiceRecord.sequence_number,
            fiscal_year: fiscalYearInfo.label,
            invoice_date: invoiceRecord.invoice_date,
            cycle_number: cycle.cycleNumber, // Include cycle number for PDF
            period_start: cycle.periodStart,
            period_end: cycle.periodEnd,
            total_net_amount: totalNetAmount,
            total_center_share: totalCenterShare,
            items: invoiceItems.map(item => ({
                student_name: item.student_name,
                registration_number: item.registration_number,
                course_name: item.course_name,
                transaction_date: item.transaction_date,
                fee_term: item.fee_term,
                discount_percentage: item.discount_percentage,
                fee_paid: item.fee_paid,
                net_amount: item.net_amount,
                total_amount: item.center_share
            }))
        };

        // Generate and upload PDF
        let pdfUrl = null;
        try {
            const { publicUrl } = await generateAndUploadInvoicePDF(invoiceData);
            pdfUrl = publicUrl;

            // Update invoice record with PDF URL
            await supabase
                .from('center_invoices')
                .update({ pdf_url: pdfUrl })
                .eq('invoice_id', invoiceRecord.invoice_id);
        } catch (pdfError) {
            console.error('Error generating PDF:', pdfError);
            // Continue without PDF URL, invoice record is already created
        }

        // Create invoice items
        const invoiceItemsData = invoiceItems.map(item => ({
            invoice_id: invoiceRecord.invoice_id,
            payment_id: item.payment_id,
            student_id: item.student_id,
            student_name: item.student_name,
            registration_number: item.registration_number,
            course_name: item.course_name,
            transaction_date: item.transaction_date,
            fee_term: item.fee_term,
            fee_paid: item.fee_paid,
            net_amount: item.net_amount,
            center_share: item.center_share
        }));

        const { error: itemsError } = await supabase
            .from('center_invoice_items')
            .insert(invoiceItemsData);

        if (itemsError) {
            console.error('Error creating invoice items:', itemsError);
            // Invoice record exists, but items failed - this is problematic
            return res.status(500).json({ 
                success: false, 
                error: "Error creating invoice items" 
            });
        }

        res.status(201).json({
            success: true,
            data: {
                invoice: {
                    ...invoiceRecord,
                    pdf_url: pdfUrl
                },
                itemsCount: invoiceItems.length,
                summary: {
                    totalNetAmount,
                    totalCenterShare
                }
            }
        });

    } catch (err) {
        console.error('Error generating invoice:', err);
        res.status(500).json({ 
            success: false, 
            error: "Internal server error" 
        });
    }
};

/**
 * Get all invoices for center (History Tab)
 * GET /api/financial/invoices
 */
const getCenterInvoices = async (req, res) => {
    try {
        let centerId = req.user.center_id;

        // If center_id not in token (for center admin), fetch it from centers table
        if (!centerId && req.user.role === "center") {
            const userId = req.user.id;
            const { data: centerData, error: centerError } = await supabase
                .from('centers')
                .select('center_id')
                .eq('center_admin', userId)
                .single();

            if (centerError || !centerData) {
                return res.status(404).json({ success: false, error: "Center not found for this admin" });
            }

            centerId = centerData.center_id;
        }

        if (!centerId) {
            return res.status(400).json({ 
                success: false, 
                error: "Center ID not found" 
            });
        }

        // Get all invoices for this center
        const { data: invoices, error: invoicesError } = await supabase
            .from('center_invoices')
            .select('*')
            .eq('center_id', centerId)
            .order('created_at', { ascending: false });

        if (invoicesError) {
            console.error('Error fetching invoices:', invoicesError);
            return res.status(500).json({ 
                success: false, 
                error: "Error fetching invoices" 
            });
        }

        res.status(200).json({
            success: true,
            data: invoices || []
        });

    } catch (err) {
        console.error('Error fetching invoices:', err);
        res.status(500).json({ 
            success: false, 
            error: "Internal server error" 
        });
    }
};

/**
 * Get invoice items (student payment list) for a specific invoice
 * GET /api/financial/invoices/:invoice_id/items
 */
const getInvoiceItems = async (req, res) => {
    try {
        const { invoice_id } = req.params;
        const userRole = req.user.role;
        const userId = req.user.id;

        // First, get the invoice to check its center_id
        const { data: invoice, error: invoiceError } = await supabase
            .from('center_invoices')
            .select('invoice_id, center_id')
            .eq('invoice_id', invoice_id)
            .single();

        if (invoiceError || !invoice) {
            return res.status(404).json({ 
                success: false, 
                error: "Invoice not found" 
            });
        }

        // Role-based access control
        if (userRole === "center") {
            // Center Admin: Verify invoice belongs to their center
            let centerId = req.user.center_id;

            // If center_id not in token, fetch it from centers table
            if (!centerId) {
                const { data: centerData, error: centerError } = await supabase
                    .from('centers')
                    .select('center_id')
                    .eq('center_admin', userId)
                    .single();

                if (centerError || !centerData) {
                    return res.status(404).json({ success: false, error: "Center not found for this admin" });
                }

                centerId = centerData.center_id;
            }

            if (invoice.center_id !== centerId) {
                return res.status(403).json({ 
                    success: false, 
                    error: "Access denied. This invoice does not belong to your center." 
                });
            }
        } else if (userRole === "state") {
            // State Admin: Verify invoice belongs to a center in their state
            // Get the state_id for this state admin
            const { data: stateData, error: stateError } = await supabase
                .from('states')
                .select('state_id')
                .eq('state_admin', userId)
                .single();

            if (stateError || !stateData) {
                return res.status(404).json({ 
                    success: false, 
                    error: "State not found for this admin. Please ensure you are assigned to a state." 
                });
            }

            const stateId = stateData.state_id;

            // Check if the invoice's center belongs to this state
            const { data: centerData, error: centerError } = await supabase
                .from('centers')
                .select('center_id, state')
                .eq('center_id', invoice.center_id)
                .single();

            if (centerError || !centerData) {
                return res.status(404).json({ 
                    success: false, 
                    error: "Center not found for this invoice" 
                });
            }

            if (centerData.state !== stateId) {
                return res.status(403).json({ 
                    success: false, 
                    error: "Access denied. This invoice does not belong to a center in your state." 
                });
            }
        }
        // For other roles (financial, manager, admin), allow access to all invoices
        // No additional verification needed

        // Get invoice items (student payment list)
        const { data: items, error: itemsError } = await supabase
            .from('center_invoice_items')
            .select('*')
            .eq('invoice_id', invoice_id)
            .order('created_at', { ascending: true });

        if (itemsError) {
            console.error('Error fetching invoice items:', itemsError);
            return res.status(500).json({ 
                success: false, 
                error: "Error fetching invoice items" 
            });
        }

        res.status(200).json({
            success: true,
            data: items || []
        });

    } catch (err) {
        console.error('Error fetching invoice items:', err);
        res.status(500).json({ 
            success: false, 
            error: "Internal server error" 
        });
    }
};

/**
 * Get invoices by status for State Admin (Invoice Requests)
 * GET /api/financial/invoices/state-admin/pending
 * Only shows invoices from centers under the currently logged-in state admin's state
 */
const getStateAdminInvoices = async (req, res) => {
    try {
        // Only state admin can access this
        if (req.user.role !== 'state') {
            return res.status(403).json({ 
                success: false, 
                error: "Access denied. Only State Admin can view pending invoices." 
            });
        }

        const userId = req.user.id;

        // Step 1: Get the state_id for this state admin
        const { data: stateData, error: stateError } = await supabase
            .from('states')
            .select('state_id')
            .eq('state_admin', userId)
            .single();

        if (stateError || !stateData) {
            console.error('Error fetching state for state admin:', stateError);
            return res.status(404).json({ 
                success: false, 
                error: "State not found for this admin. Please ensure you are assigned to a state." 
            });
        }

        const stateId = stateData.state_id;

        // Step 2: Get all center_ids that belong to this state
        const { data: centers, error: centersError } = await supabase
            .from('centers')
            .select('center_id')
            .eq('state', stateId);

        if (centersError) {
            console.error('Error fetching centers for state:', centersError);
            return res.status(500).json({ 
                success: false, 
                error: "Error fetching centers for state" 
            });
        }

        // If no centers found, return empty array
        if (!centers || centers.length === 0) {
            return res.status(200).json({
                success: true,
                data: []
            });
        }

        const centerIds = centers.map(center => center.center_id);

        // Step 3: Get all invoices with status 'Pending' from centers in this state
        const { data: invoices, error: invoicesError } = await supabase
            .from('center_invoices')
            .select(`
                *,
                centers (
                    center_id,
                    center_name
                )
            `)
            .eq('status', 'Pending')
            .in('center_id', centerIds)
            .order('created_at', { ascending: false });

        if (invoicesError) {
            console.error('Error fetching state admin invoices:', invoicesError);
            return res.status(500).json({ 
                success: false, 
                error: "Error fetching invoices" 
            });
        }

        res.status(200).json({
            success: true,
            data: invoices || []
        });

    } catch (err) {
        console.error('Error fetching state admin invoices:', err);
        res.status(500).json({ 
            success: false, 
            error: "Internal server error" 
        });
    }
};

/**
 * Get invoices by status for Finance Admin (Invoice Approval)
 * GET /api/financial/invoices/finance-admin/verified
 */
const getFinanceAdminInvoices = async (req, res) => {
    try {
        // Only financial admin can access this
        if (req.user.role !== 'financial') {
            return res.status(403).json({ 
                success: false, 
                error: "Access denied. Only Finance Admin can view verified invoices." 
            });
        }

        // Get all invoices with status 'MF Verified'
        const { data: invoices, error: invoicesError } = await supabase
            .from('center_invoices')
            .select(`
                *,
                centers (
                    center_id,
                    center_name
                )
            `)
            .eq('status', 'MF Verified')
            .order('created_at', { ascending: false });

        if (invoicesError) {
            console.error('Error fetching finance admin invoices:', invoicesError);
            return res.status(500).json({ 
                success: false, 
                error: "Error fetching invoices" 
            });
        }

        res.status(200).json({
            success: true,
            data: invoices || []
        });

    } catch (err) {
        console.error('Error fetching finance admin invoices:', err);
        res.status(500).json({ 
            success: false, 
            error: "Internal server error" 
        });
    }
};

/**
 * Get invoices by status for Manager/Admin (Final Approval)
 * GET /api/financial/invoices/manager-admin/accepted
 */
const getManagerAdminInvoices = async (req, res) => {
    try {
        // Only manager or admin can access this
        if (!['manager', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                error: "Access denied. Only Manager or Admin can view finance accepted invoices." 
            });
        }

        // Get all invoices with status 'Finance Accepted'
        const { data: invoices, error: invoicesError } = await supabase
            .from('center_invoices')
            .select(`
                *,
                centers (
                    center_id,
                    center_name
                )
            `)
            .eq('status', 'Finance Accepted')
            .order('created_at', { ascending: false });

        if (invoicesError) {
            console.error('Error fetching manager/admin invoices:', invoicesError);
            return res.status(500).json({ 
                success: false, 
                error: "Error fetching invoices" 
            });
        }

        res.status(200).json({
            success: true,
            data: invoices || []
        });

    } catch (err) {
        console.error('Error fetching manager/admin invoices:', err);
        res.status(500).json({ 
            success: false, 
            error: "Internal server error" 
        });
    }
};

/**
 * Get approved invoices for State Admin (Approved Tab)
 * Shows all invoices that State Admin has verified and beyond (MF Verified, Finance Accepted, Invoice Paid)
 * Only shows invoices from centers under the currently logged-in state admin's state
 * GET /api/financial/invoices/state-admin/verified
 */
const getStateAdminVerifiedInvoices = async (req, res) => {
    try {
        // Only state admin can access this
        if (req.user.role !== 'state') {
            return res.status(403).json({ 
                success: false, 
                error: "Access denied. Only State Admin can view approved invoices." 
            });
        }

        const userId = req.user.id;

        // Step 1: Get the state_id for this state admin
        const { data: stateData, error: stateError } = await supabase
            .from('states')
            .select('state_id')
            .eq('state_admin', userId)
            .single();

        if (stateError || !stateData) {
            console.error('Error fetching state for state admin:', stateError);
            return res.status(404).json({ 
                success: false, 
                error: "State not found for this admin. Please ensure you are assigned to a state." 
            });
        }

        const stateId = stateData.state_id;

        // Step 2: Get all center_ids that belong to this state
        const { data: centers, error: centersError } = await supabase
            .from('centers')
            .select('center_id')
            .eq('state', stateId);

        if (centersError) {
            console.error('Error fetching centers for state:', centersError);
            return res.status(500).json({ 
                success: false, 
                error: "Error fetching centers for state" 
            });
        }

        // If no centers found, return empty array
        if (!centers || centers.length === 0) {
            return res.status(200).json({
                success: true,
                data: []
            });
        }

        const centerIds = centers.map(center => center.center_id);

        // Step 3: Get all invoices with status 'MF Verified', 'Finance Accepted', or 'Invoice Paid'
        // These are invoices that State Admin has verified and beyond
        // Only from centers in this state
        const { data: invoices, error: invoicesError } = await supabase
            .from('center_invoices')
            .select(`
                *,
                centers (
                    center_id,
                    center_name
                )
            `)
            .in('status', ['MF Verified', 'Finance Accepted', 'Invoice Paid'])
            .in('center_id', centerIds)
            .order('created_at', { ascending: false });

        if (invoicesError) {
            console.error('Error fetching state admin approved invoices:', invoicesError);
            return res.status(500).json({ 
                success: false, 
                error: "Error fetching invoices" 
            });
        }

        res.status(200).json({
            success: true,
            data: invoices || []
        });

    } catch (err) {
        console.error('Error fetching state admin approved invoices:', err);
        res.status(500).json({ 
            success: false, 
            error: "Internal server error" 
        });
    }
};

/**
 * Get approved invoices for Finance Admin (Approved Tab)
 * Shows all invoices that Finance Admin has approved and beyond (Finance Accepted, Invoice Paid)
 * GET /api/financial/invoices/finance-admin/accepted
 */
const getFinanceAdminAcceptedInvoices = async (req, res) => {
    try {
        // Only financial admin can access this
        if (req.user.role !== 'financial') {
            return res.status(403).json({ 
                success: false, 
                error: "Access denied. Only Finance Admin can view approved invoices." 
            });
        }

        // Get all invoices with status 'Finance Accepted' or 'Invoice Paid'
        // These are invoices that Finance Admin has approved and beyond
        const { data: invoices, error: invoicesError } = await supabase
            .from('center_invoices')
            .select(`
                *,
                centers (
                    center_id,
                    center_name
                )
            `)
            .in('status', ['Finance Accepted', 'Invoice Paid'])
            .order('created_at', { ascending: false });

        if (invoicesError) {
            console.error('Error fetching finance admin approved invoices:', invoicesError);
            return res.status(500).json({ 
                success: false, 
                error: "Error fetching invoices" 
            });
        }

        res.status(200).json({
            success: true,
            data: invoices || []
        });

    } catch (err) {
        console.error('Error fetching finance admin approved invoices:', err);
        res.status(500).json({ 
            success: false, 
            error: "Internal server error" 
        });
    }
};

/**
 * Get approved invoices for Manager/Admin (Approved Tab)
 * Shows all invoices that Manager/Admin has approved (Invoice Paid - final status)
 * GET /api/financial/invoices/manager-admin/paid
 */
const getManagerAdminPaidInvoices = async (req, res) => {
    try {
        // Only manager or admin can access this
        if (!['manager', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                error: "Access denied. Only Manager or Admin can view approved invoices." 
            });
        }

        // Get all invoices with status 'Invoice Paid'
        // These are invoices that Manager/Admin has given final approval
        // (This is the final status, so there's nothing beyond it)
        const { data: invoices, error: invoicesError } = await supabase
            .from('center_invoices')
            .select(`
                *,
                centers (
                    center_id,
                    center_name
                )
            `)
            .eq('status', 'Invoice Paid')
            .order('created_at', { ascending: false });

        if (invoicesError) {
            console.error('Error fetching manager/admin approved invoices:', invoicesError);
            return res.status(500).json({ 
                success: false, 
                error: "Error fetching invoices" 
            });
        }

        res.status(200).json({
            success: true,
            data: invoices || []
        });

    } catch (err) {
        console.error('Error fetching manager/admin approved invoices:', err);
        res.status(500).json({ 
            success: false, 
            error: "Internal server error" 
        });
    }
};

/**
 * Update invoice status (Verify/Approve)
 * PATCH /api/financial/invoices/:invoice_id/status
 * Body: { status: 'MF Verified' | 'Finance Accepted' | 'Invoice Paid', notes?: string }
 */
const updateInvoiceStatus = async (req, res) => {
    try {
        const { invoice_id } = req.params;
        const { status, notes } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;

        // Validate status
        const validStatuses = ['MF Verified', 'Finance Accepted', 'Invoice Paid'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                error: "Invalid status. Must be one of: MF Verified, Finance Accepted, Invoice Paid" 
            });
        }

        // Validate role-based status transitions
        let allowedStatus;
        if (userRole === 'state' && status === 'MF Verified') {
            allowedStatus = true;
        } else if (userRole === 'financial' && status === 'Finance Accepted') {
            allowedStatus = true;
        } else if ((userRole === 'manager' || userRole === 'admin') && status === 'Invoice Paid') {
            allowedStatus = true;
        } else {
            return res.status(403).json({ 
                success: false, 
                error: `Access denied. ${userRole} cannot set status to ${status}` 
            });
        }

        // Get current invoice (include pdf_url for watermarking)
        const { data: invoice, error: invoiceError } = await supabase
            .from('center_invoices')
            .select('invoice_id, status, pdf_url')
            .eq('invoice_id', invoice_id)
            .single();

        if (invoiceError || !invoice) {
            return res.status(404).json({ 
                success: false, 
                error: "Invoice not found" 
            });
        }

        // Validate status transition
        const validTransitions = {
            'Pending': ['MF Verified'],
            'MF Verified': ['Finance Accepted'],
            'Finance Accepted': ['Invoice Paid']
        };

        if (!validTransitions[invoice.status]?.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                error: `Invalid status transition from ${invoice.status} to ${status}` 
            });
        }

        // Update invoice status
        const { data: updatedInvoice, error: updateError } = await supabase
            .from('center_invoices')
            .update({ 
                status: status
            })
            .eq('invoice_id', invoice_id)
            .select()
            .single();

        if (updateError) {
            console.error('Error updating invoice status:', updateError);
            console.error('Update error details:', JSON.stringify(updateError, null, 2));
            return res.status(500).json({ 
                success: false, 
                error: `Error updating invoice status: ${updateError.message || 'Unknown error'}` 
            });
        }

        // Log status change in history table
        const { error: historyError } = await supabase
            .from('invoice_status_history')
            .insert({
                invoice_id: invoice_id,
                old_status: invoice.status,
                new_status: status,
                changed_by: userId,
                notes: notes || `Status changed by ${userRole}`,
                changed_at: new Date().toISOString()
            });

        if (historyError) {
            console.error('Error logging status change in history table:', historyError);
            console.error('History error details:', JSON.stringify(historyError, null, 2));
            // Don't fail the request if history logging fails, but log it for debugging
        }

        // If status is "Invoice Paid", add PAID watermark to existing PDF
        if (status === 'Invoice Paid' && invoice.pdf_url) {
            try {
                console.log(`Adding PAID watermark to invoice ${invoice_id}`);
                
                // Add watermark and get updated PDF URL
                // pdfUrl parameter is kept for reference but we download from storage using invoice_id
                const { publicUrl: updatedPdfUrl } = await addPaidWatermarkToPDF(
                    invoice.pdf_url, // Kept for reference, but function uses invoice_id for storage path
                    invoice_id
                );

                // Update invoice with new PDF URL (if different)
                if (updatedPdfUrl && updatedPdfUrl !== invoice.pdf_url) {
                    await supabase
                        .from('center_invoices')
                        .update({ pdf_url: updatedPdfUrl })
                        .eq('invoice_id', invoice_id);
                    
                    console.log(`PAID watermark added successfully for invoice ${invoice_id}`);
                }
            } catch (watermarkError) {
                // Log error but don't fail the status update
                // The invoice is already marked as paid, watermark is non-critical
                console.error('Error adding PAID watermark to PDF:', watermarkError);
                console.error('Watermark error details:', JSON.stringify(watermarkError, null, 2));
                console.warn(`Invoice ${invoice_id} marked as paid, but watermark failed. Original PDF preserved.`);
            }
        }

        res.status(200).json({
            success: true,
            data: updatedInvoice,
            message: `Invoice status updated to ${status}`
        });

    } catch (err) {
        console.error('Error updating invoice status:', err);
        res.status(500).json({ 
            success: false, 
            error: "Internal server error" 
        });
    }
};

module.exports = {
    getCyclePayments,
    generateInvoice,
    getCenterInvoices,
    getInvoiceItems,
    getStateAdminInvoices,
    getFinanceAdminInvoices,
    getManagerAdminInvoices,
    getStateAdminVerifiedInvoices,
    getFinanceAdminAcceptedInvoices,
    getManagerAdminPaidInvoices,
    updateInvoiceStatus
};

