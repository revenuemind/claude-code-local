import {
  AbsoluteFill,
  Audio,
  Composition,
  Easing,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const FPS = 30;
const s = (sec: number) => Math.round(sec * FPS);

const BG = "#0e0b1a";
const PURPLE = "#8b5cf6";
const TEAL = "#2dd4bf";
const ORANGE = "#f59e0b";
const FONT = "'Liberation Sans', 'DejaVu Sans', sans-serif";
const MONO = "'Liberation Mono', 'DejaVu Sans Mono', monospace";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.22, 1, 0.36, 1);

// Caption timings measured from the narration's pauses (seconds)
const CAPTIONS: [number, number, string][] = [
  [0.0, 4.15, "איך יוצרים סרטון בלי מצלמה, בלי צילום, ובלי תוכנת עריכה?"],
  [4.6, 5.92, "פשוט כותבים אותו בקוד."],
  [6.35, 7.15, "שלב ראשון:"],
  [7.5, 11.29, "פותחים פרויקט Remotion – ספרייה שהופכת קוד React לווידאו."],
  [11.71, 12.43, "שלב שני:"],
  [12.88, 14.47, "כל סצנה היא רכיב בקוד."],
  [14.94, 18.26, "טקסט, צבעים ותנועה מחושבים לפי מספר הפריים."],
  [18.77, 19.58, "שלב שלישי:"],
  [20.06, 21.59, "את הלוגו פירקתי לשכבות –"],
  [21.9, 24.12, "המוח, האות B, והחיצים –"],
  [24.52, 26.34, "כדי שכל חלק יזוז בנפרד."],
  [26.82, 27.63, "שלב רביעי:"],
  [28.11, 30.99, "מוסיפים קריינות, מסנכרנים, ומרנדרים."],
  [31.51, 34.31, "30 פריימים בשנייה, ישר לקובץ וידאו."],
  [34.84, 36.38, "והסרטון שאתם רואים עכשיו?"],
  [36.87, 38.38, "גם הוא נוצר בדיוק ככה."],
  [38.79, 41, "רק מקוד."],
];

const SCENES = {
  intro: [0, 6.3],
  step1: [6.3, 11.7],
  step2: [11.7, 18.75],
  step3: [18.75, 26.8],
  step4: [26.8, 34.8],
  outro: [34.8, 41],
} as const;

const fadeInOut = (frame: number, dur: number) =>
  interpolate(frame, [0, 8, dur - 8, dur], [0, 1, 1, 0], clamp);

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const orbs = [
    { c: PURPLE, x: 20, y: 20, r: 900 },
    { c: TEAL, x: 85, y: 75, r: 800 },
    { c: ORANGE, x: 70, y: 10, r: 500 },
  ];
  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden" }}>
      {orbs.map((o, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${o.x + Math.sin(frame * 0.01 + i) * 8}%`,
            top: `${o.y + Math.cos(frame * 0.013 + i * 2) * 6}%`,
            width: o.r,
            height: o.r,
            borderRadius: "50%",
            background: o.c,
            filter: "blur(200px)",
            opacity: 0.28,
            transform: "translate(-50%,-50%)",
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

const StepBadge: React.FC<{ n: number; title: string }> = ({ n, title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 14 } });
  return (
    <div
      style={{
        position: "absolute",
        top: 260,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        direction: "rtl",
        fontFamily: FONT,
        transform: `translateY(${(1 - p) * -60}px)`,
        opacity: p,
      }}
    >
      <div
        style={{
          padding: "14px 44px",
          borderRadius: 999,
          background: `linear-gradient(90deg, ${PURPLE}, ${TEAL})`,
          color: "white",
          fontSize: 44,
          fontWeight: 700,
        }}
      >
        שלב {n}
      </div>
      <div style={{ color: "white", fontSize: 84, fontWeight: 800, textAlign: "center", padding: "0 60px" }}>
        {title}
      </div>
    </div>
  );
};

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      background: "rgba(22,18,40,0.85)",
      border: "2px solid rgba(255,255,255,0.1)",
      borderRadius: 36,
      padding: "40px 48px",
      boxShadow: "0 40px 120px rgba(0,0,0,0.5)",
      ...style,
    }}
  >
    {children}
  </div>
);

// --- Scenes ---------------------------------------------------------------

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = ["בלי מצלמה", "בלי צילום", "בלי עריכה"];
  const starts = [s(0.4), s(1.7), s(2.8)];
  const code = spring({ frame: frame - s(4.6), fps, config: { damping: 10 } });
  const listOut = interpolate(frame, [s(4.3), s(4.7)], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", direction: "rtl", fontFamily: FONT }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 50, opacity: listOut }}>
        {items.map((t, i) => {
          const p = spring({ frame: frame - starts[i], fps, config: { damping: 13 } });
          const strike = interpolate(frame, [starts[i] + 10, starts[i] + 22], [0, 100], clamp);
          return (
            <div
              key={t}
              style={{
                position: "relative",
                fontSize: 110,
                fontWeight: 800,
                color: "white",
                opacity: p,
                transform: `translateX(${(1 - p) * 120}px)`,
              }}
            >
              ✕ {t}
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "52%",
                  height: 12,
                  width: `${strike}%`,
                  background: ORANGE,
                  borderRadius: 6,
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          transform: `scale(${code})`,
          opacity: Math.min(1, code * 2),
        }}
      >
        <div style={{ fontFamily: MONO, fontSize: 260, fontWeight: 700, color: TEAL, direction: "ltr" }}>
          {"</>"}
        </div>
        <div
          style={{
            fontSize: 140,
            fontWeight: 900,
            background: `linear-gradient(90deg, ${TEAL}, ${PURPLE})`,
            WebkitBackgroundClip: "text",
            color: "transparent",
          }}
        >
          רק קוד
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Step1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cmd = "npx create-video";
  const typed = cmd.slice(0, Math.floor(interpolate(frame, [s(1.2), s(2.4)], [0, cmd.length], clamp)));
  const flow = (d: number) => spring({ frame: frame - s(d), fps, config: { damping: 14 } });
  const boxes = [
    { label: "React", color: TEAL, d: 2.6 },
    { label: "Remotion", color: PURPLE, d: 3.2 },
    { label: "MP4", color: ORANGE, d: 3.8 },
  ];
  return (
    <AbsoluteFill style={{ alignItems: "center", fontFamily: FONT }}>
      <StepBadge n={1} title="פרויקט Remotion" />
      <div style={{ position: "absolute", top: 720, display: "flex", flexDirection: "column", alignItems: "center", gap: 70 }}>
        <Card style={{ width: 880 }}>
          <div style={{ fontFamily: MONO, fontSize: 54, color: "#e6e8ff", direction: "ltr" }}>
            <span style={{ color: TEAL }}>$ </span>
            {typed}
            <span style={{ opacity: Math.floor(frame / 8) % 2 ? 0 : 1, color: TEAL }}>▍</span>
          </div>
        </Card>
        <div style={{ display: "flex", alignItems: "center", gap: 20, direction: "ltr" }}>
          {boxes.map((b, i) => {
            const p = flow(b.d);
            return (
              <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 20 }}>
                {i > 0 && (
                  <div style={{ fontSize: 60, color: "rgba(255,255,255,0.6)", opacity: p }}>→</div>
                )}
                <div
                  style={{
                    padding: "28px 34px",
                    borderRadius: 24,
                    border: `4px solid ${b.color}`,
                    color: "white",
                    fontSize: 46,
                    fontWeight: 700,
                    transform: `scale(${p})`,
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  {b.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Step2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - s(1.0));
  const loop = local % 60;
  const x = interpolate(loop, [0, 30, 60], [0, 1, 0], { easing: Easing.inOut(Easing.cubic) });
  const card = spring({ frame: frame - s(0.8), fps, config: { damping: 14 } });
  const demo = spring({ frame: frame - s(3.2), fps, config: { damping: 14 } });
  const lines = [
    ["const ", "frame", " = useCurrentFrame();"],
    ["const ", "x", " = interpolate(frame,"],
    ["  [0, 30], [0, 600]);"],
  ];
  return (
    <AbsoluteFill style={{ alignItems: "center", fontFamily: FONT }}>
      <StepBadge n={2} title="כל סצנה = רכיב" />
      <div style={{ position: "absolute", top: 680, display: "flex", flexDirection: "column", alignItems: "center", gap: 60 }}>
        <Card style={{ width: 920, transform: `scale(${card})`, opacity: card }}>
          <pre style={{ margin: 0, fontFamily: MONO, fontSize: 42, lineHeight: 1.6, color: "#e6e8ff", direction: "ltr" }}>
            {lines.map((l, i) => (
              <div key={i}>
                <span style={{ color: PURPLE }}>{l[0]}</span>
                <span style={{ color: TEAL }}>{l[1] ?? ""}</span>
                {l[2] ?? ""}
              </div>
            ))}
          </pre>
        </Card>
        <Card style={{ width: 920, opacity: demo, transform: `translateY(${(1 - demo) * 60}px)` }}>
          <div style={{ fontFamily: MONO, fontSize: 40, color: "rgba(255,255,255,0.7)", direction: "ltr", marginBottom: 30 }}>
            frame: <span style={{ color: ORANGE }}>{String(Math.floor(loop)).padStart(2, "0")}</span>
          </div>
          <div style={{ position: "relative", height: 120, direction: "ltr" }}>
            <div
              style={{
                position: "absolute",
                left: x * 700,
                width: 120,
                height: 120,
                borderRadius: 28,
                background: `linear-gradient(135deg, ${PURPLE}, ${TEAL})`,
                transform: `rotate(${x * 180}deg)`,
              }}
            />
          </div>
        </Card>
      </div>
    </AbsoluteFill>
  );
};

const Step3: React.FC = () => {
  const frame = useCurrentFrame();
  // explode apart at ~2s, hold, reassemble at ~5.6s
  const apart = interpolate(frame, [s(1.6), s(2.6), s(5.6), s(6.6)], [0, 1, 1, 0], { ...clamp, easing: ease });
  const show = interpolate(frame, [s(0.6), s(1.4)], [0, 1], clamp);
  const W = 152 * 3;
  const H = 162 * 3;
  const layer = (src: string, dx: number, dy: number, label: string, color: string, delay: number) => {
    const lab = interpolate(frame, [s(delay), s(delay + 0.4), s(5.4), s(5.8)], [0, 1, 1, 0], clamp);
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${dx * apart}px, ${dy * apart}px) rotate(${dx * apart * 0.02}deg)`,
        }}
      >
        <Img src={staticFile(src)} style={{ width: "100%", height: "100%" }} />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: dy < 0 ? -90 : H + 10,
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            padding: "10px 26px",
            borderRadius: 999,
            border: `3px solid ${color}`,
            color: "#2a2540",
            background: "white",
            fontSize: 40,
            fontWeight: 700,
            direction: "rtl",
            opacity: lab,
          }}
        >
          {label}
        </div>
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ alignItems: "center", fontFamily: FONT }}>
      <StepBadge n={3} title="פירוק לשכבות" />
      <div
        style={{
          position: "absolute",
          top: 560,
          left: 60,
          width: 960,
          height: 1000,
          borderRadius: 48,
          background: "linear-gradient(180deg, #ffffff, #f1eef8)",
          boxShadow: `0 0 120px ${PURPLE}55`,
          opacity: show,
        }}
      />
      <div style={{ position: "absolute", top: 900, left: (1080 - W) / 2, width: W, height: H, opacity: show }}>
        {layer("logo/left.png", -200, 40, "המוח", PURPLE, 2.2)}
        {layer("logo/right.png", 200, 40, "האות B", TEAL, 3.2)}
        {layer("logo/arrows.png", 0, -230, "החיצים", ORANGE, 4.2)}
      </div>
    </AbsoluteFill>
  );
};

const Step4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const wave = spring({ frame: frame - s(1.0), fps, config: { damping: 14 } });
  const progress = interpolate(frame, [s(3.5), s(7.2)], [0, 100], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const done = spring({ frame: frame - s(7.2), fps, config: { damping: 9 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", fontFamily: FONT }}>
      <StepBadge n={4} title="קריינות ורינדור" />
      <div style={{ position: "absolute", top: 720, display: "flex", flexDirection: "column", alignItems: "center", gap: 60 }}>
        <Card style={{ width: 920, height: 260, display: "flex", alignItems: "center", gap: 10, opacity: wave, direction: "ltr" }}>
          {new Array(40).fill(0).map((_, i) => {
            const h = 30 + Math.abs(Math.sin(i * 0.7 + frame * 0.25) * Math.cos(i * 0.31 + frame * 0.11)) * 150 * wave;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: h,
                  borderRadius: 6,
                  background: i % 3 === 0 ? ORANGE : i % 2 ? TEAL : PURPLE,
                }}
              />
            );
          })}
        </Card>
        <Card style={{ width: 920 }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "white", fontSize: 44, fontFamily: MONO, direction: "ltr", marginBottom: 26 }}>
            <span>Rendering… 30 FPS</span>
            <span style={{ color: TEAL }}>{Math.round(progress)}%</span>
          </div>
          <div style={{ height: 30, borderRadius: 15, background: "rgba(255,255,255,0.1)", overflow: "hidden", direction: "ltr" }}>
            <div style={{ width: `${progress}%`, height: "100%", background: `linear-gradient(90deg, ${PURPLE}, ${TEAL})` }} />
          </div>
        </Card>
        <div
          style={{
            fontSize: 90,
            fontWeight: 900,
            color: "white",
            transform: `scale(${done})`,
            fontFamily: MONO,
          }}
        >
          ✓ video.mp4
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const q = spring({ frame, fps, config: { damping: 14 } });
  const logo = spring({ frame: frame - s(1.9), fps, config: { damping: 12 } });
  const final = spring({ frame: frame - s(4.0), fps, config: { damping: 10 } });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", fontFamily: FONT, direction: "rtl" }}>
      <div style={{ position: "absolute", top: 300, fontSize: 80, fontWeight: 800, color: "white", opacity: q, textAlign: "center" }}>
        והסרטון הזה?
      </div>
      <div
        style={{
          width: 760,
          padding: "40px 60px",
          borderRadius: 48,
          background: "white",
          transform: `scale(${logo})`,
          boxShadow: `0 0 120px ${PURPLE}88`,
        }}
      >
        <div style={{ height: 300, overflow: "hidden" }}>
          <Img src={staticFile("logo/original.png")} style={{ width: "100%", display: "block", marginTop: -170 }} />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 440,
          fontSize: 130,
          fontWeight: 900,
          transform: `scale(${final})`,
          background: `linear-gradient(90deg, ${TEAL}, ${PURPLE}, ${ORANGE})`,
          WebkitBackgroundClip: "text",
          color: "transparent",
        }}
      >
        רק מקוד.
      </div>
    </AbsoluteFill>
  );
};

const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cap = CAPTIONS.find(([a, b]) => t >= a && t < b + 0.25);
  if (!cap) return null;
  const local = frame - s(cap[0]);
  const p = interpolate(local, [0, 5], [0, 1], clamp);
  return (
    <div
      style={{
        position: "absolute",
        bottom: 170,
        left: 70,
        right: 70,
        display: "flex",
        justifyContent: "center",
        direction: "rtl",
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          background: "rgba(0,0,0,0.6)",
          color: "white",
          fontSize: 54,
          fontWeight: 700,
          lineHeight: 1.35,
          padding: "20px 36px",
          borderRadius: 24,
          textAlign: "center",
          opacity: p,
          transform: `translateY(${(1 - p) * 16}px)`,
        }}
      >
        {cap[2]}
      </div>
    </div>
  );
};

export const Explainer: React.FC = () => {
  const seq = (key: keyof typeof SCENES, C: React.FC) => {
    const [a, b] = SCENES[key];
    const dur = s(b) - s(a);
    return (
      <Sequence key={key} from={s(a)} durationInFrames={dur}>
        <FadeWrap dur={dur}>
          <C />
        </FadeWrap>
      </Sequence>
    );
  };
  return (
    <AbsoluteFill>
      <Background />
      {seq("intro", Intro)}
      {seq("step1", Step1)}
      {seq("step2", Step2)}
      {seq("step3", Step3)}
      {seq("step4", Step4)}
      {seq("outro", Outro)}
      <Captions />
      <Audio src={staticFile("explainer/narration.mp3")} />
    </AbsoluteFill>
  );
};

const FadeWrap: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: fadeInOut(frame, dur) }}>{children}</AbsoluteFill>;
};

export const ExplainerComposition: React.FC = () => (
  <Composition
    id="Explainer"
    component={Explainer}
    durationInFrames={s(41)}
    fps={FPS}
    width={1080}
    height={1920}
  />
);
