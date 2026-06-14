import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";
import { useCallsStore } from "../../store/useCallsStore";
import {
  pickRouletteOutcome,
  ROULETTE_WHEEL_ORDER,
  rotationForOutcome,
  rouletteColor,
  rouletteSegmentAngle,
  type RouletteColor,
} from "../../lib/casinoRoulette";
import { useCasinoStore } from "../../store/useCasinoStore";
import { useStore } from "../../store/useStore";

type RouletteBetColor = "red" | "black";
type RouletteBetResult = "won" | "lost";

const WHEEL_SIZE = 200;
const WHEEL_CENTER = WHEEL_SIZE / 2;
const WHEEL_RADIUS = WHEEL_CENTER - 6;

function polarPoint(cx: number, cy: number, radius: number, degrees: number) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function segmentPath(index: number, segmentAngle: number) {
  const start = index * segmentAngle;
  const end = start + segmentAngle;
  const startPoint = polarPoint(WHEEL_CENTER, WHEEL_CENTER, WHEEL_RADIUS, start);
  const endPoint = polarPoint(WHEEL_CENTER, WHEEL_CENTER, WHEEL_RADIUS, end);
  const largeArc = segmentAngle > 180 ? 1 : 0;
  return `M ${WHEEL_CENTER} ${WHEEL_CENTER} L ${startPoint.x} ${startPoint.y} A ${WHEEL_RADIUS} ${WHEEL_RADIUS} 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y} Z`;
}

function segmentFill(color: RouletteColor): string {
  if (color === "green") return "#166534";
  if (color === "red") return "#991b1b";
  return "#1a1a1a";
}

export default function CasinoRoulette() {
  const activePage = useStore((s) => s.activePage);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const gameModeEnabled = useStore((s) => s.gameModeEnabled);
  const viewMode = useCallsStore((s) => s.getCallsViewMode(activeRoomId));
  const screenSharing = useCallsStore((s) => s.screenSharing);
  const rouletteOpen = useCasinoStore((s) => s.rouletteOpen);
  const closeRoulette = useCasinoStore((s) => s.closeRoulette);

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [activeBet, setActiveBet] = useState<RouletteBetColor | null>(null);
  const [betResult, setBetResult] = useState<RouletteBetResult | null>(null);

  const segmentAngle = rouletteSegmentAngle();

  useEffect(() => {
    if (screenSharing) closeRoulette();
  }, [screenSharing, closeRoulette]);

  useEffect(() => {
    if (!rouletteOpen) {
      setActiveBet(null);
      setBetResult(null);
      setSpinning(false);
    }
  }, [rouletteOpen]);

  const placeBetAndSpin = useCallback(
    (color: RouletteBetColor) => {
      if (spinning) return;
      const nextOutcome = pickRouletteOutcome();
      const nextRotation = rotationForOutcome(nextOutcome, rotation);
      setActiveBet(color);
      setSpinning(true);
      setBetResult(null);
      setRotation(nextRotation);
      window.setTimeout(() => {
        const resultColor = rouletteColor(nextOutcome);
        setSpinning(false);
        setBetResult(resultColor === color ? "won" : "lost");
      }, 4200);
    },
    [rotation, spinning],
  );

  if (
    activePage === "settings" ||
    viewMode === "theater" ||
    !gameModeEnabled ||
    !rouletteOpen ||
    screenSharing
  ) {
    return null;
  }

  return (
    <div className="casino-roulette-dock" role="group" aria-label="Casino roulette">
      <button
        type="button"
        className="casino-roulette__bet casino-roulette__bet--red"
        onClick={() => placeBetAndSpin("red")}
        disabled={spinning}
        aria-pressed={activeBet === "red"}
        aria-label="Bet on red"
      >
        Bet
      </button>

      <div className="casino-roulette">
        <span className="casino-roulette__pointer" aria-hidden />

        {betResult && (
          <p
            className={clsx(
              "casino-roulette__outcome",
              betResult === "won"
                ? "casino-roulette__outcome--won"
                : "casino-roulette__outcome--lost",
            )}
            aria-live="polite"
          >
            {betResult === "won" ? "Won" : "Lost"}
          </p>
        )}

        <div className="casino-roulette__wheel-wrap" aria-hidden>
          <div
            className={clsx("casino-roulette__wheel", spinning && "casino-roulette__wheel--spinning")}
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <svg viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`} className="casino-roulette__wheel-svg" aria-hidden>
              {ROULETTE_WHEEL_ORDER.map((value, index) => {
                const color = rouletteColor(value);
                const labelAngle = index * segmentAngle + segmentAngle / 2;
                const labelPoint = polarPoint(
                  WHEEL_CENTER,
                  WHEEL_CENTER,
                  WHEEL_RADIUS * 0.72,
                  labelAngle,
                );
                return (
                  <g key={`${value}-${index}`}>
                    <path
                      d={segmentPath(index, segmentAngle)}
                      fill={segmentFill(color)}
                      stroke="rgb(255 255 255 / 0.08)"
                      strokeWidth="0.6"
                    />
                    <text
                      x={labelPoint.x}
                      y={labelPoint.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="casino-roulette__segment-label"
                      transform={`rotate(${labelAngle}, ${labelPoint.x}, ${labelPoint.y})`}
                    >
                      {value}
                    </text>
                  </g>
                );
              })}
              <circle
                cx={WHEEL_CENTER}
                cy={WHEEL_CENTER}
                r={18}
                fill="#242424"
                stroke="rgb(255 255 255 / 0.16)"
                strokeWidth="1.5"
              />
            </svg>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="casino-roulette__bet casino-roulette__bet--black"
        onClick={() => placeBetAndSpin("black")}
        disabled={spinning}
        aria-pressed={activeBet === "black"}
        aria-label="Bet on black"
      >
        Bet
      </button>
    </div>
  );
}
