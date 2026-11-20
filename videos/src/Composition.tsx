import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Composition,
  Easing,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type Props = {
  title: string;
  subtitle: string;
  outro: string;
};

const FPS = 30;
const FONT = "'Heebo', 'Liberation Sans', 'DejaVu Sans', sans-serif";
const BG = "#0b0d17";
const ACCENT = "#7c5cff";
const ACCENT2 = "#00d4ff";

const calculateMetadata: CalculateMetadataFunction<Props> = () => {
  return {};
};

export const MyComposition = () => {
  return (
    <Composition
      id="Videos"
      component={MyComponent}
      durationInFrames={FPS * 10}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        title: "וידאוס",
        subtitle: "סרטון שנוצר רק מקוד",
        outro: "קוד ← וידאו",
      }}
      calculateMetadata={calculateMetadata}
    />
  );
};

// Animated gradient background with drifting orbs
const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const orbs = [
    { color: ACCENT, x: 25, y: 30, r: 700, speed: 0.012 },
    { color: ACCENT2, x: 75, y: 70, r: 600, speed: 0.016 },
    { color: "#ff4d8d", x: 60, y: 20, r: 450, speed: 0.02 },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: BG, overflow: "hidden" }}>
      {orbs.map((o, i) => {
        const dx = Math.sin(frame * o.speed + i) * 8;
        const dy = Math.cos(frame * o.speed + i * 2) * 8;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${o.x + dx}%`,
              top: `${o.y + dy}%`,
              width: o.r,
              height: o.r,
              borderRadius: "50%",
              background: o.color,
              filter: "blur(160px)",
              opacity: 0.35,
              transform: "translate(-50%, -50%)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// Scene 1: code being "typed"
const CodeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const code = [
    "const video = render(<Scene />);",
    "video.fps = 30;",
    "video.export('mp4');",
  ];
  const full = code.join("\n");
  const chars = Math.floor(interpolate(frame, [5, 75], [0, full.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));
  const shown = full.slice(0, chars);
  const cursorOn = Math.floor(frame / 8) % 2 === 0;
  const out = interpolate(frame, [80, 90], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", opacity: out }}
    >
      <div
        style={{
          width: 1300,
          padding: "60px 70px",
          borderRadius: 32,
          background: "rgba(20,22,38,0.85)",
          border: "2px solid rgba(255,255,255,0.08)",
          boxShadow: "0 40px 120px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", gap: 16, marginBottom: 40 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div
              key={c}
              style={{ width: 26, height: 26, borderRadius: 13, background: c }}
            />
          ))}
        </div>
        <pre
          style={{
            margin: 0,
            fontFamily: "'Liberation Mono', 'DejaVu Sans Mono', monospace",
            fontSize: 56,
            lineHeight: 1.5,
            color: "#e6e8ff",
            direction: "ltr",
            whiteSpace: "pre-wrap",
          }}
        >
          {shown}
          <span style={{ color: ACCENT2, opacity: cursorOn ? 1 : 0 }}>▍</span>
        </pre>
      </div>
    </AbsoluteFill>
  );
};

// Scene 2: big title reveal
const TitleScene: React.FC<{ title: string; subtitle: string }> = ({
  title,
  subtitle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12, mass: 0.8 } });
  const sub = spring({ frame: frame - 18, fps, config: { damping: 200 } });
  const lineW = interpolate(frame, [10, 40], [0, 600], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const out = interpolate(frame, [110, 120], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        direction: "rtl",
        fontFamily: FONT,
        opacity: out,
      }}
    >
      <div
        style={{
          fontSize: 260,
          fontWeight: 900,
          letterSpacing: -4,
          transform: `scale(${pop})`,
          background: `linear-gradient(90deg, ${ACCENT2}, ${ACCENT}, #ff4d8d)`,
          WebkitBackgroundClip: "text",
          color: "transparent",
        }}
      >
        {title}
      </div>
      <div
        style={{
          width: lineW,
          height: 8,
          borderRadius: 4,
          background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT2})`,
          margin: "20px 0 40px",
        }}
      />
      <div
        style={{
          fontSize: 80,
          color: "#ffffff",
          fontWeight: 700,
          opacity: sub,
          transform: `translateY(${(1 - sub) * 40}px)`,
        }}
      >
        {subtitle}
      </div>
    </AbsoluteFill>
  );
};

// Scene 3: outro with orbiting shapes
const OutroScene: React.FC<{ outro: string }> = ({ outro }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14 } });
  const shapes = 8;
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONT,
        direction: "rtl",
      }}
    >
      {new Array(shapes).fill(0).map((_, i) => {
        const angle = (i / shapes) * Math.PI * 2 + frame * 0.03;
        const radius = 560 * enter;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 50,
              height: 50,
              borderRadius: i % 2 ? 25 : 10,
              background: i % 2 ? ACCENT : ACCENT2,
              transform: `translate(${Math.cos(angle) * radius}px, ${
                Math.sin(angle) * radius
              }px) rotate(${frame * 4}deg)`,
              opacity: 0.9,
            }}
          />
        );
      })}
      <div
        style={{
          fontSize: 140,
          fontWeight: 900,
          color: "white",
          transform: `scale(${enter})`,
        }}
      >
        {outro}
      </div>
    </AbsoluteFill>
  );
};

export const MyComponent: React.FC<Props> = ({ title, subtitle, outro }) => {
  return (
    <AbsoluteFill>
      <Background />
      <Sequence durationInFrames={90}>
        <CodeScene />
      </Sequence>
      <Sequence from={90} durationInFrames={120}>
        <TitleScene title={title} subtitle={subtitle} />
      </Sequence>
      <Sequence from={210}>
        <OutroScene outro={outro} />
      </Sequence>
    </AbsoluteFill>
  );
};
