import {
  AbsoluteFill,
  Composition,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// Brand colors sampled from the RevenueMind logo
const PURPLE = "#6a3d9a";
const TEAL = "#2a9d8f";
const ORANGE = "#e8913a";

// Layer geometry in source-logo pixels (see public/logo/*.png, upscaled 4x)
const SRC_W = 400; // wordmark width
const ICON = { x: 124, y: 0, w: 152, h: 162 };
const TEXT = { x: 0, y: 172, w: 400, h: 62 };
const SRC_H = TEXT.y + TEXT.h;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.22, 1, 0.36, 1);

const Particles: React.FC<{ k: number }> = ({ k }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const colors = [PURPLE, TEAL, ORANGE];
  return (
    <>
      {new Array(36).fill(0).map((_, i) => {
        const seed = Math.sin(i * 91.7) * 10000;
        const rnd = seed - Math.floor(seed);
        const angle = (i / 36) * Math.PI * 2 + rnd;
        const dist = Math.max(width, height) * (0.55 + rnd * 0.3);
        const delay = rnd * 10;
        const t = interpolate(frame, [delay, delay + 38], [0, 1], {
          ...clamp,
          easing: Easing.in(Easing.cubic),
        });
        const x = Math.cos(angle) * dist * (1 - t);
        const y = Math.sin(angle) * dist * (1 - t) - 40 * k;
        const size = (14 + rnd * 22) * (k / 3);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: size,
              height: size,
              borderRadius: "50%",
              background: colors[i % 3],
              opacity: interpolate(t, [0, 0.1, 0.85, 1], [0, 0.8, 0.8, 0]),
              transform: `translate(${x - size / 2}px, ${y - size / 2}px)`,
            }}
          />
        );
      })}
    </>
  );
};

export const LogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const k = Math.min(3, (width * 0.68) / SRC_W);

  // Burst ring when the particles arrive
  const ring = interpolate(frame, [36, 62], [0, 1], { ...clamp, easing: ease });

  // Brain (left) wipes up, B (right) wipes down
  const left = interpolate(frame, [34, 64], [0, 1], { ...clamp, easing: ease });
  const right = interpolate(frame, [42, 72], [0, 1], { ...clamp, easing: ease });

  // Arrows shoot in from the left with a spring pop
  const arrows = spring({ frame: frame - 70, fps, config: { damping: 11, mass: 0.6 } });

  // Whole icon gets a tiny bounce when arrows land
  const bounce = spring({ frame: frame - 74, fps, config: { damping: 8, mass: 0.4 } });
  const iconScale = 1 + Math.sin(bounce * Math.PI) * 0.04;

  // Wordmark wipe left→right
  const text = interpolate(frame, [82, 118], [0, 1], { ...clamp, easing: ease });

  // Light sweep across the wordmark
  const shine = interpolate(frame, [126, 160], [-30, 130], clamp);

  // Gentle push-in over the whole clip
  const zoom = interpolate(frame, [0, 210], [0.97, 1.03]);

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(circle at 50% 45%, #ffffff 0%, #f3f1f8 70%, #e9e6f2 100%)",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <Particles k={k} />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 700 * (k / 3),
          height: 700 * (k / 3),
          marginLeft: (-350 * k) / 3,
          marginTop: (-350 * k) / 3 - 90 * (k / 3),
          borderRadius: "50%",
          border: `${6 * (1 - ring) * (k / 3)}px solid ${TEAL}`,
          transform: `scale(${ring})`,
          opacity: 1 - ring,
        }}
      />
      <div
        style={{
          position: "relative",
          width: SRC_W * k,
          height: SRC_H * k,
          transform: `scale(${zoom})`,
        }}
      >
        {/* Icon */}
        <div
          style={{
            position: "absolute",
            left: ICON.x * k,
            top: ICON.y * k,
            width: ICON.w * k,
            height: ICON.h * k,
            transform: `scale(${iconScale})`,
          }}
        >
          <Img
            src={staticFile("logo/left.png")}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              clipPath: `inset(${(1 - left) * 100}% 0 0 0)`,
              transform: `translateX(${(1 - left) * -30 * k}px)`,
            }}
          />
          <Img
            src={staticFile("logo/right.png")}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              clipPath: `inset(0 0 ${(1 - right) * 100}% 0)`,
              transform: `translateX(${(1 - right) * 30 * k}px)`,
            }}
          />
          <Img
            src={staticFile("logo/arrows.png")}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: Math.min(1, arrows * 2),
              transform: `translateX(${(1 - arrows) * -25 * k}px) scale(${0.6 + arrows * 0.4})`,
            }}
          />
        </div>

        {/* Wordmark */}
        <div
          style={{
            position: "absolute",
            left: TEXT.x * k,
            top: TEXT.y * k,
            width: TEXT.w * k,
            height: TEXT.h * k,
            clipPath: `inset(0 ${(1 - text) * 100}% 0 0)`,
            transform: `translateY(${(1 - text) * 12 * k}px)`,
            opacity: interpolate(text, [0, 0.2], [0, 1], clamp),
          }}
        >
          <Img
            src={staticFile("logo/text.png")}
            style={{ width: "100%", height: "100%" }}
          />
          {/* Shine, masked to the letters */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(105deg, transparent ${shine - 12}%, rgba(255,255,255,0.85) ${shine}%, transparent ${shine + 12}%)`,
              WebkitMaskImage: `url(${staticFile("logo/text.png")})`,
              WebkitMaskSize: "100% 100%",
              maskImage: `url(${staticFile("logo/text.png")})`,
              maskSize: "100% 100%",
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const LogoCompositions: React.FC = () => {
  return (
    <>
      <Composition
        id="LogoReveal"
        component={LogoReveal}
        durationInFrames={210}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="LogoRevealVertical"
        component={LogoReveal}
        durationInFrames={210}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
