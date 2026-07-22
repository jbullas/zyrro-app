'use client';

import { useEffect, useRef } from 'react';
import type { DomainProfile } from '@/lib/artifact-schemas';

type DomainRadarChartProps = {
  domainProfile: DomainProfile;
};

// Mount only once actually visible — Chart.js sizes badly against a hidden/zero-width canvas.
export default function DomainRadarChart({ domainProfile }: DomainRadarChartProps) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartInstanceRef = useRef<any>(null);

  useEffect(() => {
    const dp = domainProfile;

    const initChart = () => {
      if (!chartRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Chart = (window as any).Chart;
      if (!Chart) return;
      if (chartInstanceRef.current) chartInstanceRef.current.destroy();
      chartInstanceRef.current = new Chart(chartRef.current, {
        type: 'radar',
        data: {
          labels: ['Visioning', 'Thinking', 'Driving', 'Sensing', 'Connecting'],
          datasets: [{
            data: [dp.Visioning, dp.Thinking, dp.Driving, dp.Sensing, dp.Connecting],
            borderColor: '#C60567',
            backgroundColor: 'rgba(198,5,103,0.08)',
            pointBackgroundColor: '#C60567',
            borderWidth: 2,
            pointRadius: 4,
          }],
        },
        options: {
          responsive: true,
          scales: {
            r: {
              min: 0,
              max: 100,
              ticks: { display: false },
              grid: { color: 'rgba(0,0,0,0.06)' },
              pointLabels: { font: { size: 11, weight: '600' }, color: '#6E6E6E' },
            },
          },
          plugins: { legend: { display: false } },
        },
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).Chart) {
      initChart();
    } else {
      const existing = document.getElementById('chartjs-cdn');
      if (!existing) {
        const script = document.createElement('script');
        script.id  = 'chartjs-cdn';
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
        script.onload = initChart;
        document.head.appendChild(script);
      } else {
        existing.addEventListener('load', initChart);
      }
    }

    return () => {
      if (chartInstanceRef.current) chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    };
  }, [domainProfile]);

  return <canvas ref={chartRef} className="identity-chart-canvas" />;
}
