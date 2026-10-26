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

/** 銅錢圓：外圈實色、中層白環、內心實色 */
function PinDot({ x, y, c, r = 5.6 }: { x: number; y: number; c: string; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={c} />
      <circle cx={x} cy={y} r={r * 0.45} fill="#f7f3ea" />
      <circle cx={x} cy={y} r={r * 0.2} fill={c} />
    </g>
  );
}

function PinFace({ value }: { value: number }) {
  const d = (x: number, y: number, c: string, r?: number) => (
    <PinDot key={`${x}-${y}-${c}`} x={x} y={y} c={c} r={r} />
  );

  // 一筒：大餅同心圓（外藍、中綠、內紅）
  if (value === 1) {
    return (
      <g>
        <circle cx="30" cy="42" r="21" fill={BLUE} />
        <circle cx="30" cy="42" r="16.5" fill="#f7f3ea" />
        <circle cx="30" cy="42" r="13" fill={GREEN} />
        <circle cx="30" cy="42" r="8.5" fill="#f7f3ea" />
        <circle cx="30" cy="42" r="5.8" fill={RED} />
        <circle cx="30" cy="42" r="2.2" fill="#f7f3ea" />
      </g>
    );
  }

  // 二筒：上綠下藍
  if (value === 2) {
    return (
      <g>
        {d(30, 24, GREEN, 7)}
        {d(30, 60, BLUE, 7)}
      </g>
    );
  }

  // 三筒：斜排 綠－紅－藍
  if (value === 3) {
    return (
      <g>
        {d(18, 20, GREEN)}
        {d(30, 42, RED)}
        {d(42, 64, BLUE)}
      </g>
    );
  }

  // 四筒：對角同色（兩綠兩藍）
  if (value === 4) {
    return (
      <g>
        {d(20, 26, GREEN)}
        {d(40, 26, BLUE)}
        {d(20, 58, BLUE)}
        {d(40, 58, GREEN)}
      </g>
    );
  }

  // 五筒：四筒對角色，中心紅
  if (value === 5) {
    return (
      <g>
        {d(18, 20, GREEN)}
        {d(42, 20, BLUE)}
        {d(30, 42, RED, 6.5)}
        {d(18, 64, BLUE)}
        {d(42, 64, GREEN)}
      </g>
    );
  }

  // 六筒：上二綠，下方 2x2 四紅
  if (value === 6) {
    return (
      <g>
        {d(20, 18, GREEN)}
        {d(40, 18, GREEN)}
        {d(20, 48, RED)}
        {d(40, 48, RED)}
        {d(20, 66, RED)}
        {d(40, 66, RED)}
      </g>
    );
  }

  // 七筒：上方斜排 3 綠，下方 2x2 正方 4 紅
  if (value === 7) {
    return (
      <g>
        {d(16, 16, GREEN, 4.8)}
        {d(30, 24, GREEN, 4.8)}
        {d(44, 32, GREEN, 4.8)}
        {d(20, 50, RED, 5.2)}
        {d(40, 50, RED, 5.2)}
        {d(20, 68, RED, 5.2)}
        {d(40, 68, RED, 5.2)}
      </g>
    );
  }

  // 八筒：兩列四行，全藍
  if (value === 8) {
    const ys = [15, 33, 51, 69];
    return (
      <g>
        {ys.map((y) => (
          <g key={y}>
            {d(20, y, BLUE, 5.2)}
            {d(40, y, BLUE, 5.2)}
          </g>
        ))}
      </g>
    );
  }

  // 九筒：三行三列，上行綠、中行紅、下行藍
  const rows: [number, string][] = [
    [18, GREEN],
    [42, RED],
    [66, BLUE],
  ];
  return (
    <g>
      {rows.map(([y, c]) => (
        <g key={y}>
          {d(16, y, c, 5)}
          {d(30, y, c, 5)}
          {d(44, y, c, 5)}
        </g>
      ))}
    </g>
  );
}

/** 直竹：綠身、兩端紅結、白色竹節紋 */
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

/** 斜竹條（用於八索） */
function Slash({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={GREEN}
      strokeWidth="4.6"
      strokeLinecap="round"
    />
  );
}

function SouFace({ value }: { value: number }) {
  const sticks = (
    items: { x: number; y: number; h?: number; color?: string }[],
  ) => items.map((s) => <Bamboo key={`${s.x}-${s.y}`} x={s.x} y={s.y} h={s.h} color={s.color} />);

  // 一索：幺雞（麻雀）
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

  // 二索：上下兩根垂直居中
  if (value === 2) {
    return (
      <g>
        {sticks([
          { x: 30, y: 12, h: 26 },
          { x: 30, y: 46, h: 26 },
        ])}
      </g>
    );
  }

  // 三索：品字形（上一、下二）
  if (value === 3) {
    return (
      <g>
        {sticks([
          { x: 30, y: 12, h: 26 },
          { x: 20, y: 46, h: 26 },
          { x: 40, y: 46, h: 26 },
        ])}
      </g>
    );
  }

  // 四索：2x2 方陣（上二、下二）
  if (value === 4) {
    return (
      <g>
        {sticks([
          { x: 20, y: 12, h: 26 },
          { x: 40, y: 12, h: 26 },
          { x: 20, y: 46, h: 26 },
          { x: 40, y: 46, h: 26 },
        ])}
      </g>
    );
  }

  // 五索：四角綠竹，正中紅竹
  if (value === 5) {
    return (
      <g>
        {sticks([
          { x: 18, y: 10, h: 18 },
          { x: 42, y: 10, h: 18 },
          { x: 30, y: 33, h: 18, color: RED },
          { x: 18, y: 56, h: 18 },
          { x: 42, y: 56, h: 18 },
        ])}
      </g>
    );
  }

  // 六索：兩行三列（上三根、下三根）
  if (value === 6) {
    return (
      <g>
        {sticks([
          { x: 18, y: 12, h: 26 },
          { x: 30, y: 12, h: 26 },
          { x: 42, y: 12, h: 26 },
          { x: 18, y: 46, h: 26 },
          { x: 30, y: 46, h: 26 },
          { x: 42, y: 46, h: 26 },
        ])}
      </g>
    );
  }

  // 七索：頂部 1 根紅竹，下方 2 排各 3 根綠竹（1 + 3 + 3）
  if (value === 7) {
    return (
      <g>
        {sticks([
          { x: 30, y: 8, h: 18, color: RED },
          { x: 18, y: 32, h: 18 },
          { x: 30, y: 32, h: 18 },
          { x: 42, y: 32, h: 18 },
          { x: 18, y: 56, h: 18 },
          { x: 30, y: 56, h: 18 },
          { x: 42, y: 56, h: 18 },
        ])}
      </g>
    );
  }

  // 八索：上排 M 反轉（倒 M：| / \ |），下排正 M（| \ / |）
  if (value === 8) {
    return (
      <g>
        {/* 上半部：M 反轉（左右兩柱 + 中間倒 V 尖頂） */}
        <Slash x1={18} y1={14} x2={18} y2={36} />
        <Slash x1={18} y1={36} x2={30} y2={16} />
        <Slash x1={30} y1={16} x2={42} y2={36} />
        <Slash x1={42} y1={14} x2={42} y2={36} />

        {/* 下半部：正 M（左右兩柱 + 中間正 V 夾角） */}
        <Slash x1={18} y1={48} x2={18} y2={70} />
        <Slash x1={18} y1={48} x2={30} y2={68} />
        <Slash x1={30} y1={68} x2={42} y2={48} />
        <Slash x1={42} y1={48} x2={42} y2={70} />
      </g>
    );
  }

  // 九索：三行三列，中列全紅
  return (
    <g>
      {[8, 33, 58].map((y) =>
        sticks([
          { x: 18, y, h: 18 },
          { x: 30, y, h: 18, color: RED },
          { x: 42, y, h: 18 },
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
        y="68"
        textAnchor="middle"
        fontSize="18"
        fontFamily="serif"
        fontWeight="500"
        fill="#c4161c"
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
  // 白板（3）：香港傳統白板通常為光身無字無框，故返回 null
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