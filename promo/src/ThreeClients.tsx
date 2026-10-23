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
  translateY: interpolate(frame, [start, start + dur], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  }),
});

const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const title = fadeSlide(frame, 0, 18);
  const sub = fadeSlide(frame, 10, 18);

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
          fontSize: 64,
          fontWeight: 700,
          color: COLORS.text,
          letterSpacing: "-0.02em",
        }}
      >
        workspace-kb
      </div>
      <div
        style={{
          marginTop: 16,
          opacity: sub.opacity,
          translate: `0px ${sub.translateY}px`,
          fontSize: 28,
          color: COLORS.muted,
        }}
      >
        One engine · three clients
      </div>
    </AbsoluteFill>
  );
};

const CmdLine: React.FC<{
  text: string;
  start: number;
  accent?: boolean;
}> = ({ text, start, accent }) => {
  const frame = useCurrentFrame();
  const anim = fadeSlide(frame, start, 12);
  const reveal = interpolate(frame, [start, start + 20], [0, text.length], {
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
        gap: 12,
        fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
        fontSize: 26,
        color: accent ? COLORS.accent : COLORS.text,
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        padding: "14px 20px",
        width: 620,
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
        gap: 18,
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
          marginBottom: 8,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        Start once · wire once
      </div>
      <CmdLine text="npx workspace-kb up --port 8787" start={6} />
      <CmdLine
        text="npx workspace-kb install-clients"
        start={28}
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
    [reloadAt, reloadAt + 12, reloadAt + 36, reloadAt + 48],
    [0, 1, 1, 0.85],
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
        width: 200,
        opacity: appear.opacity,
        translate: `0px ${appear.translateY}px`,
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: "16px 18px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: color,
          }}
        />
        <div
          style={{
            fontSize: 22,
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
          fontSize: 15,
          color: COLORS.muted,
          fontFamily: 'ui-monospace, Consolas, monospace',
        }}
      >
        reload MCP ✓
      </div>
    </div>
  );
};

const HubScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const hub = fadeSlide(frame, 0, 16);
  const lineProgress = interpolate(frame, [18, 42], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  const pulse = interpolate(frame, [70, 90, 110], [0.35, 1, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const hubW = 240;
  const hubH = 100;
  const hubX = (width - hubW) / 2;
  const hubY = height / 2 - 20;
  const hubCx = hubX + hubW / 2;
  const hubCy = hubY + hubH / 2;

  const clients = [
    {
      name: "Cursor",
      color: COLORS.cursor,
      x: 48,
      y: 80,
      appearAt: 22,
      reloadAt: 78,
      tipX: 148,
      tipY: 170,
    },
    {
      name: "Codex",
      color: COLORS.codex,
      x: width - 248,
      y: 80,
      appearAt: 30,
      reloadAt: 86,
      tipX: width - 148,
      tipY: 170,
    },
    {
      name: "WorkBuddy",
      color: COLORS.workbuddy,
      x: (width - 200) / 2,
      y: height - 140,
      appearAt: 38,
      reloadAt: 94,
      tipX: width / 2,
      tipY: height - 140,
    },
  ];

  return (
    <AbsoluteFill>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0 }}
      >
        {clients.map((c) => (
          <line
            key={c.name}
            x1={hubCx}
            y1={hubCy}
            x2={hubCx + (c.tipX - hubCx) * lineProgress}
            y2={hubCy + (c.tipY - hubCy) * lineProgress}
            stroke={COLORS.line}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.85}
          />
        ))}
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
          gap: 4,
          boxShadow: `0 0 ${24 * pulse}px ${COLORS.accentSoft}`,
        }}
      >
        <div
          style={{
            fontSize: 24,
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
            fontSize: 15,
            color: COLORS.accent,
            fontFamily: 'ui-monospace, Consolas, monospace',
          }}
        >
          /mcp · shared index
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
          top: 28,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: interpolate(frame, [8, 22], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          fontSize: 20,
          color: COLORS.muted,
          fontFamily:
            'ui-sans-serif, system-ui, "Segoe UI", Helvetica, Arial, sans-serif',
        }}
      >
        Same HTTP URL · shared kb_search & memory
      </div>
    </AbsoluteFill>
  );
};

export const ThreeClients: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <Sequence durationInFrames={Math.round(2.1 * fps)} name="Title">
        <TitleScene />
      </Sequence>
      <Sequence
        from={Math.round(1.9 * fps)}
        durationInFrames={Math.round(2.4 * fps)}
        name="Commands"
      >
        <CommandsScene />
      </Sequence>
      <Sequence from={Math.round(4.1 * fps)} name="Hub">
        <HubScene />
      </Sequence>
    </AbsoluteFill>
  );
};
