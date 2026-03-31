const BASE_URL = '';

const THINGSPEAK_URL = 'https://api.thingspeak.com';
const THINGSPEAK_API_KEY = 'V07J65T4LJNCP0F6';

/**
 * Fetch all fields from a ThingSpeak channel in a single request
 * @param {number} channelId - The ThingSpeak channel ID
 * @param {number} results - Number of results to return
 * @returns {Promise<{labels: string[], fields: {name: string, values: number[]}[]}>}
 */
export async function fetchThingSpeakChannel(channelId, results = 100) {
    try {
        const url = `${THINGSPEAK_URL}/channels/${channelId}/feeds.json?api_key=${THINGSPEAK_API_KEY}&results=${results}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        const data = await response.json();
        const labels = data.feeds.map(entry => new Date(entry.created_at).toLocaleTimeString());
        const fieldKeys = Object.keys(data.channel).filter(k => k.startsWith('field'));
        const fields = fieldKeys.map(key => ({
            name: data.channel[key] || key,
            key,
            values: data.feeds.map(entry => parseFloat(entry[key]))
        }));
        return { labels, fields, channelName: data.channel.name };
    } catch (error) {
        console.error('Error fetching ThingSpeak channel data:', error);
        throw error;
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
