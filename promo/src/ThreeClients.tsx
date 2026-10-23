import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const COLORS = {
  bg: "#0f1419",
  panel: "#1a2332",
  border: "#2d3a4d",
  text: "#e8eef5",
  muted: "#8b9bb0",
  accent: "#3d9a7a",
  accentSoft: "rgba(61, 154, 122, 0.22)",
  line: "#4a6b5e",
  cursor: "#7eb8ff",
  codex: "#c9a66b",
  workbuddy: "#9b8fd9",
};

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

const fadeSlide = (
  frame: number,
  start: number,
  dur: number,
): { opacity: number; translateY: number } => ({
  opacity: interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  }),
  translateY: interpolate(frame, [start, start + dur], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  }),
});

/** Soft exit so GIF loops without a hard cut. */
const SceneFade: React.FC<{
  children: React.ReactNode;
  outStart?: number;
}> = ({ children, outStart = 9999 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [outStart, outStart + 10], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const title = fadeSlide(frame, 0, 16);
  const sub = fadeSlide(frame, 8, 16);
  const pipe = fadeSlide(frame, 20, 14);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        fontFamily:
          'ui-sans-serif, system-ui, "Segoe UI", Helvetica, Arial, sans-serif',
      }}
    >
      <div
        style={{
          opacity: title.opacity,
          translate: `0px ${title.translateY}px`,
          fontSize: 68,
          fontWeight: 700,
          color: COLORS.text,
          letterSpacing: "-0.02em",
        }}
      >
        workspace-kb
      </div>
      <div
        style={{
          marginTop: 14,
          opacity: sub.opacity,
          translate: `0px ${sub.translateY}px`,
          fontSize: 30,
          color: COLORS.muted,
        }}
      >
        One engine · three clients
      </div>
      <div
        style={{
          marginTop: 28,
          opacity: pipe.opacity,
          translate: `0px ${pipe.translateY}px`,
          fontSize: 20,
          letterSpacing: "0.06em",
          color: COLORS.accent,
          fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
        }}
      >
        up → install-clients → reload MCP
      </div>
    </AbsoluteFill>
  );
};

const CmdLine: React.FC<{
  text: string;
  start: number;
  step: string;
  accent?: boolean;
}> = ({ text, start, step, accent }) => {
  const frame = useCurrentFrame();
  const anim = fadeSlide(frame, start, 12);
  const reveal = interpolate(frame, [start, start + 18], [0, text.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shown = text.slice(0, Math.floor(reveal));

  return (
    <div
      style={{
        opacity: anim.opacity,
        translate: `0px ${anim.translateY}px`,
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: 680,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: COLORS.accentSoft,
          border: `1px solid ${COLORS.accent}`,
          color: COLORS.accent,
          fontSize: 18,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontFamily:
            'ui-sans-serif, system-ui, "Segoe UI", Helvetica, Arial, sans-serif',
        }}
      >
        {step}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
          fontSize: 28,
          color: accent ? COLORS.accent : COLORS.text,
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 10,
          padding: "16px 22px",
          boxSizing: "border-box",
        }}
      >
        <span style={{ color: COLORS.accent, flexShrink: 0 }}>$</span>
        <span>
          {shown}
          <span
            style={{
              opacity: frame % 20 < 12 ? 1 : 0,
              color: COLORS.muted,
            }}
          >
            ▌
          </span>
        </span>
      </div>
    </div>
  );
};

const CommandsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const label = fadeSlide(frame, 0, 12);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        gap: 20,
        fontFamily:
          'ui-sans-serif, system-ui, "Segoe UI", Helvetica, Arial, sans-serif',
      }}
    >
      <div
        style={{
          opacity: label.opacity,
          translate: `0px ${label.translateY}px`,
          fontSize: 22,
          color: COLORS.muted,
          marginBottom: 6,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        Start once · wire once
      </div>
      <CmdLine text="npx workspace-kb up --port 8787" start={4} step="1" />
      <CmdLine
        text="npx workspace-kb install-clients"
        start={26}
        step="2"
        accent
      />
    </AbsoluteFill>
  );
};

const ClientCard: React.FC<{
  name: string;
  color: string;
  x: number;
  y: number;
  appearAt: number;
  reloadAt: number;
}> = ({ name, color, x, y, appearAt, reloadAt }) => {
  const frame = useCurrentFrame();
  const appear = fadeSlide(frame, appearAt, 14);
  const reloadOpacity = interpolate(
    frame,
    [reloadAt, reloadAt + 10, reloadAt + 40, reloadAt + 52],
    [0, 1, 1, 0.9],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: easeOut,
    },
  );

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 210,
        opacity: appear.opacity,
        translate: `0px ${appear.translateY}px`,
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: "18px 18px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 11,
            height: 11,
            borderRadius: 999,
            background: color,
          }}
        />
        <div
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: COLORS.text,
            fontFamily:
              'ui-sans-serif, system-ui, "Segoe UI", Helvetica, Arial, sans-serif',
          }}
        >
          {name}
        </div>
      </div>
      <div
        style={{
          opacity: reloadOpacity,
          fontSize: 16,
          color: COLORS.accent,
          fontFamily: 'ui-monospace, Consolas, monospace',
        }}
      >
        3 · reload MCP ✓
      </div>
    </div>
  );
};

const HubScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const hub = fadeSlide(frame, 0, 16);
  const lineProgress = interpolate(frame, [16, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  const pulse = interpolate(frame, [68, 88, 108], [0.35, 1, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const footer = fadeSlide(frame, 100, 14);

  const hubW = 260;
  const hubH = 108;
  const hubX = (width - hubW) / 2;
  const hubY = height / 2 - 28;
  const hubCx = hubX + hubW / 2;
  const hubCy = hubY + hubH / 2;

  const cardW = 210;
  const cardH = 88;
  const clients = [
    {
      name: "Cursor",
      color: COLORS.cursor,
      x: 40,
      y: 72,
      appearAt: 20,
      reloadAt: 72,
    },
    {
      name: "Codex",
      color: COLORS.codex,
      x: width - 40 - cardW,
      y: 72,
      appearAt: 28,
      reloadAt: 80,
    },
    {
      name: "WorkBuddy",
      color: COLORS.workbuddy,
      x: (width - cardW) / 2,
      y: height - 128,
      appearAt: 36,
      reloadAt: 88,
    },
  ];

  return (
    <AbsoluteFill>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0 }}
      >
        {clients.map((c) => {
          const tipX = c.x + cardW / 2;
          const tipY = c.y + cardH / 2;
          return (
            <line
              key={c.name}
              x1={hubCx}
              y1={hubCy}
              x2={hubCx + (tipX - hubCx) * lineProgress}
              y2={hubCy + (tipY - hubCy) * lineProgress}
              stroke={COLORS.line}
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={0.9}
            />
          );
        })}
      </svg>

      <div
        style={{
          position: "absolute",
          left: hubX,
          top: hubY,
          width: hubW,
          height: hubH,
          opacity: hub.opacity,
          translate: `0px ${hub.translateY}px`,
          background: COLORS.accentSoft,
          border: `1px solid ${COLORS.accent}`,
          borderRadius: 14,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 6,
          boxShadow: `0 0 ${28 * pulse}px ${COLORS.accentSoft}`,
        }}
      >
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: COLORS.text,
            fontFamily:
              'ui-sans-serif, system-ui, "Segoe UI", Helvetica, Arial, sans-serif',
          }}
        >
          MCP engine
        </div>
        <div
          style={{
            fontSize: 16,
            color: COLORS.accent,
            fontFamily: 'ui-monospace, Consolas, monospace',
          }}
        >
          /mcp · shared index + memory
        </div>
      </div>

      {clients.map((c) => (
        <ClientCard
          key={c.name}
          name={c.name}
          color={c.color}
          x={c.x}
          y={c.y}
          appearAt={c.appearAt}
          reloadAt={c.reloadAt}
        />
      ))}

      <div
        style={{
          position: "absolute",
          top: 24,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: interpolate(frame, [6, 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          fontSize: 22,
          color: COLORS.muted,
          fontFamily:
            'ui-sans-serif, system-ui, "Segoe UI", Helvetica, Arial, sans-serif',
        }}
      >
        Same HTTP URL · kb_search & kb_memory_*
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 22,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: footer.opacity,
          translate: `0px ${footer.translateY}px`,
          fontSize: 18,
          color: COLORS.accent,
          letterSpacing: "0.04em",
          fontFamily: 'ui-monospace, Consolas, monospace',
        }}
      >
        one engine · one index · three clients
      </div>
    </AbsoluteFill>
  );
};

export const ThreeClients: React.FC = () => {
  const { fps } = useVideoConfig();
  const titleDur = Math.round(2.0 * fps);
  const cmdFrom = Math.round(1.75 * fps);
  const cmdDur = Math.round(2.35 * fps);
  const hubFrom = Math.round(3.9 * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <Sequence durationInFrames={titleDur} name="Title">
        <SceneFade outStart={titleDur - 12}>
          <TitleScene />
        </SceneFade>
      </Sequence>
      <Sequence from={cmdFrom} durationInFrames={cmdDur} name="Commands">
        <SceneFade outStart={cmdDur - 12}>
          <CommandsScene />
        </SceneFade>
      </Sequence>
      <Sequence from={hubFrom} name="Hub">
        <HubScene />
      </Sequence>
    </AbsoluteFill>
  );
};
