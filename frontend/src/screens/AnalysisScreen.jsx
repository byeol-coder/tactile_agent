export default function AnalysisScreen({ bundle, goto }) {
  if (!bundle) return null;
  const spec = bundle.tactile_spec;
  const a = spec.image_analysis;

  return (
    <section aria-labelledby="an-h">
      <h2 id="an-h">이미지 분석 결과</h2>

      <div className="kv-grid">
        <div><span className="k">제목</span><span className="v">{spec.title}</span></div>
        <div><span className="k">분류</span><span className="v">{spec.category}</span></div>
        <div><span className="k">장면 유형</span><span className="v">{a.scene_type}</span></div>
        <div><span className="k">복잡도</span><span className="v">{a.complexity}</span></div>
        <div><span className="k">대상 사용자</span><span className="v">{spec.target_user}</span></div>
        <div><span className="k">대상 기기</span><span className="v">{spec.target_device}</span></div>
      </div>

      <h3>요약</h3>
      <p>{a.summary}</p>

      <div className="two-col">
        <div>
          <h3>감지된 객체</h3>
          <ul>{a.detected_objects.map((o, i) => <li key={i}>{o}</li>)}</ul>
          <h3>공간 관계</h3>
          <ul>{a.spatial_relations.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </div>
        <div>
          <h3 className="ok">✓ 유지할 핵심 요소</h3>
          <ul>
            {spec.essential_elements.map((e, i) => (
              <li key={i}><strong>{e.name}</strong> — {e.reason}</li>
            ))}
          </ul>
          <h3 className="rm">✗ 제거할 요소</h3>
          <ul>
            {spec.removable_elements.map((e, i) => (
              <li key={i}><strong>{e.name}</strong> — {e.reason}</li>
            ))}
          </ul>
        </div>
      </div>

      <h3>파이프라인 단계</h3>
      <ol className="stages">
        {(bundle.stages || []).map((s, i) => (
          <li key={i}>
            <strong>{s.agent}</strong> · <span className="muted">{s.summary}</span>
          </li>
        ))}
      </ol>

      <button className="btn primary" onClick={() => goto("design")}>
        촉각 설계안 보기 →
      </button>
    </section>
  );
}
