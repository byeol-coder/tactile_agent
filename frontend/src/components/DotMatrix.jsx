// Renders a DotPad binary pin matrix as an SVG dot grid.
// Raised pins (1) are filled; flat cells (0) are faint guides.
export default function DotMatrix({ matrix }) {
  if (!matrix) return null;
  const { width, height, matrix: rows } = matrix;
  const step = 12;
  const r = 4;
  const dots = [];
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < width; x++) {
      const on = row[x] === "1";
      dots.push(
        <circle
          key={`${x}-${y}`}
          cx={x * step + step / 2}
          cy={y * step + step / 2}
          r={on ? r : 1.3}
          fill={on ? "#0b1f3a" : "#cfd6e0"}
        />
      );
    }
  }
  return (
    <svg
      className="dotmatrix"
      viewBox={`0 0 ${width * step} ${height * step}`}
      role="img"
      aria-label={`${width} 곱하기 ${height} 도트패드 촉각 매트릭스`}
      style={{ width: "100%", height: "auto", background: "#fff" }}
    >
      {dots}
    </svg>
  );
}
