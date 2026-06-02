function flipName(name, origin, destination) {
    if (!origin || !destination) return `${name} (Return)`;
    
    // Attempt 1: If name matches "Origin to Destination" exactly
    const forwardRegex = new RegExp(`^${origin}\\s+to\\s+${destination}$`, "i");
    if (forwardRegex.test(name)) {
        return `${destination} to ${origin}`;
    }
    
    // Attempt 2: If name contains "Origin" and "Destination" somewhere
    if (name.toLowerCase().includes(origin.toLowerCase()) && name.toLowerCase().includes(destination.toLowerCase())) {
        let flipped = name.replace(new RegExp(origin, 'ig'), '__TEMP__');
        flipped = flipped.replace(new RegExp(destination, 'ig'), origin);
        flipped = flipped.replace(/__TEMP__/g, destination);
        return flipped;
    }
    
    return `${name} (Return)`;
}
console.log(flipName("KTM to JNP", "KTM", "JNP"));
console.log(flipName("Kathmandu to Janakpur via bp", "Kathmandu", "Janakpur"));
console.log(flipName("via bp Highway", "Kathmandu", "Janakpur"));
