import type { Suit } from '../game/types';

interface Props {
  suit: Suit;
  value: number;
}

/** 牌面圖（參考香港實體牌樣） */
export function TileFace({ suit, value }: Props) {
  return (
    <svg className="mj-face" viewBox="0 0 60 84" aria-hidden>
      {suit === 'pin' && <PinFace value={value} />}
      {suit === 'sou' && <SouFace value={value} />}
      {suit === 'man' && <ManFace value={value} />}
      {suit === 'wind' && <WindFace value={value} />}
      {suit === 'dragon' && <DragonFace value={value} />}
      {suit === 'flower' && <FlowerFace value={value} />}
    </svg>
  );
}

const RED = '#c4161c';
const BLUE = '#243a8c';
const GREEN = '#0e7a3a';

/** 銅錢圓：外圈實色、中間白孔；可選輪輻／菊花細節 */
function PinDot({
  x,
  y,
  c,
  r = 6,
  ornate,
}: {
  x: number;
  y: number;
  c: string;
  r?: number;
  ornate?: boolean;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={c} />
      <circle cx={x} cy={y} r={r * 0.42} fill="#f7f3ea" />
      {ornate &&
        [0, 45, 90, 135].map((deg) => (
          <line
            key={deg}
            x1={x}
            y1={y}
            x2={x + r * 0.36 * Math.cos((deg * Math.PI) / 180)}
            y2={y + r * 0.36 * Math.sin((deg * Math.PI) / 180)}
            stroke={c}
            strokeWidth="0.6"
            opacity="0.55"
          />
        ))}
      <circle cx={x} cy={y} r={r * 0.18} fill={c} />
    </g>
  );
}

function PinFace({ value }: { value: number }) {
  const d = (x: number, y: number, c: string, ornate = false) => (
    <PinDot key={`${x}-${y}-${c}`} x={x} y={y} c={c} ornate={ornate} />
  );

  // 一筒：大餅，同心圓（藍／綠／紅）
  if (value === 1) {
    return (
      <g>
        <circle cx="30" cy="42" r="20" fill={BLUE} />
        <circle cx="30" cy="42" r="15.5" fill="#f7f3ea" />
        <circle cx="30" cy="42" r="12.5" fill={GREEN} />
        <circle cx="30" cy="42" r="8.2" fill="#f7f3ea" />
        <circle cx="30" cy="42" r="5.6" fill={RED} />
        <circle cx="30" cy="42" r="2.2" fill="#f7f3ea" />
      </g>
    );
  }

  // 二筒：上綠下藍
  if (value === 2) return <g>{d(30, 26, GREEN)}{d(30, 58, BLUE)}</g>;

  // 三筒：斜排 綠－紅－藍
  if (value === 3) {
    return (
      <g>
        {d(18, 22, GREEN)}
        {d(30, 42, RED)}
        {d(42, 62, BLUE)}
      </g>
    );
  }

  // 四筒：對角同色（綠／藍）
  if (value === 4) {
    return (
      <g>
        {d(20, 28, GREEN)}
        {d(40, 28, BLUE)}
        {d(20, 56, BLUE)}
        {d(40, 56, GREEN)}
      </g>
    );
  }

  // 五筒：同四筒，中心紅
  if (value === 5) {
    return (
      <g>
        {d(20, 22, GREEN)}
        {d(40, 22, BLUE)}
        {d(30, 42, RED)}
        {d(20, 62, BLUE)}
        {d(40, 62, GREEN)}
      </g>
    );
  }

  // 六筒：上二綠，中間留空，下四紅
  if (value === 6) {
    return (
      <g>
        {d(22, 16, GREEN)}
        {d(38, 16, GREEN)}
        {d(20, 46, RED)}
        {d(40, 46, RED)}
        {d(20, 62, RED)}
        {d(40, 62, RED)}
      </g>
    );
  }

  // 七筒：上三斜全藍 + 下四方 2×2 全紅
  if (value === 7) {
    return (
      <g>
        {d(16, 16, BLUE, true)}
        {d(30, 30, BLUE, true)}
        {d(44, 44, BLUE, true)}
        {d(22, 56, RED, true)}
        {d(38, 56, RED, true)}
        {d(22, 70, RED, true)}
        {d(38, 70, RED, true)}
      </g>
    );
  }

  // 八筒：兩列四行，全藍
  if (value === 8) {
    const ys = [14, 32, 50, 68];
    return (
      <g>
        {ys.map((y) => (
          <g key={y}>
            {d(22, y, BLUE)}
            {d(40, y, BLUE)}
          </g>
        ))}
      </g>
    );
  }

  // 九筒：三行分色，中行紅，上行綠、下行藍
  const rows: [number, string][] = [
    [18, GREEN],
    [42, RED],
    [66, BLUE],
  ];
  return (
    <g>
      {rows.map(([y, c]) => (
        <g key={y}>
          {d(16, y, c)}
          {d(30, y, c)}
          {d(44, y, c)}
        </g>
      ))}
    </g>
  );
}

/** 直竹：綠身、兩端紅結、中間節 */
function Bamboo({
  x,
  y,
  h = 22,
  color = GREEN,
}: {
  x: number;
  y: number;
  h?: number;
  color?: string;
}) {
  const nodes = [0.33, 0.66];
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-2.6" y="2.2" width="5.2" height={h - 4.4} rx="1.2" fill={color} />
      <rect x="-3.1" y="0" width="6.2" height="3.4" rx="1" fill={RED} />
      <rect x="-3.1" y={h - 3.4} width="6.2" height="3.4" rx="1" fill={RED} />
      {nodes.map((t) => (
        <line
          key={t}
          x1="-2.6"
          y1={h * t}
          x2="2.6"
          y2={h * t}
          stroke="#f7f3ea"
          strokeWidth="0.7"
        />
      ))}
    </g>
  );
}

/** 斜竹段：兩端紅結 */
function DiagonalBamboo({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={GREEN} strokeWidth="4.8" strokeLinecap="round" />
      <circle cx={x1} cy={y1} r="2.2" fill={RED} />
      <circle cx={x2} cy={y2} r="2.2" fill={RED} />
    </g>
  );
}

function SouFace({ value }: { value: number }) {
  const sticks = (
    items: { x: number; y: number; h?: number; color?: string }[],
  ) => items.map((s) => <Bamboo key={`${s.x}-${s.y}`} x={s.x} y={s.y} h={s.h} color={s.color} />);

  // 一索：麻雀（幺雞）
  if (value === 1) {
    return (
      <g>
        <path d="M40 28c6 1 12 6 12 12 0 4-3 7-7 8" fill="#168a3e" />
        <ellipse cx="28" cy="36" rx="12" ry="9" fill="#168a3e" />
        <ellipse cx="20" cy="28" rx="7" ry="6" fill="#1a9a48" />
        <path d="M12 26l-6 2 6 3z" fill={RED} />
        <circle cx="18" cy="26" r="1.6" fill="#111" />
        <path d="M34 32c4-6 8-8 12-6" stroke="#0d5c2c" strokeWidth="1.4" fill="none" />
        <path d="M22 44l-2 10M30 44l2 10" stroke="#c45a1a" strokeWidth="1.3" />
        <path d="M18 54h4M28 54h4" stroke={RED} strokeWidth="1.6" strokeLinecap="round" />
      </g>
    );
  }

  // 二索：同一中軸，上下各一根
  if (value === 2) {
    return <g>{sticks([{ x: 30, y: 10, h: 26 }, { x: 30, y: 48, h: 26 }])}</g>;
  }
  // 三索：品字形
  if (value === 3) {
    return (
      <g>
        {sticks([{ x: 30, y: 10, h: 24 }])}
        {sticks([{ x: 22, y: 44, h: 24 }, { x: 38, y: 44, h: 24 }])}
      </g>
    );
  }
  if (value === 4) {
    return (
      <g>
        {sticks([
          { x: 22, y: 12, h: 26 },
          { x: 38, y: 12, h: 26 },
          { x: 22, y: 44, h: 26 },
          { x: 38, y: 44, h: 26 },
        ])}
      </g>
    );
  }
  if (value === 5) {
    return (
      <g>
        {sticks([
          { x: 22, y: 8, h: 18 },
          { x: 38, y: 8, h: 18 },
          { x: 30, y: 32, h: 18, color: RED },
          { x: 22, y: 56, h: 18 },
          { x: 38, y: 56, h: 18 },
        ])}
      </g>
    );
  }
  // 六索／七索下半：上三、下三
  const souSixGrid = [
    { x: 16, y: 30, h: 20 },
    { x: 30, y: 30, h: 20 },
    { x: 44, y: 30, h: 20 },
    { x: 16, y: 54, h: 20 },
    { x: 30, y: 54, h: 20 },
    { x: 44, y: 54, h: 20 },
  ];
  if (value === 6) {
    return <g>{sticks(souSixGrid)}</g>;
  }
  // 七索：塔狀 — 頂部中央一根紅竹 + 下方同六索 3×2
  if (value === 7) {
    return (
      <g>
        {sticks([{ x: 30, y: 6, h: 20, color: RED }])}
        {sticks(souSixGrid)}
      </g>
    );
  }
  // 八索：全斜竹 — 上排 M（/\ /\\），下排 W（\/ \\/）
  if (value === 8) {
    return (
      <g>
        <DiagonalBamboo x1={14} y1={36} x2={20} y2={14} />
        <DiagonalBamboo x1={20} y1={14} x2={26} y2={36} />
        <DiagonalBamboo x1={34} y1={36} x2={40} y2={14} />
        <DiagonalBamboo x1={40} y1={14} x2={46} y2={36} />
        <DiagonalBamboo x1={14} y1={48} x2={20} y2={70} />
        <DiagonalBamboo x1={20} y1={70} x2={26} y2={48} />
        <DiagonalBamboo x1={34} y1={48} x2={40} y2={70} />
        <DiagonalBamboo x1={40} y1={70} x2={46} y2={48} />
      </g>
    );
  }
  // 九索：三行，中列紅
  return (
    <g>
      {[6, 32, 58].map((y) =>
        sticks([
          { x: 16, y, h: 16 },
          { x: 30, y, h: 16, color: RED },
          { x: 44, y, h: 16 },
        ]),
      )}
    </g>
  );
}

function ManFace({ value }: { value: number }) {
  const n = '一二三四五六七八九'[value - 1];
  return (
    <g>
      <text
        x="30"
        y="40"
        textAnchor="middle"
        fontSize="28"
        fontFamily="serif"
        fontWeight="800"
        fill="#1a1a1a"
      >
        {n}
      </text>
      <text
        x="30"
        y="70"
        textAnchor="middle"
        fontSize="24"
        fontFamily="serif"
        fontWeight="900"
        fill="#c4161c"
        stroke="#a01010"
        strokeWidth="0.8"
        paintOrder="stroke fill"
      >
        萬
      </text>
    </g>
  );
}

function WindFace({ value }: { value: number }) {
  const ch = '東南西北'[value - 1];
  return (
    <text x="30" y="54" textAnchor="middle" fontSize="36" fontFamily="serif" fontWeight="700" fill="#1a1a1a">
      {ch}
    </text>
  );
}

function DragonFace({ value }: { value: number }) {
  if (value === 3) return null;
  const ch = value === 1 ? '中' : '發';
  const fill = value === 1 ? '#d31c2b' : '#1a6b38';
  return (
    <text x="30" y="56" textAnchor="middle" fontSize="34" fontFamily="serif" fontWeight="700" fill={fill}>
      {ch}
    </text>
  );
}

function FlowerFace({ value }: { value: number }) {
  const names = ['春', '夏', '秋', '冬', '梅', '蘭', '菊', '竹'];
  const colors = ['#3aaa6a', '#e07a2f', '#d4a017', '#4a7eb5', '#d31c2b', '#2f9e6b', '#c45a9a', '#3d8f4a'];
  const c = colors[value - 1] ?? '#d31c2b';
  return (
    <g>
      <circle cx="30" cy="34" r="12" fill={c} />
      <circle cx="30" cy="34" r="5" fill="#ffe08a" />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <ellipse key={deg} cx="30" cy="18" rx="4" ry="8" fill={c} transform={`rotate(${deg} 30 34)`} opacity="0.9" />
      ))}
      <text x="30" y="74" textAnchor="middle" fontSize="14" fontFamily="serif" fontWeight="700" fill={c}>
        {names[value - 1]}
      </text>
    </g>
  );
}
