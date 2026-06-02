const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/shuvmarg');
const variantSchema = new mongoose.Schema({}, { strict: false });
const RouteVariant = mongoose.model('RouteVariant', variantSchema);
async function run() {
    const variants = await RouteVariant.find({});
    for (let v of variants) {
        if (v.name === "via bp Highway") { v.name = "Kathmandu to Janakpur via BP Highway"; await v.save(); }
        if (v.name === "via bp Highway (Return)") { v.name = "Janakpur to Kathmandu via BP Highway"; await v.save(); }
        if (v.name === "Mahendra Highway") { v.name = "Kathmandu to Pokhara via Mahendra Hwy"; await v.save(); }
        if (v.name === "Mahendra Highway (Return)") { v.name = "Pokhara to Kathmandu via Mahendra Hwy"; await v.save(); }
    }
    console.log("DB Fixed");
    mongoose.disconnect();
}
run();
