/**
 * ARCHIVED MIGRATION SCRIPT METADATA
 * -----------------------------------
 * File: scripts/archive/categorize_stops.js
 * Execution Status: COMPLETED
 * Purpose: Categorize legacy stop records by region and tier.
 * Affected Collections: stops
 * Rerun Safety: SAFE (Idempotent: updates stop categories based on city matching rules).
 */

require("dotenv").config();
const mongoose = require("mongoose");
const axios = require("axios");
const Stop = require("../models/stopModel");

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    const MONGO_URI = process.env.MONGODB_URL || process.env.MONGODB_URI;
    const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;

    if (!MONGO_URI) {
        console.error("MONGODB_URL is missing in .env");
        process.exit(1);
    }
    if (!GOOGLE_API_KEY) {
        console.error("GOOGLE_MAPS_API_KEY is missing in .env");
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB.");

        const stops = await Stop.find({
            $or: [
                { province: { $exists: false } },
                { province: null },
                { province: "" },
                { district: { $exists: false } },
                { district: null },
                { district: "" }
            ]
        });

        console.log(`Found ${stops.length} stops missing category data.`);

        let updatedCount = 0;
        let skippedCount = 0;

        for (const stop of stops) {
            let lat, lng;
            
            if (!stop.coordinates || !stop.coordinates.lat || !stop.coordinates.lng) {
                console.log(`Stop ${stop.name} (${stop.code}) is missing coordinates. Trying forward geocode...`);
                try {
                    const fwRes = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
                        params: {
                            address: `${stop.name}, Nepal`,
                            key: GOOGLE_API_KEY
                        }
                    });
                    if (fwRes.data.status === "OK" && fwRes.data.results.length > 0) {
                        const loc = fwRes.data.results[0].geometry.location;
                        lat = loc.lat;
                        lng = loc.lng;
                        stop.coordinates = { lat, lng };
                    } else {
                        console.log(`  Failed to forward geocode ${stop.name}: ${fwRes.data.status}`);
                        skippedCount++;
                        continue;
                    }
                } catch (e) {
                    console.error(`  Error forward geocoding ${stop.name}:`, e.message);
                    skippedCount++;
                    continue;
                }
            } else {
                lat = stop.coordinates.lat;
                lng = stop.coordinates.lng;
            }

            try {
                console.log(`Reverse geocoding for ${stop.name} at ${lat},${lng}...`);
                const revRes = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
                    params: {
                        latlng: `${lat},${lng}`,
                        key: GOOGLE_API_KEY
                    }
                });

                if (revRes.data.status === "OK" && revRes.data.results.length > 0) {
                    let province = "";
                    let district = "";
                    let municipality = "";
                    
                    // The first result is usually the most specific point, but we can look through components
                    const components = revRes.data.results[0].address_components;

                    components.forEach(comp => {
                        if (comp.types.includes("administrative_area_level_1")) {
                            province = comp.long_name;
                        }
                        if (comp.types.includes("administrative_area_level_2") || comp.types.includes("administrative_area_level_3") && district === "") {
                            district = comp.long_name;
                        }
                        if (comp.types.includes("locality") || comp.types.includes("sublocality")) {
                            municipality = comp.long_name;
                        }
                    });

                    // fallback for district if empty
                    if (!district) {
                        components.forEach(comp => {
                            if (comp.types.includes("administrative_area_level_3")) district = comp.long_name;
                        });
                    }

                    if (province) stop.province = province.replace(" Province", "");
                    if (district) stop.district = district.replace(" District", "");
                    if (municipality) stop.municipality = municipality;

                    await stop.save();
                    console.log(`  -> Updated ${stop.name}: ${stop.province} > ${stop.district} > ${stop.municipality}`);
                    updatedCount++;
                } else {
                    console.log(`  -> Reverse geocode failed for ${stop.name}: ${revRes.data.status}`);
                    skippedCount++;
                }
            } catch (e) {
                console.error(`  Error reverse geocoding ${stop.name}:`, e.message);
                skippedCount++;
            }

            await delay(200); 
        }

        console.log(`\nFinished categorizing stops.`);
        console.log(`Successfully updated: ${updatedCount}`);
        console.log(`Skipped/Failed: ${skippedCount}`);

    } catch (error) {
        console.error("Fatal Error:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
        process.exit(0);
    }
}

run();
