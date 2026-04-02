import { fetchData, fetchThingSpeakChannel, reverseGeocode } from './api.js';

const CHART_CONFIGS = [
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

document.addEventListener('DOMContentLoaded', async () => {
    const { labels, fields, latitude, longitude } = await fetchThingSpeakChannel(3303931, 100);

    // Resolve location and render map
    const locationLabel = document.getElementById('envLocationLabel');
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    // Build Leaflet map
    const map = L.map('sensorMap').setView([lat, lon], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    const marker = L.marker([lat, lon]).addTo(map);

    // Reverse geocode and update label + marker popup
    if (locationLabel) {
        locationLabel.textContent = 'Resolving location…';
        const placeName = await reverseGeocode(latitude, longitude);
        locationLabel.textContent = `${placeName}`;
        marker.bindPopup(`<strong>${placeName}</strong><br>${lat.toFixed(4)}, ${lon.toFixed(4)}`).openPopup();
    }

    const fieldMap = {};
    fields.forEach(f => fieldMap[f.key] = f.values);

    CHART_CONFIGS.forEach(config => {
        const canvas = document.getElementById(config.canvasId);
        if (!canvas) return;
        const values = fieldMap[config.fieldKey] || [];
        createChart(canvas.getContext('2d'), labels, values, config);
    });
});
