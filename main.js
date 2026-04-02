import { fetchData, fetchThingSpeakChannel, reverseGeocode } from './api.js';

// ── Threshold definitions ────────────────────────
const THRESHOLDS = {
    field1: { unit: '°C', normal: [15, 25], warning: [5, 35], label: 'Temperature' },
    field2: { unit: '%',  normal: [30, 60], warning: [20, 80], label: 'Humidity' },
    field3: { unit: ' hPa', normal: [300, 800], warning: [100, 1200], label: 'Brightness' },
};

function getStatus(fieldKey, value) {
    const t = THRESHOLDS[fieldKey];
    if (!t || isNaN(value)) return { level: 'unknown', text: '—' };
    if (value >= t.normal[0] && value <= t.normal[1]) return { level: 'normal', text: 'Normal' };
    if (value >= t.warning[0] && value <= t.warning[1]) return { level: 'warning', text: 'Warning' };
    return { level: 'critical', text: 'Critical' };
}

const CHART_CONFIGS = [
    {
        canvasId: 'temperatureChart',
        fieldKey: 'field1',
        label: 'Temperature',
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        yLabel: 'Temperature (°C)',
        statusId: 'tempStatus',
        latestId: 'tempLatest',
    },
    {
        canvasId: 'humidityChart',
        fieldKey: 'field2',
        label: 'Humidity',
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        yLabel: 'Humidity (%)',
        statusId: 'humidityStatus',
        latestId: 'humidityLatest',
    },
    {
        canvasId: 'brightnessChart',
        fieldKey: 'field3',
        label: 'Brightness',
        borderColor: 'rgb(255, 205, 86)',
        backgroundColor: 'rgba(255, 205, 86, 0.2)',
        yLabel: 'Brightness (lux)',
        statusId: 'brightnessStatus',
        latestId: 'brightnessLatest',
    },
];

const DARK = {
    grid: 'rgba(255,255,255,0.06)',
    tick: '#8892a4',
    title: '#8892a4',
};

const activeCharts = {};
let leafletMap = null;
let leafletMarker = null;
let currentLocationGroups = {};
let currentFieldKeys = [];
let locationNames = {}; // locKey -> resolved name

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

// ── Time range helpers ───────────────────────────
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

// ── Main data loader ─────────────────────────────
async function loadData(rangeKey = 'all') {
    const range = getTimeRange(rangeKey);
    const results = rangeKey === 'all' ? 100 : 8000;
    const data = await fetchThingSpeakChannel(3303931, results, range);

    currentLocationGroups = data.locationGroups;
    currentFieldKeys = data.fieldKeys;

    // Populate location dropdown
    const locSelect = document.getElementById('locationSelect');
    const prevValue = locSelect.value;
    locSelect.innerHTML = '<option value="all">All Locations</option>';

    const locKeys = Object.keys(currentLocationGroups);
    for (const locKey of locKeys) {
        const opt = document.createElement('option');
        opt.value = locKey;
        // Use cached name or coordinates as placeholder until resolved
        opt.textContent = locationNames[locKey] || `📍 ${locKey}`;
        locSelect.appendChild(opt);
    }

    // Restore previous selection if still valid
    if ([...locSelect.options].some(o => o.value === prevValue)) {
        locSelect.value = prevValue;
    }

    // Resolve names for all locations (in background)
    resolveLocationNames(locKeys);

    // Render with current selection
    renderForLocation(locSelect.value, data);
}

async function resolveLocationNames(locKeys) {
    const locSelect = document.getElementById('locationSelect');
    for (const locKey of locKeys) {
        if (locationNames[locKey]) continue;
        const group = currentLocationGroups[locKey];
        try {
            const name = await reverseGeocode(group.latitude, group.longitude);
            locationNames[locKey] = name;
            // Update the dropdown option text
            const opt = [...locSelect.options].find(o => o.value === locKey);
            if (opt) opt.textContent = `📍 ${name}`;
        } catch { /* keep coordinate fallback */ }
    }
}

function renderForLocation(locKey, data) {
    let feeds, lat, lon;

    if (locKey === 'all') {
        // Combine all feeds
        feeds = [];
        Object.values(currentLocationGroups).forEach(g => feeds.push(...g.feeds));
        feeds.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        lat = parseFloat(data.latitude);
        lon = parseFloat(data.longitude);
    } else {
        const group = currentLocationGroups[locKey];
        feeds = group.feeds;
        lat = group.latitude;
        lon = group.longitude;
    }

    const labels = feeds.map(entry => new Date(entry.created_at).toLocaleTimeString());

    // Map
    if (!leafletMap) {
        leafletMap = L.map('sensorMap').setView([lat, lon], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(leafletMap);
        leafletMarker = L.marker([lat, lon]).addTo(leafletMap);
    } else {
        leafletMap.setView([lat, lon], 14);
        leafletMarker.setLatLng([lat, lon]);
    }

    // Update location label
    const locationLabel = document.getElementById('envLocationLabel');
    const coordKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const resolvedName = locationNames[coordKey];
    if (locationLabel) {
        if (resolvedName) {
            locationLabel.textContent = resolvedName;
            leafletMarker.bindPopup(`<strong>${resolvedName}</strong><br>${lat.toFixed(4)}, ${lon.toFixed(4)}`).openPopup();
        } else {
            locationLabel.textContent = 'Resolving location…';
            reverseGeocode(lat, lon).then(name => {
                locationLabel.textContent = name;
                locationNames[coordKey] = name;
                leafletMarker.bindPopup(`<strong>${name}</strong><br>${lat.toFixed(4)}, ${lon.toFixed(4)}`).openPopup();
            });
        }
    }

    // Build field map from feeds
    const fieldMap = {};
    currentFieldKeys.forEach(key => {
        fieldMap[key] = feeds.map(entry => parseFloat(entry[key]));
    });

    // Render charts + status badges
    CHART_CONFIGS.forEach(config => {
        const canvas = document.getElementById(config.canvasId);
        if (!canvas) return;
        const values = fieldMap[config.fieldKey] || [];

        if (activeCharts[config.canvasId]) {
            activeCharts[config.canvasId].destroy();
        }
        activeCharts[config.canvasId] = createChart(canvas.getContext('2d'), labels, values, config);

        const latestVal = values.filter(v => !isNaN(v)).pop();
        const statusEl = document.getElementById(config.statusId);
        const latestEl = document.getElementById(config.latestId);
        if (statusEl && latestVal !== undefined) {
            const { level, text } = getStatus(config.fieldKey, latestVal);
            statusEl.className = `status-badge status-${level}`;
            statusEl.textContent = text;
        }
        if (latestEl && latestVal !== undefined) {
            const t = THRESHOLDS[config.fieldKey];
            latestEl.textContent = `${latestVal.toFixed(1)}${t.unit}`;
        }
    });
}

// ── Init ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Time range buttons
    const btns = document.querySelectorAll('.time-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadData(btn.dataset.range);
        });
    });

    // Location filter
    const locSelect = document.getElementById('locationSelect');
    locSelect.addEventListener('change', () => {
        // Re-render with the same fetched data, just filtered
        renderForLocation(locSelect.value, {
            latitude: Object.values(currentLocationGroups)[0]?.latitude,
            longitude: Object.values(currentLocationGroups)[0]?.longitude,
        });
    });

    // Initial load
    loadData('all');
});
