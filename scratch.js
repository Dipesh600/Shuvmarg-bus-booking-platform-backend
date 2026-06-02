const mongoose = require('mongoose');
const Trip = require('./models/tripModel.js');

mongoose.connect('mongodb://127.0.0.1:27017/shuvmarg').then(async () => {
    const trips = await Trip.find().populate('variantId').populate('routeId').limit(1);
    console.log("Trip 1 routeId:", trips[0]?.routeId ? "Yes" : "No");
    if (trips[0]?.variantId) console.log("Variant:", trips[0].variantId);
    
    mongoose.disconnect();
});
