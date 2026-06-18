export default function SvgPreviewScreen({ bundle }) {
  if (!bundle) return null;
  return (
    <section aria-labelledby="sv-h">
      <h2 id="sv-h">SVG 미리보기</h2>
      <p className="lead">
        촉각 그래픽의 시각 프록시입니다. 양각은 굵은 검은 실선, 음각은 회색 파선으로
        표현되며 색·그림자·배경은 모두 제거되어 구조만 남습니다.
      </p>
      <div
        className="svg-frame"
        // SVG is generated server-side from the same scene graph as the DotPad matrix.
        dangerouslySetInnerHTML={{ __html: bundle.tactile_svg }}
      />
      <div className="legend">
        <span><span className="swatch raised" /> 양각 (raised)</span>
        <span><span className="swatch recessed" /> 음각 (recessed)</span>
      </div>
    </section>
  );
}
