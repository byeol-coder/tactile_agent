import { useEffect, useState } from "react";
import { api } from "../api.js";
import DotMatrix from "../components/DotMatrix.jsx";

// Screen 3 + Human Review Editor (module 7).
export default function DesignScreen({ bundle, jobId, busy, onUpdateSpec }) {
  const [spec, setSpec] = useState(bundle?.tactile_spec);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setSpec(bundle?.tactile_spec);
    setDirty(false);
  }, [bundle]);

  if (!spec) return null;
  const prims = spec.tactile_design.primitives;

  function mutate(updater) {
    const next = structuredClone(spec);
    updater(next);
    setSpec(next);
    setDirty(true);
  }

  const setField = (i, key, val) =>
    mutate((s) => { s.tactile_design.primitives[i][key] = val; });

  const nudge = (i, dx, dy) =>
    mutate((s) => {
      const p = s.tactile_design.primitives[i];
      const clamp = (v) => Math.max(0.05, Math.min(0.95, +(v + 0).toFixed(3)));
      if (p.center) p.center = [clamp(p.center[0] + dx), clamp(p.center[1] + dy)];
      if (p.points?.length)
        p.points = p.points.map(([x, y]) => [clamp(x + dx), clamp(y + dy)]);
    });

  const remove = (i) =>
    mutate((s) => { s.tactile_design.primitives.splice(i, 1); });

  return (
    <section aria-labelledby="de-h">
      <h2 id="de-h">촉각 설계안 · 휴먼 리뷰 에디터</h2>
      <p className="lead">
        AI가 재설계한 촉각 요소를 검토하고 직접 수정하세요. 변경 후 저장하면
        SVG·DotPad·QA가 다시 렌더링·재검수됩니다.
      </p>

      {spec.split_required && (
        <div className="alert warn" role="note">
          ⚠ 분할 권장: {spec.split_reason || "복잡도가 높아 여러 촉각 슬라이드로 나누는 것이 좋습니다."}
        </div>
      )}

      <div className="two-col">
        <div>
          <h3>설계 미리보기 (60×40)</h3>
          <DotMatrix matrix={bundle.dotpad_60x40} />
          <h3>설계 노트</h3>
          <ul>{spec.tactile_design.design_notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>

        <div>
          <h3>촉각 요소 ({prims.length})</h3>
          <div className="prim-list">
            {prims.map((p, i) => (
              <div className="prim-card" key={p.id}>
                <div className="prim-head">
                  <strong>{p.id}</strong>
                  <span className="muted">{p.kind} · {p.role || "—"}</span>
                  <button className="btn tiny danger" onClick={() => remove(i)} aria-label={`${p.id} 삭제`}>삭제</button>
                </div>
                <label className="fld">
                  레이블
                  <input value={p.label || ""} onChange={(e) => setField(i, "label", e.target.value)} />
                </label>
                <div className="fld-row">
                  <label className="fld">
                    촉감
                    <select value={p.level} onChange={(e) => setField(i, "level", e.target.value)}>
                      <option value="raised">양각</option>
                      <option value="recessed">음각</option>
                    </select>
                  </label>
                  <label className="fld">
                    선 스타일
                    <select value={p.line_style} onChange={(e) => setField(i, "line_style", e.target.value)}>
                      <option value="solid">실선</option>
                      <option value="dashed">파선</option>
                      <option value="dotted">점선</option>
                    </select>
                  </label>
                </div>
                <div className="nudge" role="group" aria-label={`${p.id} 위치 이동`}>
                  위치
                  <button className="btn tiny" onClick={() => nudge(i, 0, -0.05)} aria-label="위로">↑</button>
                  <button className="btn tiny" onClick={() => nudge(i, 0, 0.05)} aria-label="아래로">↓</button>
                  <button className="btn tiny" onClick={() => nudge(i, -0.05, 0)} aria-label="왼쪽">←</button>
                  <button className="btn tiny" onClick={() => nudge(i, 0.05, 0)} aria-label="오른쪽">→</button>
                </div>
              </div>
            ))}
          </div>

          <div className="editor-actions">
            <button className="btn primary" disabled={!dirty || busy} onClick={() => onUpdateSpec(spec)}>
              {busy ? "재검수 중…" : "저장 · 재렌더 · 재검수"}
            </button>
            {dirty && <span className="muted">변경 사항이 저장되지 않았습니다.</span>}
          </div>
        </div>
      </div>

      <h3>탐색 순서</h3>
      <ol className="explore">
        {spec.exploration_order.map((s) => (
          <li key={s.order}><strong>[{s.element_id}]</strong> {s.instruction}</li>
        ))}
      </ol>
    </section>
  );
}
