const mongoose = require('mongoose');
require('dotenv').config();
const { generateTripsForDateRange } = require('./services/tripGeneratorCron');
const Schedule = require('./models/scheduleModel');

async function backfill() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');

        const activeSchedules = await Schedule.find({ status: 'ACTIVE' });
        console.log(`Found ${activeSchedules.length} active schedules.`);

        for (const schedule of activeSchedules) {
            console.log(`Generating trips for schedule: ${schedule._id} (${schedule.departureTime})`);
            // Generate for the next 60 days (standard window)
            await generateTripsForDateRange(schedule, 60);
        }

        console.log('Backfill complete.');
        
        // Final count check
        const Trip = mongoose.model('Trip');
        const count = await Trip.countDocuments({});
        console.log(`Total Trips now in DB: ${count}`);

        process.exit(0);
    } catch (err) {
        console.error('Backfill failed:', err);
        process.exit(1);
    }
}

backfill();
