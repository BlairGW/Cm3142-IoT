import { fetchData, fetchThingSpeakChannel } from './api.js';

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
                tension: 0.3,
                fill: true,
                pointRadius: 4,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' },
                title: { display: true, text: config.label }
            },
            scales: {
                x: { title: { display: true, text: 'Time' } },
                y: { title: { display: true, text: config.yLabel } }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const { labels, fields } = await fetchThingSpeakChannel(3303931, 100);

    const fieldMap = {};
    fields.forEach(f => fieldMap[f.key] = f.values);

    CHART_CONFIGS.forEach(config => {
        const canvas = document.getElementById(config.canvasId);
        if (!canvas) return;
        const values = fieldMap[config.fieldKey] || [];
        createChart(canvas.getContext('2d'), labels, values, config);
    });
});
