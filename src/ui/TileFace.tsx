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
  // 香港傳統花牌：
  // 1-4: 四季牌（春、夏、秋、冬）- 紅字紅標
  // 5-8: 四君子（梅、蘭、菊、竹）- 藍/綠字標（對應座風 1東/梅 2南/蘭 3西/菊 4北/竹）
  const isSeason = value <= 4;
  const numIndex = isSeason ? value : value - 4; // 1, 2, 3, 4
  const name = ['春', '夏', '秋', '冬', '梅', '蘭', '菊', '竹'][value - 1] ?? '花';

  // 顏色配置：四季為硃砂紅，四君子為群青藍 / 碧綠
  const primaryColor = isSeason ? RED : (value === 8 ? GREEN : BLUE);
  const badgeColor = isSeason ? RED : BLUE;

  return (
    <g>
      {/* 傳統外緣暗框 */}
      <rect
        x="3"
        y="3"
        width="54"
        height="78"
        rx="2.5"
        fill="none"
        stroke={primaryColor}
        strokeWidth="0.6"
        strokeOpacity="0.35"
      />

      {/* 左上角數字角標（1~4） */}
      <rect
        x="5"
        y="5"
        width="11"
        height="12"
        rx="1.5"
        fill={badgeColor}
        opacity="0.12"
      />
      <text
        x="10.5"
        y="14.5"
        textAnchor="middle"
        fontSize="10"
        fontFamily="'Arial', 'Helvetica', sans-serif"
        fontWeight="900"
        fill={badgeColor}
      >
        {numIndex}
      </text>

      {/* 中間傳統精美插畫 */}
      {value === 1 && (
        /* 春：春燕展翅與桃紅柳綠 */
        <g transform="translate(0, -2)">
          {/* 柳枝與春枝 */}
          <path d="M14 26 C 24 22, 36 28, 46 22" stroke="#2e7d32" strokeWidth="1.2" fill="none" />
          <circle cx="20" cy="24" r="1.5" fill="#e91e63" />
          <circle cx="34" cy="26" r="1.8" fill="#e91e63" />
          <circle cx="44" cy="22" r="1.5" fill="#e91e63" />
          {/* 春燕剪尾 */}
          <path
            d="M24 38 Q 30 33, 37 36 Q 44 32, 46 38 Q 38 41, 35 46 Q 32 40, 24 38 Z"
            fill="#263238"
          />
          <path d="M35 46 L 31 54 L 35 50 L 39 54 Z" fill="#263238" />
          <circle cx="26" cy="37" r="1" fill="#fff" />
        </g>
      )}

      {value === 2 && (
        /* 夏：荷塘荷花與蓮蓬水紋 */
        <g transform="translate(0, -2)">
          {/* 水波 */}
          <path d="M16 48 C 22 46, 28 50, 34 48 C 40 46, 44 48, 46 48" stroke="#0288d1" strokeWidth="1" fill="none" opacity="0.6" />
          {/* 荷葉 */}
          <ellipse cx="22" cy="46" rx="8" ry="3.5" fill="#2e7d32" opacity="0.85" />
          {/* 荷花花瓣 */}
          <path d="M30 46 C 24 38, 22 30, 30 24 C 38 30, 36 38, 30 46 Z" fill="#e91e63" />
          <path d="M30 46 C 20 40, 18 34, 25 28 C 28 36, 29 42, 30 46 Z" fill="#f06292" opacity="0.9" />
          <path d="M30 46 C 40 40, 42 34, 35 28 C 32 36, 31 42, 30 46 Z" fill="#f06292" opacity="0.9" />
          <circle cx="30" cy="30" r="2.2" fill="#fbc02d" />
        </g>
      )}

      {value === 3 && (
        /* 秋：金楓落葉與明月中天 */
        <g transform="translate(0, -2)">
          {/* 秋月 */}
          <circle cx="38" cy="26" r="9" fill="#fff9c4" stroke="#fbc02d" strokeWidth="0.8" opacity="0.75" />
          {/* 楓葉 */}
          <g transform="translate(26, 36) scale(0.9)">
            <path
              d="M 0,-14 L 3,-5 L 10,-8 L 6,-1 L 13,3 L 5,4 L 7,12 L 1,7 L 0,14 L -1,7 L -7,12 L -5,4 L -13,3 L -6,-1 L -10,-8 L -3,-5 Z"
              fill="#e65100"
            />
            <line x1="0" y1="12" x2="0" y2="18" stroke="#bf360c" strokeWidth="1.2" />
          </g>
        </g>
      )}

      {value === 4 && (
        /* 冬：寒冬瑞雪與青松 */
        <g transform="translate(0, -2)">
          {/* 松針枝幹 */}
          <path d="M22 48 L 30 36 L 38 48" stroke="#1b5e20" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M25 40 L 30 30 L 35 40" stroke="#1b5e20" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M30 30 L 30 50" stroke="#4e342e" strokeWidth="1.8" />
          {/* 雪花結晶 */}
          <g transform="translate(38, 24) scale(0.7)">
            <line x1="-8" y1="0" x2="8" y2="0" stroke="#0288d1" strokeWidth="1.2" />
            <line x1="0" y1="-8" x2="0" y2="8" stroke="#0288d1" strokeWidth="1.2" />
            <line x1="-6" y1="-6" x2="6" y2="6" stroke="#0288d1" strokeWidth="1.2" />
            <line x1="-6" y1="6" x2="6" y2="-6" stroke="#0288d1" strokeWidth="1.2" />
            <circle cx="0" cy="0" r="1.5" fill="#0288d1" />
          </g>
        </g>
      )}

      {value === 5 && (
        /* 梅：五瓣老樁紅梅 */
        <g transform="translate(0, -2)">
          {/* 老梅乾枝 */}
          <path d="M16 48 Q 24 40, 26 34 T 44 24" stroke="#4e342e" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M26 34 Q 30 28, 28 22" stroke="#4e342e" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          {/* 五瓣紅梅花朵 */}
          <g transform="translate(36, 26)">
            {[0, 72, 144, 216, 288].map((deg) => (
              <circle
                key={deg}
                cx={Math.sin((deg * Math.PI) / 180) * 5.5}
                cy={-Math.cos((deg * Math.PI) / 180) * 5.5}
                r="4.2"
                fill="#d32f2f"
              />
            ))}
            <circle cx="0" cy="0" r="3.2" fill="#ffeb3b" />
            <circle cx="0" cy="0" r="1.2" fill="#b71c1c" />
          </g>
          {/* 花蕾 */}
          <circle cx="28" cy="20" r="2.4" fill="#c2185b" />
          <circle cx="18" cy="38" r="2" fill="#c2185b" />
        </g>
      )}

      {value === 6 && (
        /* 蘭：幽谷王者香 幽蘭飄逸 */
        <g transform="translate(0, -2)">
          {/* 蘭葉 */}
          <path d="M16 50 Q 20 28, 38 22 Q 32 36, 24 50" fill="#2e7d32" />
          <path d="M22 50 Q 28 32, 44 32 Q 34 42, 28 50" fill="#388e3c" opacity="0.85" />
          {/* 蘭花花苞與花冠 */}
          <g transform="translate(32, 26)">
            <ellipse cx="-3" cy="-2" rx="4.5" ry="2.5" fill="#7b1fa2" transform="rotate(-30)" />
            <ellipse cx="3" cy="-2" rx="4.5" ry="2.5" fill="#7b1fa2" transform="rotate(30)" />
            <ellipse cx="0" cy="4" rx="4" ry="3" fill="#ab47bc" />
            <circle cx="0" cy="1" r="1.5" fill="#ffeb3b" />
          </g>
        </g>
      )}

      {value === 7 && (
        /* 菊：重陽金菊盛開 */
        <g transform="translate(0, -2)">
          <g transform="translate(30, 34)">
            {/* 多層放射花瓣 */}
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
              <ellipse
                key={deg}
                cx="0"
                cy="-9"
                rx="2.6"
                ry="5"
                fill="#f57f17"
                transform={`rotate(${deg})`}
              />
            ))}
            {[15, 45, 75, 105, 135, 165, 195, 225, 255, 285, 315, 345].map((deg) => (
              <ellipse
                key={deg}
                cx="0"
                cy="-6.5"
                rx="2"
                ry="4"
                fill="#fbc02d"
                transform={`rotate(${deg})`}
              />
            ))}
            <circle cx="0" cy="0" r="3.5" fill="#d84315" />
          </g>
        </g>
      )}

      {value === 8 && (
        /* 竹：節節高升 翠竹青青 */
        <g transform="translate(0, -2)">
          {/* 竹竿本體 */}
          <g transform="translate(26, 16)">
            <rect x="0" y="2" width="4" height="12" rx="0.8" fill="#2e7d32" />
            <line x1="-0.8" y1="2" x2="4.8" y2="2" stroke="#1b5e20" strokeWidth="1.2" />
            <rect x="0" y="16" width="4" height="13" rx="0.8" fill="#2e7d32" />
            <line x1="-0.8" y1="16" x2="4.8" y2="16" stroke="#1b5e20" strokeWidth="1.2" />
            <rect x="0" y="31" width="4" height="13" rx="0.8" fill="#2e7d32" />
            <line x1="-0.8" y1="31" x2="4.8" y2="31" stroke="#1b5e20" strokeWidth="1.2" />
          </g>
          {/* 竹葉群 */}
          <path d="M28 20 Q 38 16, 44 20 Q 36 22, 28 20" fill="#388e3c" />
          <path d="M28 21 Q 40 24, 43 30 Q 34 26, 28 21" fill="#43a047" />
          <path d="M26 34 Q 16 30, 12 35 Q 20 37, 26 34" fill="#388e3c" />
          <path d="M26 35 Q 15 38, 14 45 Q 22 41, 26 35" fill="#43a047" />
        </g>
      )}

      {/* 底部正宗楷體名號 */}
      <text
        x="30"
        y="73"
        textAnchor="middle"
        fontSize="17"
        fontFamily="'Noto Serif TC', 'Songti SC', 'SimSun', 'STSong', serif"
        fontWeight="800"
        fill={primaryColor}
        letterSpacing="1"
      >
        {name}
      </text>
    </g>
  );
}