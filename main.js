import { fetchData, fetchThingSpeakField } from './api.js';

document.addEventListener('DOMContentLoaded', async () => {
    const { labels, values, fieldName } = await fetchThingSpeakField(3303931, 1, 100);

    const ctx = document.getElementById('sensorChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: fieldName,
                data: values,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.3,
                fill: true,
                pointRadius: 4,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' },
                title: {
                    display: true,
                    text: 'Environment - Field 1'
                }
            },
            scales: {
                x: { title: { display: true, text: 'Time' } },
                y: { title: { display: true, text: fieldName } }
            }
        }
    });
});
