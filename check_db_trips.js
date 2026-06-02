const mongoose = require('mongoose');
require('dotenv').config();

async function checkTrips() {
    try {
        await mongoose.connect(process.env.MONGODB_URL);
        console.log('Connected to MongoDB');

        const Trip = mongoose.model('Trip', new mongoose.Schema({}, { strict: false }));
        const Schedule = mongoose.model('Schedule', new mongoose.Schema({}, { strict: false }));

        const dbs = await mongoose.connection.db.admin().listDatabases();
        console.log('Databases:', dbs.databases.map(d => d.name).join(', '));

        const activeSchedulesCount = await Schedule.countDocuments({ status: 'ACTIVE' });
        console.log('Active Schedules:', activeSchedulesCount);

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name).join(', '));

        const tripsCount = await mongoose.connection.db.collection('trips').countDocuments({});
        console.log('Count in "trips":', tripsCount);

        const busSchedulesCount = await mongoose.connection.db.collection('busschedules').countDocuments({});
        console.log('Count in "busschedules":', busSchedulesCount);

        const routesCount = await mongoose.connection.db.collection('routes').countDocuments({});
        console.log('Count in "routes":', routesCount);

        const busRoutesCount = await mongoose.connection.db.collection('busroutes').countDocuments({});
        console.log('Count in "busroutes":', busRoutesCount);

        const bookingsCount = await mongoose.connection.db.collection('bookings').countDocuments({});
        console.log('Count in "bookings":', bookingsCount);

        const busesCount = await mongoose.connection.db.collection('buses').countDocuments({});
        console.log('Count in "buses":', busesCount);

        const schedulesCount = await mongoose.connection.db.collection('schedules').countDocuments({});
        console.log('Count in "schedules":', schedulesCount);

        const latestTrips = await Trip.find({ tripDate: { $gte: new Date() } })
            .sort({ tripDate: 1 })
            .limit(10)
            .lean();
        
        console.log('First 10 upcoming trips:');
        latestTrips.forEach(t => {
            console.log(`- ID: ${t.tripId}, Date: ${t.tripDate}, Status: ${t.status}`);
        });

        const lastTrip = await Trip.findOne().sort({ tripDate: -1 }).lean();
        console.log('Latest Trip in DB:', lastTrip ? `${lastTrip.tripDate} (${lastTrip.tripId})` : 'None');

        const activeSchedules = await Schedule.find({ status: 'ACTIVE' }).lean();
        console.log('--- Active Schedules Detail ---');
        activeSchedules.forEach(s => {
            console.log(`- ID: ${s._id}, EffectiveFrom: ${s.effectiveFrom}, Recurrence: ${s.recurrence}, Model: ${s.operationalModel}, AdvanceGenDays: ${s.advanceGenerationDays}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkTrips();
