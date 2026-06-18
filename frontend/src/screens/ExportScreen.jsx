import { api } from "../api.js";

const FILES = [
  { name: "tactile_spec", file: "tactile_spec.json", desc: "전체 촉각 사양 (TactileSpec)" },
  { name: "tactile_svg", file: "tactile.svg", desc: "촉각 그래픽 SVG" },
  { name: "dotpad_60x40", file: "dotpad_60x40.json", desc: "DotPad 60×40 매트릭스 + RLE" },
  { name: "dotpad_96x64", file: "dotpad_96x64.json", desc: "DotPad 96×64 매트릭스 + RLE" },
  { name: "audio_guide", file: "audio_guide.json", desc: "음성 안내 스크립트" },
  { name: "qa_report", file: "qa_report.json", desc: "QA 평가 리포트" },
];

export default function ExportScreen({ bundle, jobId }) {
  if (!bundle) return null;
  return (
    <section aria-labelledby="ex-h">
      <h2 id="ex-h">Export</h2>
      <p className="lead">생성된 모든 산출물을 개별 또는 일괄(ZIP)로 내려받을 수 있습니다.</p>

      <a className="btn primary" href={api.zipUrl(jobId)} download>
        ⤓ 전체 ZIP 다운로드
      </a>

      <ul className="export-list">
        {FILES.map((f) => (
          <li key={f.name}>
            <div>
              <strong>{f.file}</strong>
              <span className="muted"> — {f.desc}</span>
            </div>
            <a className="btn ghost" href={api.artifactUrl(jobId, f.name)} download>
              다운로드
            </a>
          </li>
        ))}
      </ul>

      <h3>tactile_spec.json 미리보기</h3>
      <pre className="codeblock small">
{JSON.stringify(bundle.tactile_spec, null, 2).slice(0, 4000)}
{JSON.stringify(bundle.tactile_spec, null, 2).length > 4000 ? "\n… (생략)" : ""}
      </pre>
    </section>
  );
}
