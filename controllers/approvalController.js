const { supabase, supabaseAdmin } = require("../config/supabaseClient");

// ✅ Approve a Payment (Finance/Admin)
const approvePayment = async (req, res) => {
    const { payment_id } = req.body;

    if (!payment_id) {
        return res.status(400).json({ error: "Payment ID is required" });
    }

    try {
        // 1️⃣ Fetch payment details
        const { data: payment, error: fetchError } = await supabase
            .from("student_course_payment")
            .select("*")
            .eq("payment_id", payment_id)
            .single();

        if (fetchError || !payment) {
            return res.status(404).json({ error: "Payment not found" });
        }

        const {
            enrollment_id,
            course_duration,
            payment_type,
            current_emi,
            emi_duration,
        } = payment;

        // 2️⃣ Approve this payment (status: true)
        const { error: paymentError } = await supabase
            .from("student_course_payment")
            .update({ status: true })
            .eq("payment_id", payment_id);

        if (paymentError) {
            return res
                .status(500)
                .json({ error: "Error updating payment status" });
        }

        // 3️⃣ Calculate new end_date based on payment type
        let newEndDate;
        let isFinalEMI = false;
        let isFullPayment = false;
        const today = new Date();

        if (payment_type === "full") {
            // Full payment → permanent enrollment (lifelong access)
            isFullPayment = true;
            console.log(`✅ Full payment detected - marking enrollment as permanent (lifelong access)`);
            // Set end_date to a far future date (optional, since is_permanent handles it)
            newEndDate = new Date();
            newEndDate.setFullYear(newEndDate.getFullYear() + 100); // Far future date
        } else if (payment_type === "emi") {
            // Check if this is the final EMI payment
            if (current_emi && emi_duration && current_emi >= emi_duration) {
                isFinalEMI = true;
                console.log(`✅ Final EMI detected: current_emi=${current_emi}, emi_duration=${emi_duration}`);
                
                // For final EMI: set end_date to far future (no expiry notifications needed)
                newEndDate = new Date();
                newEndDate.setFullYear(newEndDate.getFullYear() + 100); // Far future date
            } else {
                // Regular EMI → extend 30 days from existing end_date or today
                const { data: enrollment, error: enrollmentFetchError } =
                    await supabase
                        .from("enrollment")
                        .select("end_date")
                        .eq("enrollment_id", enrollment_id)
                        .single();

                if (enrollmentFetchError || !enrollment) {
                    return res.status(404).json({ error: "Enrollment not found" });
                }

                // Use existing end_date if it's in future, otherwise today
                const existingEndDate = enrollment.end_date
                    ? new Date(enrollment.end_date)
                    : today;

                const baseDate = existingEndDate > today ? existingEndDate : today;
                newEndDate = new Date(baseDate);
                newEndDate.setDate(newEndDate.getDate() + 30);
            }
        }

        // 4️⃣ Update enrollment table
        const enrollmentUpdateData = {
            status: true, // immediate course access
            end_date: newEndDate.toISOString().split("T")[0],
        };

        // If this is full payment OR final EMI, mark enrollment as permanent (lifelong access)
        if (isFullPayment || isFinalEMI) {
            enrollmentUpdateData.is_permanent = true;
            if (isFullPayment) {
                console.log(`✅ Marking enrollment ${enrollment_id} as permanent (full payment - lifelong access)`);
            } else {
                console.log(`✅ Marking enrollment ${enrollment_id} as permanent (final EMI completed)`);
            }
        }

        const { error: enrollmentError } = await supabase
            .from("enrollment")
            .update(enrollmentUpdateData)
            .eq("enrollment_id", enrollment_id);

        if (enrollmentError) {
            return res
                .status(500)
                .json({ error: "Error updating enrollment" });
        }

        // 5️⃣ Generate next EMI due date for EMI payments
        if (payment_type === "emi") {
            // Calculate next due date based on current payment date (today)
            const nextDueDate = new Date(today);
            nextDueDate.setDate(nextDueDate.getDate() + 30); // Next due date is 30 days from today

            // Update the payment record with next due date
            const { error: paymentUpdateError } = await supabase
                .from("student_course_payment")
                .update({
                    next_emi_due_date: nextDueDate.toISOString().split("T")[0]
                })
                .eq("payment_id", payment_id);

            if (paymentUpdateError) {
                console.error("❌ Error updating next EMI due date:", paymentUpdateError);
                // Don't fail the approval, just log the error
            }

            console.log(`✅ Next EMI due date set to: ${nextDueDate.toISOString().split("T")[0]} for payment ${payment_id}`);
        }

        res.json({ message: "Payment approved successfully" });
    } catch (err) {
        console.error("❌ Approve payment error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

// ✅ Get All Payments (Finance/Admin)
const getAllPayments = async (req, res) => {
    try {
        const { data, error } = await supabase
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
                            course_name
                        )
                    )
                )
            `);

        if (error) {
            console.error('Error fetching payments:', error);
            return res.status(500).json({ success: false, error: "Error fetching payments" });
        }

        // Flatten nested data
        const transformedData = data.map(payment => ({
            ...payment,
            student_email: payment.enrollment?.student?.email,
            student_name: payment.enrollment?.student?.name,
            registration_number: payment.enrollment?.student?.registration_number,
            course_name: payment.enrollment?.batch?.course?.course_name,
            batch_name: payment.enrollment?.batch?.batch_name || null,
            batch_id: payment.enrollment?.batch?.batch_id || null,
            batch_center_id: payment.enrollment?.batch?.centers?.center_id || null,
            batch_center_name: payment.enrollment?.batch?.centers?.center_name || null,
            is_referred: payment.enrollment?.student?.is_referred || false,
            referring_center_name: payment.enrollment?.student?.referring_center?.center_name || null,
            enrollment: undefined
        }));

        res.status(200).json({ success: true, data: transformedData });

    } catch (err) {
        console.error('Error fetching payments:', err);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

// ✅ Edit Payment Duration (Finance/Admin)
const editPaymentDuration = async (req, res) => {
    const { payment_id, new_course_duration } = req.body;

    if (!payment_id || new_course_duration === undefined) {
        return res.status(400).json({ success: false, error: "Payment ID and new course duration are required" });
    }

    try {
        const { data, error } = await supabase
            .from('student_course_payment')
            .update({ course_duration: Number(new_course_duration) })
            .eq('payment_id', payment_id)
            .select()
            .single();

        if (error) {
            return res.status(500).json({ success: false, error: "Error updating course duration" });
        }

        res.status(200).json({ success: true, message: "Course duration updated successfully", data });

    } catch (err) {
        console.error('Error editing payment duration:', err);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

// ✅ Get Payments for Center Admin (Filtered by center)
const getCenterPayments = async (req, res) => {
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
            return res.status(400).json({ success: false, error: "Center ID not found in token" });
        }

        const { data, error } = await supabase
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
                            course_name
                        )
                    )
                )
            `);

        if (error) {
            console.error('Error fetching payments:', error);
            return res.status(500).json({ success: false, error: "Error fetching payments" });
        }

        // Filter payments where:
        // 1. Student is in this center (batch belongs to this center), OR
        // 2. Student was referred BY this center (is_referred AND referring_center_id matches)
        const centerFilteredData = data.filter(payment => {
            const batchCenterId = payment.enrollment?.batch?.centers?.center_id;
            const isDirectStudent = batchCenterId === centerId;
            
            const referringCenterId = payment.enrollment?.student?.referring_center?.center_id;
            const isReferredByUs = payment.enrollment?.student?.is_referred && 
                                  referringCenterId === centerId;

            return isDirectStudent || isReferredByUs;
        });

        // Flatten nested data
        const transformedData = centerFilteredData.map(payment => ({
            ...payment,
            student_email: payment.enrollment?.student?.email,
            student_name: payment.enrollment?.student?.name,
            registration_number: payment.enrollment?.student?.registration_number,
            course_name: payment.enrollment?.batch?.course?.course_name,
            batch_name: payment.enrollment?.batch?.batch_name || null,
            batch_id: payment.enrollment?.batch?.batch_id || null,
            batch_center_id: payment.enrollment?.batch?.centers?.center_id || null,
            batch_center_name: payment.enrollment?.batch?.centers?.center_name || null,
            is_referred: payment.enrollment?.student?.is_referred || false,
            referring_center_name: payment.enrollment?.student?.referring_center?.center_name || null,
            enrollment: undefined
        }));

        res.status(200).json({ success: true, data: transformedData });

    } catch (err) {
        console.error('Error fetching center payments:', err);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

module.exports = { approvePayment, getAllPayments, editPaymentDuration, getCenterPayments };
