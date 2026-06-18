import { useEffect, useRef, useState } from "react";

export default function AudioScreen({ bundle }) {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(-1);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const queueRef = useRef([]);

  useEffect(() => () => supported && window.speechSynthesis.cancel(), [supported]);

  if (!bundle) return null;
  const guide = bundle.audio_guide;
  const lines = [
    { text: guide.intro, idx: -1 },
    ...guide.segments.map((s, i) => ({ text: s.text, idx: i, eid: s.element_id })),
    ...(guide.outro ? [{ text: guide.outro, idx: -2 }] : []),
  ];

  function speak(text, lang = guide.language === "ko" ? "ko-KR" : guide.language) {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.onend = resolve;
      u.onerror = resolve;
      window.speechSynthesis.speak(u);
    });
  }

  async function playAll() {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setPlaying(true);
    queueRef.current = lines;
    for (let i = 0; i < lines.length; i++) {
      setCurrent(lines[i].idx);
      // eslint-disable-next-line no-await-in-loop
      await speak(lines[i].text);
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        // cancelled
      }
    }
    setPlaying(false);
    setCurrent(-1);
  }

  function stop() {
    if (supported) window.speechSynthesis.cancel();
    setPlaying(false);
    setCurrent(-1);
  }

  return (
    <section aria-labelledby="au-h">
      <h2 id="au-h">음성 안내 미리보기</h2>
      {!supported && (
        <div className="alert warn">이 브라우저는 음성 합성을 지원하지 않습니다. 텍스트만 표시합니다.</div>
      )}

      <div className="audio-controls">
        <button className="btn primary" onClick={playAll} disabled={!supported || playing}>▶ 전체 재생</button>
        <button className="btn ghost" onClick={stop} disabled={!playing}>■ 정지</button>
        <span className="muted">언어: {guide.language}</span>
      </div>

      <div className="audio-line intro">
        <span className="badge">인트로</span>
        <p>{guide.intro}</p>
        {supported && <button className="btn tiny" onClick={() => speak(guide.intro)}>▶</button>}
      </div>

      <ol className="audio-segments">
        {guide.segments.map((s, i) => (
          <li key={i} className={current === i ? "speaking" : ""}>
            <span className="badge">{s.element_id || `세그먼트 ${i + 1}`}</span>
            <p>{s.text}</p>
            <span className="muted">{s.duration_hint_sec}s</span>
            {supported && <button className="btn tiny" onClick={() => speak(s.text)}>▶</button>}
          </li>
        ))}
      </ol>

      {guide.outro && (
        <div className="audio-line outro">
          <span className="badge">아웃트로</span>
          <p>{guide.outro}</p>
          {supported && <button className="btn tiny" onClick={() => speak(guide.outro)}>▶</button>}
        </div>
      )}
    </section>
  );
}
