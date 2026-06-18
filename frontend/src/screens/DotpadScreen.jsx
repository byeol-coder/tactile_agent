import { useState } from "react";
import DotMatrix from "../components/DotMatrix.jsx";

export default function DotpadScreen({ bundle }) {
  const [size, setSize] = useState("60x40");
  const [showRle, setShowRle] = useState(false);
  if (!bundle) return null;
  const m = size === "60x40" ? bundle.dotpad_60x40 : bundle.dotpad_96x64;

  return (
    <section aria-labelledby="dp-h">
      <h2 id="dp-h">DotPad 촉각 매트릭스 미리보기</h2>

      <div className="seg" role="tablist" aria-label="해상도 선택">
        {["60x40", "96x64"].map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={size === s}
            className={`seg-btn ${size === s ? "active" : ""}`}
            onClick={() => setSize(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="kv-grid compact">
        <div><span className="k">기기</span><span className="v">{m.device}</span></div>
        <div><span className="k">셀 수</span><span className="v">{m.cell_count}</span></div>
        <div><span className="k">양각 점</span><span className="v">{m.dot_count}</span></div>
        <div><span className="k">점 밀도</span><span className="v">{(m.density * 100).toFixed(1)}%</span></div>
      </div>

      <DotMatrix matrix={m} />

      <div className="rle-toggle">
        <button className="btn ghost" onClick={() => setShowRle((v) => !v)}>
          {showRle ? "RLE 인코딩 숨기기" : "RLE 인코딩 보기"}
        </button>
        <span className="muted">{m.rle.length} 런(run)</span>
      </div>
      {showRle && (
        <pre className="codeblock" aria-label="RLE 인코딩 (값, 개수) 쌍">
{JSON.stringify(m.rle.slice(0, 200))}
{m.rle.length > 200 ? `\n… (+${m.rle.length - 200} runs)` : ""}
        </pre>
      )}
    </section>
  );
}
