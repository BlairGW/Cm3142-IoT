const BASE_URL = '';

const THINGSPEAK_URL = 'https://api.thingspeak.com';
const THINGSPEAK_API_KEY = 'V07J65T4LJNCP0F6';

/**
 * Fetch all fields from a ThingSpeak channel in a single request
 * @param {number} channelId - The ThingSpeak channel ID
 * @param {number} results - Number of results to return
 * @param {object} [options] - Optional filters
 * @param {string} [options.start] - ISO start date
 * @param {string} [options.end] - ISO end date
 * @returns {Promise<{labels: string[], fields: {name: string, values: number[]}[], latitude: string, longitude: string}>}
 */
export async function fetchThingSpeakChannel(channelId, results = 100, options = {}) {
    try {
        let url = `${THINGSPEAK_URL}/channels/${channelId}/feeds.json?api_key=${THINGSPEAK_API_KEY}&results=${results}&location=true`;
        if (options.start) url += `&start=${encodeURIComponent(options.start)}`;
        if (options.end) url += `&end=${encodeURIComponent(options.end)}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        const data = await response.json();
        const fieldKeys = Object.keys(data.channel).filter(k => k.startsWith('field'));

        // Get lat/lon from the most recent feed entry that has them
        const latestWithLocation = [...data.feeds].reverse().find(e => e.latitude && e.longitude);
        const latitude = latestWithLocation?.latitude ?? data.channel.latitude;
        const longitude = latestWithLocation?.longitude ?? data.channel.longitude;

        // Group feeds by location (rounded to ~100m to cluster nearby readings)
        const locationGroups = {};
        data.feeds.forEach(entry => {
            const lat = parseFloat(entry.latitude || data.channel.latitude);
            const lon = parseFloat(entry.longitude || data.channel.longitude);
            // Round to 3 decimal places (~111m precision) to cluster nearby points
            const locKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
            if (!locationGroups[locKey]) {
                locationGroups[locKey] = { latitude: lat, longitude: lon, feeds: [] };
            }
            locationGroups[locKey].feeds.push(entry);
        });

        // Build full (unfiltered) result
        const labels = data.feeds.map(entry => new Date(entry.created_at).toLocaleTimeString());
        const fields = fieldKeys.map(key => ({
            name: data.channel[key] || key,
            key,
            values: data.feeds.map(entry => parseFloat(entry[key]))
        }));

        return { labels, fields, channelName: data.channel.name, latitude, longitude, locationGroups, fieldKeys };
    } catch (error) {
        console.error('Error fetching ThingSpeak channel data:', error);
        throw error;
    }
}

/**
 * Reverse geocode lat/lon to a human-readable place name using Nominatim
 * @param {string|number} latitude
 * @param {string|number} longitude
 * @returns {Promise<string>} - Place name or fallback coordinate string
 */
export async function reverseGeocode(latitude, longitude) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`;
        const response = await fetch(url, {
            headers: { 'Accept-Language': 'en' }
        });
        if (!response.ok) throw new Error(`Geocode error: ${response.status}`);
        const data = await response.json();
        const addr = data.address;
        // Build a short readable label from available address parts
        const parts = [
            addr.building || addr.amenity || addr.road,
            addr.suburb || addr.village || addr.town || addr.city,
            addr.county || addr.state,
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(', ') : data.display_name;
    } catch (error) {
        console.warn('Reverse geocode failed, using coordinates:', error);
        return `${parseFloat(latitude).toFixed(4)}, ${parseFloat(longitude).toFixed(4)}`;
    }
}

/**
 * Fetch field data from a ThingSpeak channel
 * @param {number} channelId - The ThingSpeak channel ID
 * @param {number} field - The field number to fetch (e.g. 1 for field1)
 * @param {number} results - Number of results to return
 * @returns {Promise<{labels: string[], values: number[], fieldName: string}>}
 */
export async function fetchThingSpeakField(channelId, field, results = 100) {
    try {
        const url = `${THINGSPEAK_URL}/channels/${channelId}/fields/${field}.json?api_key=${THINGSPEAK_API_KEY}&results=${results}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        const data = await response.json();
        const fieldKey = `field${field}`;
        const fieldName = data.channel[fieldKey] || `Field ${field}`;
        const labels = data.feeds.map(entry => new Date(entry.created_at).toLocaleTimeString());
        const values = data.feeds.map(entry => parseFloat(entry[fieldKey]));
        return { labels, values, fieldName };
    } catch (error) {
        console.error('Error fetching ThingSpeak data:', error);
        throw error;
    }
}

/**
 * Generic GET request
 * @param {string} endpoint - The API endpoint to fetch from
 * @returns {Promise<any>} - The response data
 */
export async function fetchData(endpoint) {
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    }
}

/**
 * Generic POST request
 * @param {string} endpoint - The API endpoint to post to
 * @param {object} data - The data to send in the request body
 * @returns {Promise<any>} - The response data
 */
export async function postData(endpoint, data) {
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error posting data:', error);
        throw error;
    }
}
