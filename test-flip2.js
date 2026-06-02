function flip(name, oName, dName, oCode, dCode) {
    let returnName = `${name} (Return)`;
    let flipped = name;
    let matched = false;

    // Check Origin
    if (oName && name.toLowerCase().includes(oName.toLowerCase())) {
        flipped = flipped.replace(new RegExp(oName, 'ig'), '__O_NAME__');
        matched = true;
    } else if (oCode && name.toLowerCase().includes(oCode.toLowerCase())) {
        flipped = flipped.replace(new RegExp(oCode, 'ig'), '__O_CODE__');
        matched = true;
    }

    // Check Destination
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
        return flipped;
    }

    return returnName;
}
console.log(flip("ktm- janakpur", "Kathmandu", "Janakpur", "KTM", "JNP"));
console.log(flip("Kathmandu to JNP", "Kathmandu", "Janakpur", "KTM", "JNP"));
