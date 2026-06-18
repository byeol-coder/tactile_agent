import { useRef, useState } from "react";

export default function UploadScreen({ onUpload, busy }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);

  function pick(f) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  return (
    <section aria-labelledby="up-h">
      <h2 id="up-h">이미지 업로드</h2>
      <p className="lead">
        변환할 이미지를 올리면 AI 에이전트 파이프라인이 시각 정보를 분석하고,
        DotPad 양각·음각 출력과 음성 안내로 이해할 수 있는 촉각 그래픽으로 재설계합니다.
      </p>

      <div
        className="dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0]);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        aria-label="이미지 파일 선택 또는 끌어다 놓기"
      >
        {preview ? (
          <img src={preview} alt="업로드 미리보기" className="up-preview" />
        ) : (
          <div className="dropinner">
            <div className="bigicon" aria-hidden="true">⬆</div>
            <p>클릭하거나 이미지를 끌어다 놓으세요</p>
            <p className="muted">PNG · JPG · GIF · WebP</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>

      <button
        className="btn primary"
        disabled={!file || busy}
        onClick={() => onUpload(file)}
      >
        {busy ? "분석 중…" : "촉각 그래픽으로 변환"}
      </button>
    </section>
  );
}
