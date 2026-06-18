import { useState, useEffect } from "react";
import { api } from "./api.js";
import UploadScreen from "./screens/UploadScreen.jsx";
import AnalysisScreen from "./screens/AnalysisScreen.jsx";
import DesignScreen from "./screens/DesignScreen.jsx";
import SvgPreviewScreen from "./screens/SvgPreviewScreen.jsx";
import DotpadScreen from "./screens/DotpadScreen.jsx";
import AudioScreen from "./screens/AudioScreen.jsx";
import QaScreen from "./screens/QaScreen.jsx";
import ExportScreen from "./screens/ExportScreen.jsx";

const SCREENS = [
  { key: "upload", label: "1. 이미지 업로드", icon: "⬆" },
  { key: "analysis", label: "2. 이미지 분석", icon: "🔍" },
  { key: "design", label: "3. 촉각 설계안", icon: "✎" },
  { key: "svg", label: "4. SVG 미리보기", icon: "▢" },
  { key: "dotpad", label: "5. DotPad 60×40", icon: "⠿" },
  { key: "audio", label: "6. 음성 안내", icon: "🔊" },
  { key: "qa", label: "7. QA 리포트", icon: "✓" },
  { key: "export", label: "8. Export", icon: "⤓" },
];

export default function App() {
  const [active, setActive] = useState("upload");
  const [bundle, setBundle] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  async function handleUpload(file) {
    setBusy(true);
    setError("");
    try {
      const res = await api.upload(file);
      setBundle(res);
      setJobId(res.job_id);
      setActive("analysis");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateSpec(spec) {
    setBusy(true);
    setError("");
    try {
      const res = await api.updateSpec(jobId, spec);
      setBundle(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const ready = !!bundle;
  const screenProps = { bundle, jobId, busy, onUpdateSpec: handleUpdateSpec, goto: setActive };

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Tactile Graphic Agent</h1>
          <p className="tagline">시각 정보를 촉각 학습 경험으로 번역하는 독립형 접근성 에이전트</p>
        </div>
        <div className="engine-badge" aria-live="polite">
          {health
            ? health.mock_mode
              ? `엔진: 목업 모드 (API 키 없음)`
              : `엔진: ${health.model}`
            : "백엔드 연결 확인 중…"}
        </div>
      </header>

      <div className="layout">
        <nav className="sidenav" aria-label="작업 단계">
          {SCREENS.map((s) => {
            const disabled = s.key !== "upload" && !ready;
            return (
              <button
                key={s.key}
                className={`navitem ${active === s.key ? "active" : ""}`}
                onClick={() => setActive(s.key)}
                disabled={disabled}
                aria-current={active === s.key ? "page" : undefined}
              >
                <span className="navicon" aria-hidden="true">{s.icon}</span>
                {s.label}
              </button>
            );
          })}
        </nav>

        <main className="content">
          {error && (
            <div className="alert error" role="alert">
              오류: {error}
            </div>
          )}
          {busy && <div className="alert info" role="status">처리 중입니다…</div>}

          {active === "upload" && <UploadScreen onUpload={handleUpload} busy={busy} />}
          {active === "analysis" && <AnalysisScreen {...screenProps} />}
          {active === "design" && <DesignScreen {...screenProps} />}
          {active === "svg" && <SvgPreviewScreen {...screenProps} />}
          {active === "dotpad" && <DotpadScreen {...screenProps} />}
          {active === "audio" && <AudioScreen {...screenProps} />}
          {active === "qa" && <QaScreen {...screenProps} />}
          {active === "export" && <ExportScreen {...screenProps} />}
        </main>
      </div>
    </div>
  );
}
