const { supabase } = require("../config/supabaseClient");

// ✅ Get Revenue Statistics for Admin Dashboard
const getRevenueStats = async (req, res) => {
    try {

        
        // First, let's test basic table access
        const { data: testTable, error: tableError } = await supabase
            .from('student_course_payment')
            .select('count')
            .limit(1);



        if (tableError) {
            console.error("❌ Revenue Stats: Table access error:", tableError);
            return res.status(500).json({ 
                error: "Cannot access student_course_payment table", 
                details: tableError.message 
            });
        }

        // Get all payments - include pending for status overview
        const { data: allPayments, error: allPaymentsError } = await supabase
            .from('student_course_payment')
            .select('*')
            .order('created_at', { ascending: false });

        // Get only approved payments for revenue calculations
        const { data: payments, error: paymentsError } = await supabase
            .from('student_course_payment')
            .select('*')
            .eq('status', true);



        if (paymentsError || allPaymentsError) {
            console.error("❌ Revenue Stats: Payments query error:", paymentsError || allPaymentsError);
            return res.status(500).json({ error: "Error fetching payments data", details: (paymentsError || allPaymentsError).message });
        }

        // Log sample payment data to understand structure


        // If no payments, return zeros
        if (!payments || payments.length === 0) {

            const result = {
                totalRevenue: 0,
                monthlyRevenue: 0,
                courseRevenue: [],
                totalTransactions: 0,
                monthlyTransactions: 0,
                // Additional data for dashboard
                monthlyRevenueData: [],
                paymentMethods: { emi: 0, full: 0 },
                paymentStatus: { approved: 0, pending: 0 },
                recentTransactions: [],
                revenueGrowth: 0,
                averageTransactionValue: 0,
                topPerformingCourse: null
            };
            return res.status(200).json({ success: true, data: result });
        }

        // Calculate Total Revenue
        const totalRevenue = payments.reduce((sum, payment) => {
            const amount = payment.final_fees && !isNaN(payment.final_fees) ? parseFloat(payment.final_fees) : 0;
            return sum + amount;
        }, 0);

        // Calculate Monthly Revenue (last 12 months)
        const monthlyRevenueData = [];
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        for (let i = 11; i >= 0; i--) {
            const monthDate = new Date(currentYear, currentMonth - i, 1);
            const monthName = monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            
            const monthPayments = payments.filter(payment => {
                const paymentDate = new Date(payment.created_at);
                return paymentDate.getMonth() === monthDate.getMonth() && 
                       paymentDate.getFullYear() === monthDate.getFullYear();
            });

            const monthRevenue = monthPayments.reduce((sum, payment) => {
                const amount = payment.final_fees && !isNaN(payment.final_fees) ? parseFloat(payment.final_fees) : 0;
                return sum + amount;
            }, 0);

            monthlyRevenueData.push({
                month: monthName,
                revenue: monthRevenue,
                transactions: monthPayments.length
            });
        }

        // Current month revenue
        const currentMonthPayments = payments.filter(payment => {
            const paymentDate = new Date(payment.created_at);
            return paymentDate.getMonth() === currentMonth && 
                   paymentDate.getFullYear() === currentYear;
        });

        const monthlyRevenue = currentMonthPayments.reduce((sum, payment) => {
            const amount = payment.final_fees && !isNaN(payment.final_fees) ? parseFloat(payment.final_fees) : 0;
            return sum + amount;
        }, 0);

        // Payment Methods Breakdown
        const paymentMethods = {
            emi: payments.filter(p => p.payment_type === 'emi').reduce((sum, p) => sum + (p.final_fees || 0), 0),
            full: payments.filter(p => p.payment_type === 'full').reduce((sum, p) => sum + (p.final_fees || 0), 0)
        };

        // Payment Status Overview
        const paymentStatus = {
            approved: payments.length,
            pending: allPayments ? allPayments.filter(p => !p.status).length : 0
        };

        // Course Revenue Breakdown
        const courseRevenueMap = {};
        
        payments.forEach(payment => {
            const courseName = payment.course_name || 'Unknown Course';
            const amount = payment.final_fees && !isNaN(payment.final_fees) ? parseFloat(payment.final_fees) : 0;
            
            if (!courseRevenueMap[courseName]) {
                courseRevenueMap[courseName] = { revenue: 0, count: 0 };
            }
            courseRevenueMap[courseName].revenue += amount;
            courseRevenueMap[courseName].count += 1;
        });

        const courseRevenue = Object.entries(courseRevenueMap)
            .map(([course, data]) => ({ 
                course, 
                revenue: data.revenue, 
                count: data.count,
                percentage: ((data.revenue / totalRevenue) * 100).toFixed(1)
            }))
            .sort((a, b) => b.revenue - a.revenue);

        // Recent Transactions
        const recentTransactions = allPayments ? allPayments.slice(0, 10).map(payment => ({
            id: payment.payment_id,
            studentName: payment.student_name,
            courseName: payment.course_name,
            amount: payment.final_fees || 0,
            paymentType: payment.payment_type,
            status: payment.status ? 'Approved' : 'Pending',
            date: payment.created_at
        })) : [];

        // Revenue Growth (month over month)
        const lastMonthRevenue = monthlyRevenueData.length > 1 ? 
            monthlyRevenueData[monthlyRevenueData.length - 2].revenue : 0;
        const revenueGrowth = lastMonthRevenue > 0 ? 
            (((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1) : 0;

        // Average Transaction Value
        const averageTransactionValue = payments.length > 0 ? 
            (totalRevenue / payments.length).toFixed(0) : 0;

        // Top Performing Course
        const topPerformingCourse = courseRevenue.length > 0 ? courseRevenue[0] : null;

        const result = {
            totalRevenue,
            monthlyRevenue,
            courseRevenue,
            totalTransactions: payments.length,
            monthlyTransactions: currentMonthPayments.length,
            // Additional dashboard data
            monthlyRevenueData,
            paymentMethods,
            paymentStatus,
            recentTransactions,
            revenueGrowth: parseFloat(revenueGrowth),
            averageTransactionValue: parseFloat(averageTransactionValue),
            topPerformingCourse
        };



        res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error("❌ Revenue Stats: Server error:", error);
        res.status(500).json({ 
            error: "Internal server error", 
            details: error.message 
        });
    }
};

module.exports = {
    getRevenueStats
};
