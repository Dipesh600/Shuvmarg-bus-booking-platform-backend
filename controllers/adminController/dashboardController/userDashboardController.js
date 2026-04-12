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

        const [
            totalUsersCount,
            usersThisMonthCount,
            usersLastMonthCount,
            activeUsersLast30DaysCount,
            newUsersTodayCount,
            newUsersYesterdayCount,
        ] = await Promise.all([
            User.countDocuments({}),
            User.countDocuments({
                createdAt: { $gte: startOfThisMonth, $lte: endOfThisMonth },
            }),
            User.countDocuments({
                createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
            }),
            User.countDocuments({
                status: "active",
                createdAt: { $gte: startOfLast30Days, $lte: now },
            }),
            User.countDocuments({
                createdAt: { $gte: startOfToday, $lte: endOfToday },
            }),
            User.countDocuments({
                createdAt: { $gte: startOfYesterday, $lte: endOfYesterday },
            }),
        ]);

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