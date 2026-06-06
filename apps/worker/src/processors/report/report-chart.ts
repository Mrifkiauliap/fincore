/**
 * QuickChart.io URL builder for pie charts.
 */
export function buildChartUrl(
  data: { label: string; value: number }[],
  title: string,
): string {
  const labels = data.map((d) => d.label);
  const values = data.map((d) => d.value);

  const colors = [
    "#6366f1",
    "#f59e0b",
    "#10b981",
    "#ef4444",
    "#3b82f6",
    "#ec4899",
    "#8b5cf6",
    "#14b8a6",
  ];

  const config = {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors.slice(0, data.length),
          borderColor: "#1f2937",
          borderWidth: 2,
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: title,
          color: "#f9fafb",
          font: { size: 16, weight: "bold" },
        },
        legend: {
          labels: { color: "#f9fafb", font: { size: 12 } },
        },
      },
      layout: { padding: 10 },
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?c=${encoded}&backgroundColor=%231f2937&width=600&height=400`;
}
