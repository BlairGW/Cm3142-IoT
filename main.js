import { fetchData, fetchThingSpeakChannel, fetchNoisePollutionData, reverseGeocode } from './api.js';

// ── Chart configs ────────────────────────────────────
const ENV_CHART_CONFIGS = [
    {
        canvasId: 'temperatureChart',
        fieldKey: 'field1',
        label: 'Temperature',
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        yLabel: 'Temperature (°C)',
    },
    {
        canvasId: 'humidityChart',
        fieldKey: 'field2',
        label: 'Humidity',
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        yLabel: 'Humidity (%)',
    },
    {
        canvasId: 'brightnessChart',
        fieldKey: 'field3',
        label: 'Brightness',
        borderColor: 'rgb(255, 205, 86)',
        backgroundColor: 'rgba(255, 205, 86, 0.2)',
        yLabel: 'Brightness (lux)',
    },
];

const DARK = {
    grid: 'rgba(255,255,255,0.06)',
    tick: '#8892a4',
    title: '#8892a4',
};

const activeCharts = {};
const locationNames = {};

// ── Shared helpers ───────────────────────────────────
function createChart(ctx, labels, values, config) {
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: config.label,
                data: values,
                borderColor: config.borderColor,
                backgroundColor: config.backgroundColor,
                tension: 0.4,
                fill: true,
                pointRadius: 3,
                pointHoverRadius: 6,
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            animation: { duration: 600 },
            plugins: {
                legend: { display: false },
                title: { display: false },
                tooltip: {
                    backgroundColor: '#1a1d27',
                    borderColor: '#2e3250',
                    borderWidth: 1,
                    titleColor: '#e2e8f0',
                    bodyColor: '#8892a4',
                    padding: 10,
                }
            },
            scales: {
                x: {
                    ticks: { color: DARK.tick, maxTicksLimit: 8, maxRotation: 0 },
                    grid: { color: DARK.grid },
                    title: { display: false },
                },
                y: {
                    ticks: { color: DARK.tick },
                    grid: { color: DARK.grid },
                    title: { display: true, text: config.yLabel, color: DARK.title, font: { size: 11 } },
                }
            }
        }
    });
}

function destroyChart(id) {
    if (activeCharts[id]) { activeCharts[id].destroy(); delete activeCharts[id]; }
}

function buildMap(elementId, lat, lon) {
    const map = L.map(elementId).setView([lat, lon], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    const marker = L.marker([lat, lon]).addTo(map);
    return { map, marker };
}

function getTimeRange(rangeKey) {
    const now = new Date();
    const start = new Date(now);
    switch (rangeKey) {
        case '1h':  start.setHours(now.getHours() - 1); break;
        case '24h': start.setDate(now.getDate() - 1); break;
        case '7d':  start.setDate(now.getDate() - 7); break;
        case 'all': return {};
        default:    return {};
    }
    return { start: start.toISOString(), end: now.toISOString() };
}

function filterFeedsByLocation(locationGroups, locKey) {
    if (locKey === 'all') {
        const all = [];
        Object.values(locationGroups).forEach(g => all.push(...g.feeds));
        all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        return all;
    }
    return locationGroups[locKey]?.feeds || [];
}

function getLocationCoords(locationGroups, locKey, fallbackLat, fallbackLon) {
    if (locKey !== 'all' && locationGroups[locKey]) {
        return { lat: locationGroups[locKey].latitude, lon: locationGroups[locKey].longitude };
    }
    return { lat: fallbackLat, lon: fallbackLon };
}

async function populateLocationDropdown(selectId, locationGroups) {
    const select = document.getElementById(selectId);
    const prev = select.value;
    select.innerHTML = '<option value="all">All Locations</option>';
    for (const locKey of Object.keys(locationGroups)) {
        const opt = document.createElement('option');
        opt.value = locKey;
        opt.textContent = locationNames[locKey] || `📍 ${locKey}`;
        select.appendChild(opt);
    }
    if ([...select.options].some(o => o.value === prev)) select.value = prev;

    // Resolve names in background
    for (const locKey of Object.keys(locationGroups)) {
        if (locationNames[locKey]) continue;
        const g = locationGroups[locKey];
        try {
            const name = await reverseGeocode(g.latitude, g.longitude);
            locationNames[locKey] = name;
            const opt = [...select.options].find(o => o.value === locKey);
            if (opt) opt.textContent = `📍 ${name}`;
        } catch { /* keep coord fallback */ }
    }
}

async function updateMapLabel(labelId, map, marker, lat, lon) {
    const coordKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    map.setView([lat, lon], 14);
    marker.setLatLng([lat, lon]);
    const el = document.getElementById(labelId);
    if (!el) return;
    if (locationNames[coordKey]) {
        el.textContent = locationNames[coordKey];
        marker.bindPopup(`<strong>${locationNames[coordKey]}</strong><br>${lat.toFixed(4)}, ${lon.toFixed(4)}`).openPopup();
    } else {
        el.textContent = 'Resolving location…';
        const name = await reverseGeocode(lat, lon);
        locationNames[coordKey] = name;
        el.textContent = name;
        marker.bindPopup(`<strong>${name}</strong><br>${lat.toFixed(4)}, ${lon.toFixed(4)}`).openPopup();
    }
}

// ════════════════════════════════════════════════════════
//  ENVIRONMENT SECTION
// ════════════════════════════════════════════════════════
let envMap = null, envMarker = null;
let envLocationGroups = {}, envFieldKeys = [];
let envTimeRange = 'all';

async function loadEnvData() {
    const range = getTimeRange(envTimeRange);
    const results = envTimeRange === 'all' ? 100 : 8000;
    const data = await fetchThingSpeakChannel(3303931, results, range);

    envLocationGroups = data.locationGroups;
    envFieldKeys = data.fieldKeys;

    await populateLocationDropdown('envLocationSelect', envLocationGroups);
    renderEnv(data.latitude, data.longitude);
}

function renderEnv(fallbackLat, fallbackLon) {
    const locKey = document.getElementById('envLocationSelect').value;
    const feeds = filterFeedsByLocation(envLocationGroups, locKey);
    const { lat, lon } = getLocationCoords(envLocationGroups, locKey, parseFloat(fallbackLat), parseFloat(fallbackLon));

    // Map
    if (!envMap) {
        const m = buildMap('sensorMap', lat, lon);
        envMap = m.map; envMarker = m.marker;
    }
    updateMapLabel('envLocationLabel', envMap, envMarker, lat, lon);

    // Charts
    const labels = feeds.map(e => new Date(e.created_at).toLocaleTimeString());
    const fieldMap = {};
    envFieldKeys.forEach(key => { fieldMap[key] = feeds.map(e => parseFloat(e[key])); });

    ENV_CHART_CONFIGS.forEach(config => {
        const canvas = document.getElementById(config.canvasId);
        if (!canvas) return;
        destroyChart(config.canvasId);
        activeCharts[config.canvasId] = createChart(canvas.getContext('2d'), labels, fieldMap[config.fieldKey] || [], config);
    });
}

// ════════════════════════════════════════════════════════
//  NOISE SECTION
// ════════════════════════════════════════════════════════
let noiseMap = null, noiseMarker = null;
let noiseLocationGroups = {};
let noiseTimeRange = 'all';
const classMap = { Low: 1, Moderate: 2, High: 3 };

async function loadNoiseData() {
    const range = getTimeRange(noiseTimeRange);
    const results = noiseTimeRange === 'all' ? 100 : 8000;
    const data = await fetchNoisePollutionData(results, range);

    noiseLocationGroups = data.locationGroups;

    await populateLocationDropdown('noiseLocationSelect', noiseLocationGroups);
    renderNoise(data.latitude, data.longitude);
}

function renderNoise(fallbackLat, fallbackLon) {
    const locKey = document.getElementById('noiseLocationSelect').value;
    const feeds = filterFeedsByLocation(noiseLocationGroups, locKey);
    const { lat, lon } = getLocationCoords(noiseLocationGroups, locKey, parseFloat(fallbackLat), parseFloat(fallbackLon));

    const mapLat = isNaN(lat) ? 51.505 : lat;
    const mapLon = isNaN(lon) ? -0.09 : lon;

    if (!noiseMap) {
        const m = buildMap('noiseMap', mapLat, mapLon);
        noiseMap = m.map; noiseMarker = m.marker;
    }
    updateMapLabel('noiseLocationLabel', noiseMap, noiseMarker, mapLat, mapLon);

    const labels = feeds.map(e => new Date(e.created_at).toLocaleTimeString());
    const noiseValues = feeds.map(e => parseFloat(e.field1));
    const classValues = feeds.map(e => classMap[e.field2] ?? null);

    destroyChart('noiseChart');
    activeCharts['noiseChart'] = createChart(
        document.getElementById('noiseChart').getContext('2d'),
        labels, noiseValues,
        { label: 'Noise Level', borderColor: 'rgb(251, 146, 60)', backgroundColor: 'rgba(251, 146, 60, 0.2)', yLabel: 'Noise Level (dB)' }
    );

    destroyChart('noiseClassChart');
    activeCharts['noiseClassChart'] = createChart(
        document.getElementById('noiseClassChart').getContext('2d'),
        labels, classValues,
        { label: 'Classification', borderColor: 'rgb(167, 139, 250)', backgroundColor: 'rgba(167, 139, 250, 0.2)', yLabel: '1=Low  2=Moderate  3=High' }
    );
}

// ════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

    // Wire up time-range buttons (both sections)
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            // Toggle active state within this section only
            document.querySelectorAll(`.time-btn[data-section="${section}"]`).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (section === 'env') {
                envTimeRange = btn.dataset.range;
                loadEnvData();
            } else if (section === 'noise') {
                noiseTimeRange = btn.dataset.range;
                loadNoiseData();
            }
        });
    });

    // Wire up location selects (instant client-side re-render)
    document.getElementById('envLocationSelect').addEventListener('change', () => {
        const latest = envLocationGroups[Object.keys(envLocationGroups)[0]];
        renderEnv(latest?.latitude ?? 0, latest?.longitude ?? 0);
    });
    document.getElementById('noiseLocationSelect').addEventListener('change', () => {
        const latest = noiseLocationGroups[Object.keys(noiseLocationGroups)[0]];
        renderNoise(latest?.latitude ?? 0, latest?.longitude ?? 0);
    });

    // Initial load
    loadEnvData();
    loadNoiseData();
});