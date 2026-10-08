import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import type { Workout } from '@gatorgainz/types';

Chart.register(...registerables);

export default function ProgressChart({ workouts }: { workouts: Workout[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const minutesByDate = new Map<string, number>();
    for (const workout of workouts) {
      const date = workout.completedAt.slice(0, 10);
      minutesByDate.set(date, (minutesByDate.get(date) ?? 0) + workout.durationMinutes);
    }
    const dates = [...minutesByDate.keys()].sort().slice(-7);
    const chart = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: dates.map((date) =>
          new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
        ),
        datasets: [
          {
            label: 'Active minutes',
            data: dates.map((date) => minutesByDate.get(date)!),
            backgroundColor: '#238263',
            borderRadius: 6,
            maxBarThickness: 42,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Minutes' },
            ticks: { precision: 0 },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [workouts]);

  return (
    <div className="chart">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Active minutes across your last seven workout dates. Exact values are listed in workout history."
      />
    </div>
  );
}
