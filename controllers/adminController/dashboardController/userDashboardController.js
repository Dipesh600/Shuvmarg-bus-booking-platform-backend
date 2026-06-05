const User = require("../../../models/userModel.js");

const getUserDashboardStats = async (req, res) => {
    try {
        const now = new Date();

        // This month range
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        // Last month range
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

        // Today and yesterday ranges
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        const endOfYesterday = new Date(endOfToday);
        endOfYesterday.setDate(endOfYesterday.getDate() - 1);

        // Last 30 days range
        const startOfLast30Days = new Date(now);
        startOfLast30Days.setDate(startOfLast30Days.getDate() - 30);

        // Execute a single $facet aggregation to count passenger roles efficiently
        const stats = await User.aggregate([
            { $match: { roles: "passenger" } },
            {
                $facet: {
                    totalUsersCount: [{ $count: "count" }],
                    usersThisMonthCount: [
                        { $match: { createdAt: { $gte: startOfThisMonth, $lte: endOfThisMonth } } },
                        { $count: "count" }
                    ],
                    usersLastMonthCount: [
                        { $match: { createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
                        { $count: "count" }
                    ],
                    activeUsersLast30DaysCount: [
                        { $match: { status: "active", createdAt: { $gte: startOfLast30Days, $lte: now } } },
                        { $count: "count" }
                    ],
                    newUsersTodayCount: [
                        { $match: { createdAt: { $gte: startOfToday, $lte: endOfToday } } },
                        { $count: "count" }
                    ],
                    newUsersYesterdayCount: [
                        { $match: { createdAt: { $gte: startOfYesterday, $lte: endOfYesterday } } },
                        { $count: "count" }
                    ]
                }
            }
        ]);

        const aggregates = stats[0];

        const totalUsersCount = aggregates.totalUsersCount[0]?.count || 0;
        const usersThisMonthCount = aggregates.usersThisMonthCount[0]?.count || 0;
        const usersLastMonthCount = aggregates.usersLastMonthCount[0]?.count || 0;
        const activeUsersLast30DaysCount = aggregates.activeUsersLast30DaysCount[0]?.count || 0;
        const newUsersTodayCount = aggregates.newUsersTodayCount[0]?.count || 0;
        const newUsersYesterdayCount = aggregates.newUsersYesterdayCount[0]?.count || 0;

        const thisMonthIncrease = usersThisMonthCount;
        const thisMonthGrowthPercent =
            usersLastMonthCount > 0
                ? ((usersThisMonthCount - usersLastMonthCount) / usersLastMonthCount) * 100
                : 0;

        const newUsersGrowthVsYesterdayPercent =
            newUsersYesterdayCount > 0
                ? ((newUsersTodayCount - newUsersYesterdayCount) / newUsersYesterdayCount) * 100
                : 0;

        return res.status(200).json({
            success: true,
            data: {
                summary: {
                    totalUsers: {
                        total: totalUsersCount,
                        thisMonthIncrease,
                        thisMonthGrowthPercent,
                    },
                    activeUsers: {
                        last30Days: activeUsersLast30DaysCount,
                    },
                    newUsers: {
                        today: newUsersTodayCount,
                        yesterday: newUsersYesterdayCount,
                        growthVsYesterdayPercent: newUsersGrowthVsYesterdayPercent,
                    },
                    verified: {},
                },
            },
        });
    } catch (error) {
        console.error("Error fetching user dashboard stats:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

module.exports = { getUserDashboardStats };