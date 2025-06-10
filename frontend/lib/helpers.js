export const prettifyDateFormat = (timestamp) => {
    const date = new Date(timestamp);
    // Format the date part (e.g., "Jan 1, 2000")
    const datePart = date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    // Format the time part (e.g., "12:00:00 AM")
    const timePart = date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
    return `${datePart} at ${timePart}`;
}
