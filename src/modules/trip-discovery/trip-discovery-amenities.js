function collectAmenityNames(bus) {
  const names = [];
  for (const item of bus?.amenityIds || []) {
    if (!item) continue;
    if (typeof item === "string") names.push(item);
    else if (Array.isArray(item.amenities)) appendAmenities(names, item.amenities);
    else if (item.name) names.push(item.name);
  }
  const legacy = bus?.amenitiesId;
  if (Array.isArray(legacy?.amenities)) appendAmenities(names, legacy.amenities);
  else if (legacy?.name) names.push(legacy.name);
  return [...new Set(names)].filter(Boolean);
}

function appendAmenities(target, amenities) {
  for (const amenity of amenities) {
    if (typeof amenity === "string") target.push(amenity);
    else if (amenity?.name) target.push(amenity.name);
  }
}

module.exports = { collectAmenityNames };
