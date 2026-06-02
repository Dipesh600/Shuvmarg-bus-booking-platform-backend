const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/shuvmarg');
const variantSchema = new mongoose.Schema({}, { strict: false });
const RouteVariant = mongoose.model('RouteVariant', variantSchema);
const corridorSchema = new mongoose.Schema({}, { strict: false });
const RouteCorridor = mongoose.model('RouteCorridor', corridorSchema);
const stopSchema = new mongoose.Schema({}, { strict: false });
const RouteStop = mongoose.model('RouteStop', stopSchema);

async function run() {
    const variants = await RouteVariant.find({ direction: 'RETURN' });
    for (let v of variants) {
        if (!v.name.includes('(Return)')) continue; // already fixed
        
        const corridor = await RouteCorridor.findById(v.corridorId);
        if (!corridor) continue;
        const origin = await RouteStop.findById(corridor.originId);
        const destination = await RouteStop.findById(corridor.destinationId);
        if (!origin || !destination) continue;
        
        const oName = origin.name || "";
        const dName = destination.name || "";
        const oCode = origin.code || "";
        const dCode = destination.code || "";
        
        // The original forward name is likely without " (Return)"
        let name = v.name.replace(' (Return)', '');
        
        let flipped = name;
        let matched = false;

        if (oName && name.toLowerCase().includes(oName.toLowerCase())) {
            flipped = flipped.replace(new RegExp(oName, 'ig'), '__O_NAME__');
            matched = true;
        } else if (oCode && name.toLowerCase().includes(oCode.toLowerCase())) {
            flipped = flipped.replace(new RegExp(oCode, 'ig'), '__O_CODE__');
            matched = true;
        }

        if (dName && name.toLowerCase().includes(dName.toLowerCase())) {
            flipped = flipped.replace(new RegExp(dName, 'ig'), '__D_NAME__');
            matched = true;
        } else if (dCode && name.toLowerCase().includes(dCode.toLowerCase())) {
            flipped = flipped.replace(new RegExp(dCode, 'ig'), '__D_CODE__');
            matched = true;
        }

        if (matched) {
            flipped = flipped.replace(/__O_NAME__/g, dName || dCode);
            flipped = flipped.replace(/__O_CODE__/g, dCode || dName);
            flipped = flipped.replace(/__D_NAME__/g, oName || oCode);
            flipped = flipped.replace(/__D_CODE__/g, oCode || oName);
            v.name = flipped;
            await v.save();
            console.log("Fixed:", name, "->", flipped);
        }
    }
    console.log("Migration complete");
    mongoose.disconnect();
}
run();
