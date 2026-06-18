export default function QaScreen({ bundle, goto }) {
  if (!bundle) return null;
  const qa = bundle.qa_report;
  const ringColor =
    qa.overall_score >= 80 ? "#1a7f40" : qa.overall_score >= 60 ? "#b8860b" : "#b00020";

  return (
    <section aria-labelledby="qa-h">
      <h2 id="qa-h">QA 리포트</h2>

      <div className="qa-summary">
        <div
          className="score-ring"
          style={{ "--c": ringColor, "--p": qa.overall_score }}
          role="img"
          aria-label={`종합 점수 ${qa.overall_score}점 / 100점`}
        >
          <span className="score-num">{qa.overall_score}</span>
          <span className="score-den">/100</span>
        </div>
        <div className={`verdict ${qa.passed ? "pass" : "fail"}`}>
          {qa.passed ? "✓ 통과 — 초급 학습자 검수 권장" : "✗ 보완 필요"}
        </div>
      </div>

      <table className="qa-table">
        <thead>
          <tr><th>평가 기준</th><th>점수</th><th>결과</th><th>코멘트</th></tr>
        </thead>
        <tbody>
          {qa.criteria.map((c, i) => (
            <tr key={i}>
              <td>{c.name}</td>
              <td className="num">{c.score}</td>
              <td>{c.passed ? <span className="ok">통과</span> : <span className="rm">미흡</span>}</td>
              <td className="muted">{c.comment}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>권장 사항</h3>
      <ul>{qa.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>

      <div className="editor-actions">
        <button className="btn ghost" onClick={() => goto("design")}>← 설계안 수정</button>
        <button className="btn primary" onClick={() => goto("export")}>Export →</button>
      </div>
    </section>
  );
}
