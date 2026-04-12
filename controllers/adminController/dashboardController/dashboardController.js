const Booking = require("../../../models/bookTicketModel.js");
const User = require("../../../models/userModel.js");
const Fleet = require("../../../models/fleetModel.js");

const getDashboardStats = async (req, res) => {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        const endOfYesterday = new Date(endOfToday);
        endOfYesterday.setDate(endOfYesterday.getDate() - 1);

        const [
            revenueResult,
            activeUsersCount,
            totalBookingsCount,
            ticketsResult,
            canceledBookingsCount,
            totalTransactionsCount,
            avgAmountResult,
            newUsersTodayCount,
            newUsersYesterdayCount,
            totalFleetsCount,
            activeFleetsCount,
        ] = await Promise.all([
            Booking.aggregate([
                { $match: { status: "booked" } },
                { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
            ]),

            User.countDocuments({ status: "active" }),

            Booking.countDocuments({ status: "booked" }),

            Booking.aggregate([
                { $match: { status: "booked" } },
                {
                    $group: {
                        _id: null,
                        totalTickets: { $sum: { $size: "$seats" } },
                    },
                },
            ]),

            Booking.countDocuments({ status: "cancelled" }),

            Booking.countDocuments({}),

            Booking.aggregate([
                { $match: { status: "booked" } },
                {
                    $group: {
                        _id: null,
                        averageAmount: { $avg: "$totalAmount" },
                    },
                },
            ]),

            User.countDocuments({
                status: "active",
                createdAt: { $gte: startOfToday, $lte: endOfToday },
            }),

            User.countDocuments({
                status: "active",
                createdAt: { $gte: startOfYesterday, $lte: endOfYesterday },
            }),

            Fleet.countDocuments({}),

            Fleet.countDocuments({ status: "ACTIVE" }),
        ]);

        const totalRevenue =
            revenueResult && revenueResult.length > 0
                ? revenueResult[0].totalRevenue
                : 0;

        const totalTickets =
            ticketsResult && ticketsResult.length > 0
                ? ticketsResult[0].totalTickets
                : 0;

        const transactionVolume = totalBookingsCount;

        const activeTickets = totalBookingsCount;
        const canceledTickets = canceledBookingsCount || 0;

        const totalTransactions = totalTransactionsCount || 0;
        const transactionSuccessRate =
            totalTransactions > 0
                ? (totalBookingsCount / totalTransactions) * 100
                : 0;

        const averageTransactionAmount =
            avgAmountResult && avgAmountResult.length > 0
                ? avgAmountResult[0].averageAmount
                : 0;

        const activeUsersGrowthRate =
            newUsersYesterdayCount > 0
                ? ((newUsersTodayCount - newUsersYesterdayCount) /
                    newUsersYesterdayCount) * 100
                : 0;

        const monthlyRevenue = await Booking.aggregate([
            { $match: { status: "booked" } },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" },
                    },
                    revenue: { $sum: "$totalAmount" },
                },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]);

        const monthNames = [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
        ];

        const revenueOverview = monthlyRevenue.map((item) => ({
            label: `${monthNames[item._id.month - 1]} ${item._id.year}`,
            revenue: item.revenue,
        }));

        let revenueChangePercent = 0;
        let revenueChangeText = "+0.0% from last month";

        if (monthlyRevenue.length >= 2) {
            const last = monthlyRevenue[monthlyRevenue.length - 1];
            const previous = monthlyRevenue[monthlyRevenue.length - 2];

            if (previous.revenue > 0) {
                revenueChangePercent =
                    ((last.revenue - previous.revenue) / previous.revenue) * 100;
                const sign = revenueChangePercent >= 0 ? "+" : "";
                revenueChangeText = `${sign}${revenueChangePercent.toFixed(
                    1
                )}% from last month`;
            }
        }

        const revenueTargetAchievedPercent = 89;

        return res.status(200).json({
            success: true,
            data: {
                summary: {
                    revenue: {
                        totalRevenue,
                        revenueChangePercent,
                        revenueChangeText,
                        revenueTargetAchievedPercent,
                    },
                    users: {
                        activeUsers: activeUsersCount,
                        activeUsersGrowthRate,
                        newActiveUsersToday: newUsersTodayCount,
                    },
                    tickets: {
                        totalTickets,
                        activeTickets,
                        canceledTickets,
                    },
                    transactions: {
                        transactionVolume,
                        transactionSuccessRate,
                        averageTransactionAmount,
                    },
                    fleet: {
                        totalFleets: totalFleetsCount,
                        activeFleets: activeFleetsCount,
                    },
                },
                revenueOverview,
            },
        });
    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch dashboard stats",
            error: error.message,
        });
    }
};

module.exports = {
    getDashboardStats,
};