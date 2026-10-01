import type { CSSProperties, ReactNode } from "react";
import { IconCheck } from "./Icons";

/**
 * A laptop, a phone and a thermal receipt printer in real 3D — built from CSS 3D
 * transforms (no images, no WebGL, no library), so it costs a few hundred DOM
 * nodes instead of a few hundred kilobytes: important for visitors on slow
 * connections and cheap phones.
 *
 * The scene is drawn at a fixed 640×360 and scaled to fit by global.css
 * (.device-scene), so the proportions hold from a 360px phone to a desktop.
 *
 * It is deliberately STILL and deliberately ARRANGED, like a product shot, in
 * graphite hardware with dark screens, each device at its own angle: the laptop
 * stands large at the back, turned a little towards the headline; the phone stands
 * front-left and the printer low in front, both angled in towards the laptop, with
 * the receipt (and its QR code) coming out towards the viewer.
 *
 * The screens are sample data, in the spirit of the product rather than copies
 * of it. 3D geometry reminder: x → right, y → DOWN, z → towards the viewer.
 */

const abs: CSSProperties = { position: "absolute" };
const solid: CSSProperties = { transformStyle: "preserve-3d" };

// ── Laptop ──────────────────────────────────────────────────────────────────

const LAPTOP = { w: 430, depth: 190, thick: 11, lidH: 272, lidThick: 6, tilt: 12 };
const GRAPHITE = "linear-gradient(180deg, #4a4c56 0%, #34363e 55%, #26272d 100%)";
const RIM = "#5a5d68";

/**
 * Origin = the middle of the hinge line, at deck height. The base extends
 * forward (+z) and the lid rises (-y), leaning back.
 */
function Laptop() {
  const { w, depth, thick, lidH, lidThick, tilt } = LAPTOP;
  return (
    <div style={{ ...abs, left: 0, top: 0, ...solid, transform: "translate3d(36px, -9.9px, -92px) scale(0.9) rotateY(-9deg)" }}>
      {/* Deck (the top of the base): laid flat, hinged at its back edge. */}
      <div
        style={{
          ...abs, left: -w / 2, top: 0, width: w, height: depth, transformOrigin: "50% 0", transform: "rotateX(90deg)",
          background: GRAPHITE, borderRadius: "3px 3px 16px 16px", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14)",
        }}
      >
        <div style={{ ...abs, inset: 0, borderRadius: "inherit", background: "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.02) 40%, rgba(0,0,0,0.12) 100%)" }} />
        <div style={{ ...abs, left: "5%", right: "5%", top: 0, height: 8, background: "linear-gradient(#1b1c21,#2c2e35)", borderRadius: "0 0 5px 5px" }} />
        {(["left", "right"] as const).map((side) => (
          <div key={side} style={{ ...abs, [side]: "1.2%", top: 22, width: "3.2%", height: 92, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.20) 0.9px, transparent 1.3px)", backgroundSize: "4.5px 4.5px" }} />
        ))}
        <Keyboard />
        <div style={{ ...abs, left: "33%", right: "33%", bottom: 10, height: 50, borderRadius: 8, background: "linear-gradient(#32343c,#26272d)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 1px 2px rgba(255,255,255,0.10)" }} />
      </div>

      {/* Front lip of the base, with the finger notch. */}
      <div style={{ ...abs, left: -w / 2, top: 0, width: w, height: thick, transform: `translateZ(${depth}px)`, background: "linear-gradient(180deg,#43454e,#25262b)", borderRadius: "0 0 16px 16px" }}>
        <div style={{ ...abs, left: "50%", top: 0, width: 74, height: 4, marginLeft: -37, borderRadius: "0 0 7px 7px", background: "rgba(0,0,0,0.45)" }} />
      </div>

      {/* Right-hand side of the base. */}
      <div style={{ ...abs, left: w / 2 - depth, top: 0, width: depth, height: thick, transformOrigin: "100% 50%", transform: "rotateY(90deg)", background: "linear-gradient(90deg,#2a2b31,#444650)", borderRadius: "0 0 4px 4px" }} />

      {/* Lid: stands on the hinge and leans back. */}
      <div style={{ ...abs, left: -w / 2, top: -lidH, width: w, height: lidH, transformOrigin: "50% 100%", ...solid, transform: `rotateX(${tilt}deg)` }}>
        <div style={{ ...abs, inset: 0, background: GRAPHITE, borderRadius: "14px 14px 5px 5px", transform: `translateZ(${-lidThick}px)` }} />
        <div style={{ ...abs, right: 0, top: 6, width: lidThick, height: lidH - 12, transformOrigin: "100% 50%", transform: "rotateY(-90deg)", background: "linear-gradient(90deg,#2c2d33,#4a4c56)" }} />
        <div style={{ ...abs, inset: 0, borderRadius: "14px 14px 5px 5px", background: "#07070a", boxShadow: `0 0 0 2px ${RIM}, 0 -1px 0 2px rgba(255,255,255,0.22), inset 0 0 0 1px rgba(255,255,255,0.06)`, padding: "11px 10px 15px" }}>
          <div style={{ ...abs, top: 4, left: "50%", width: 4, height: 4, marginLeft: -2, borderRadius: "50%", background: "#1d1f27" }} />
          <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 4, overflow: "hidden", background: "#0a0612" }}>
            <DashboardScreen />
            <Sheen />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Four rows of keys and a space bar, set into a dark well. */
function Keyboard() {
  const key: CSSProperties = { flex: 1, borderRadius: 2.5, background: "#1c1d24", boxShadow: "0 1px 0 rgba(255,255,255,0.08)" };
  const row = (n: number, i: number) => (
    <div key={i} style={{ display: "flex", gap: 2.5, flex: 1 }}>
      {Array.from({ length: n }, (_, k) => <div key={k} style={key} />)}
    </div>
  );
  return (
    <div style={{ ...abs, left: "5%", right: "5%", top: 18, height: 100, padding: 5, borderRadius: 7, background: "#121318", display: "flex", flexDirection: "column", gap: 2.5, boxShadow: "inset 0 1px 3px rgba(0,0,0,0.7)" }}>
      {[14, 14, 14, 13].map(row)}
      <div style={{ display: "flex", gap: 2.5, flex: 1 }}>
        <div style={{ ...key, flex: 1.3 }} /><div style={{ ...key, flex: 1.3 }} /><div style={{ ...key, flex: 1.3 }} />
        <div style={{ ...key, flex: 6.5 }} />
        <div style={{ ...key, flex: 1.3 }} /><div style={{ ...key, flex: 1.3 }} />
      </div>
    </div>
  );
}

/** Glass reflection laid over a screen. */
function Sheen() {
  return <div style={{ ...abs, inset: 0, pointerEvents: "none", background: "linear-gradient(115deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.02) 34%, transparent 55%)" }} />;
}

// ── Phone ───────────────────────────────────────────────────────────────────

const PHONE = { w: 138, h: 292, thick: 10, radius: 32 };
const BLACK_TITANIUM = "linear-gradient(155deg, #62626b 0%, #2c2c33 40%, #55555d 68%, #1c1c21 100%)";

function Phone() {
  const { w, h, thick, radius } = PHONE;
  return (
    // Origin = the middle of the bottom edge (where it stands on the table).
    <div style={{ ...abs, left: -w / 2, top: -h, width: w, height: h, transformOrigin: "50% 100%", ...solid, transform: "translate3d(-162px, 0, 82px) scale(0.74) rotateY(20deg) rotateX(2deg)" }}>
      {/* The body is a stack of identical rounded slices — that's what gives it a rounded edge with real thickness. */}
      {Array.from({ length: thick }, (_, i) => (
        <div key={i} style={{ ...abs, inset: 0, borderRadius: radius, background: i === thick - 1 ? "#0e0e11" : BLACK_TITANIUM, transform: `translateZ(${-i}px)` }} />
      ))}
      {/* Side buttons */}
      {([[92, 44, "right"], [72, 26, "left"], [108, 32, "left"], [148, 32, "left"]] as const).map(([top, height, side]) => (
        <div key={`${side}${top}`} style={{ ...abs, [side]: -2, top, width: 3, height, borderRadius: 2, background: "#44444b", transform: "translateZ(-5px)" }} />
      ))}
      {/* Screen: a black bezel, then the glass. */}
      <div style={{ ...abs, inset: 5, borderRadius: radius - 5, background: "#000", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)", transform: "translateZ(0.5px)" }}>
        <div style={{ ...abs, inset: 3, borderRadius: radius - 8, overflow: "hidden" }}>
          <PhoneScreen />
          <Sheen />
        </div>
      </div>
    </div>
  );
}

// ── Screens ─────────────────────────────────────────────────────────────────

const NAV = ["Dashboard", "Sales", "Products", "Customers", "Reports", "Staff", "Branches"];
const SALES_LINE = [34, 40, 31, 46, 38, 52, 44, 58, 49, 64, 56, 72, 66, 80]; // % of chart height

/** A tiny trend line for a KPI card. */
function Spark({ pts, color }: { pts: number[]; color: string }) {
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * 40},${14 - (v / 100) * 12}`).join(" ");
  return <svg width="40" height="14" viewBox="0 0 40 14" aria-hidden="true"><polyline points={d} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** The dashboard on a laptop, dark theme (sample figures). */
function DashboardScreen() {
  const kpis: [string, string, number[], string][] = [
    ["Today's Sales", "$4,950.00", [20, 35, 28, 50, 44, 70, 85], "#a78bfa"],
    ["Transactions", "129", [30, 25, 45, 40, 60, 55, 78], "#34d399"],
    ["Customers", "86", [40, 38, 50, 46, 58, 62, 70], "#a78bfa"],
    ["On account", "$1,230.00", [60, 52, 58, 44, 50, 40, 46], "#fbbf24"],
  ];
  const line = SALES_LINE.map((v, i) => `${(i / (SALES_LINE.length - 1)) * 100},${100 - v}`).join(" ");
  const top: [string, string, number, string][] = [["Coca-Cola 500ml", "$1.50", 86, "#a78bfa"], ["White Loaf", "$1.20", 71, "#f472b6"], ["Fresh Milk 1L", "$2.50", 58, "#38bdf8"], ["Chicken 1kg", "$5.99", 44, "#fbbf24"]];
  return (
    <div className="flex h-full w-full bg-[#0a0612] text-white" style={{ fontSize: 7, lineHeight: 1.25 }}>
      <div className="flex w-[76px] shrink-0 flex-col border-r border-white/[0.07] bg-white/[0.03] px-2 py-2.5">
        <div className="mb-3 flex items-center gap-1">
          <span className="grid h-4 w-4 place-items-center rounded bg-gradient-to-br from-violet-500 to-indigo-600">
            <svg width="9" height="9" viewBox="0 0 64 64"><path d="M12 18l9 28 11-19 11 19 9-28" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <b className="text-[8px]">WivaePOS</b>
        </div>
        {NAV.map((n, i) => (
          <div key={n} className={`mb-0.5 flex items-center gap-1.5 rounded-md px-1.5 py-[4px] text-[6.5px] ${i === 0 ? "bg-violet-500/25 font-semibold text-violet-100 ring-1 ring-violet-400/30" : "text-white/50"}`}>
            <span className={`h-1.5 w-1.5 rounded-[2px] ${i === 0 ? "bg-violet-400" : "bg-white/20"}`} />
            {n}
          </div>
        ))}
      </div>
      <div className="relative min-w-0 flex-1 p-2.5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(ellipse_at_70%_0%,rgba(124,58,237,0.28),transparent_70%)]" />
        <div className="relative flex items-start justify-between">
          <div>
            <div className="text-[10px] font-bold">Welcome back, Sarah</div>
            <div className="text-[6px] text-white/45">Here's how Fresh Mart is doing today</div>
          </div>
          <span className="flex items-center gap-[3px] rounded-full bg-emerald-400/15 px-1.5 py-[2px] text-[5.5px] font-semibold text-emerald-300"><i className="h-[4px] w-[4px] rounded-full bg-emerald-400" />Synced</span>
        </div>
        <div className="relative mt-2 grid grid-cols-4 gap-1.5">
          {kpis.map(([l, v, pts, c]) => (
            <div key={l} className="rounded-lg bg-white/[0.05] p-1.5 ring-1 ring-white/10">
              <div className="truncate text-[5.5px] text-white/45">{l}</div>
              <div className="mt-0.5 flex items-end justify-between gap-1">
                <span className="text-[9px] font-bold tabular-nums">{v}</span>
                <Spark pts={pts} color={c} />
              </div>
            </div>
          ))}
        </div>
        <div className="relative mt-1.5 grid grid-cols-[1.45fr_1fr_0.85fr] gap-1.5">
          <div className="rounded-lg bg-white/[0.05] p-2 ring-1 ring-white/10">
            <div className="text-[6.5px] font-semibold text-white/70">Sales overview</div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-1 h-[74px] w-full" aria-hidden="true">
              <defs><linearGradient id="wv-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity="0.45" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient></defs>
              {[25, 50, 75].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="0.6" />)}
              <polygon points={`0,100 ${line} 100,100`} fill="url(#wv-area)" />
              <polyline points={line} fill="none" stroke="#a78bfa" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="mt-0.5 flex justify-between text-[4.5px] text-white/35"><span>Mon</span><span>Wed</span><span>Fri</span><span>Sun</span></div>
          </div>
          <div className="rounded-lg bg-white/[0.05] p-2 ring-1 ring-white/10">
            <div className="text-[6.5px] font-semibold text-white/70">Top products</div>
            <div className="mt-1.5 space-y-1.5">
              {top.map(([n, p, w, c]) => (
                <div key={n}>
                  <div className="flex justify-between text-[5.5px]"><span className="truncate text-white/80">{n}</span><b className="tabular-nums">{p}</b></div>
                  <div className="mt-[2px] h-[2px] rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${w}%`, background: c }} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-white/[0.05] p-2 ring-1 ring-white/10">
            <div className="text-[6.5px] font-semibold text-white/70">Payments</div>
            <div className="relative mx-auto mt-1.5 h-[38px] w-[38px] rounded-full" style={{ background: "conic-gradient(#8b5cf6 0 52%, #34d399 52% 82%, #fbbf24 82% 100%)" }}>
              <div className="absolute inset-[7px] grid place-items-center rounded-full bg-[#120b24] text-center text-[5px] leading-tight"><span><b className="block text-[6px]">$4,259</b>total</span></div>
            </div>
            <div className="mt-1.5 space-y-[3px] text-[5px] text-white/60">
              {([["Cash", "#8b5cf6"], ["EcoCash", "#34d399"], ["Other", "#fbbf24"]] as const).map(([n, c]) => (
                <div key={n} className="flex items-center gap-1"><i className="h-[4px] w-[4px] rounded-full" style={{ background: c }} />{n}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The owner's dashboard on a phone, dark theme (sample figures). */
function PhoneScreen() {
  const bars = [38, 55, 44, 72, 60, 92, 68];
  const top: [string, string, string][] = [["Coca-Cola 500ml", "$1.50", "#a78bfa"], ["White Loaf", "$1.20", "#f472b6"]];
  return (
    <div className="relative h-full w-full bg-[#0a0612] text-white" style={{ fontSize: 7, lineHeight: 1.25 }}>
      <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(ellipse_at_50%_0%,rgba(124,58,237,0.35),transparent_70%)]" />
      <div className="absolute left-0 right-0 top-[7px] flex items-center justify-between px-[14px] text-[7px] font-semibold">
        <span>9:41</span>
        <span className="flex items-center gap-[2px]"><i className="h-[5px] w-[8px] rounded-[1px] bg-white/90" /><i className="h-[5px] w-[11px] rounded-[2px] bg-white/90" /></span>
      </div>
      <div className="absolute left-1/2 top-[6px] h-[11px] w-[38px] -translate-x-1/2 rounded-full bg-black" />
      <div className="relative px-2.5 pt-7">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="grid h-3.5 w-3.5 place-items-center rounded bg-gradient-to-br from-violet-500 to-indigo-600"><svg width="8" height="8" viewBox="0 0 64 64"><path d="M12 18l9 28 11-19 11 19 9-28" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            <b className="text-[8px]">WivaePOS</b>
          </div>
          <span className="flex items-center gap-[3px] rounded-full bg-emerald-400/15 px-1.5 py-[2px] text-[5.5px] font-semibold text-emerald-300"><i className="h-[4px] w-[4px] rounded-full bg-emerald-400" />Synced</span>
        </div>
        <div className="mt-2.5 rounded-xl bg-white/[0.06] p-2 ring-1 ring-white/10">
          <div className="text-[6px] text-white/45">Today's sales</div>
          <div className="text-[16px] font-bold leading-tight tabular-nums">$4,950.00</div>
          <div className="mt-1.5 flex h-[40px] items-end gap-[3px]">
            {bars.map((h, i) => <div key={i} className="flex-1 rounded-t-[2px] bg-gradient-to-t from-violet-600 to-violet-300" style={{ height: `${h}%` }} />)}
          </div>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <div className="rounded-lg bg-white/[0.06] p-1.5 ring-1 ring-white/10"><div className="text-[5.5px] text-white/45">Transactions</div><div className="text-[10px] font-bold">129</div></div>
          <div className="rounded-lg bg-white/[0.06] p-1.5 ring-1 ring-white/10"><div className="text-[5.5px] text-white/45">Customers</div><div className="text-[10px] font-bold">86</div></div>
        </div>
        <div className="mt-2 text-[6.5px] font-semibold text-white/60">Top products</div>
        <div className="mt-1 space-y-1">
          {top.map(([n, p, c]) => (
            <div key={n} className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-1.5 py-1.5 ring-1 ring-white/10">
              <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: c }} />
              <span className="min-w-0 flex-1 truncate text-[6.5px] text-white/85">{n}</span>
              <b className="text-[6.5px] tabular-nums">{p}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-x-2 bottom-3 flex items-center justify-around rounded-xl bg-white/[0.07] py-1.5 ring-1 ring-white/10">
        {["Home", "Sales", "Stock", "Staff"].map((t, i) => (
          <span key={t} className={`flex flex-col items-center gap-[2px] text-[5px] ${i === 0 ? "text-violet-300" : "text-white/45"}`}><i className={`h-[5px] w-[5px] rounded-[2px] ${i === 0 ? "bg-violet-400" : "bg-white/30"}`} />{t}</span>
        ))}
      </div>
      <div className="absolute bottom-[3px] left-1/2 h-[2px] w-9 -translate-x-1/2 rounded-full bg-white/70" />
    </div>
  );
}

// ── Thermal printer + receipt ───────────────────────────────────────────────

const PRINTER = { w: 120, d: 92, h: 54 };

/** Zig-zag tear edge along the BOTTOM of the receipt — the free end that hangs out of the printer. */
const TEAR = `polygon(0 0,100% 0,${Array.from({ length: 15 }, (_, i) => `${((14 - i) / 14) * 100}% ${i % 2 ? "calc(100% - 6px)" : "100%"}`).join(",")})`;

/** A QR-code look-alike: random modules from a fixed seed, with the three corner markers. Decoration, not a real code. */
const QR_N = 17;
const QR_CELLS = (() => {
  let seed = 11;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const cells = Array.from({ length: QR_N }, () => Array.from({ length: QR_N }, () => rnd() > 0.5));
  const marker = (ox: number, oy: number) => {
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
      const cx = ox + x, cy = oy + y;
      if (cx < 0 || cy < 0 || cx >= QR_N || cy >= QR_N) continue;
      const inside = x >= 0 && x <= 6 && y >= 0 && y <= 6;
      cells[cy][cx] = inside && (x === 0 || y === 0 || x === 6 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
    }
  };
  marker(0, 0); marker(QR_N - 7, 0); marker(0, QR_N - 7);
  return cells;
})();

function Qr({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${QR_N} ${QR_N}`} shapeRendering="crispEdges" aria-hidden="true">
      {QR_CELLS.flatMap((row, y) => row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#1c1d24" /> : null)))}
    </svg>
  );
}

/**
 * A compact Bluetooth thermal printer — the hardware sold with Standard and
 * Premium — with a receipt coming out of the slot. Origin = the middle of the
 * printer's footprint, on the table.
 */
function Printer() {
  const { w, d, h } = PRINTER;
  const dark = "linear-gradient(180deg,#34353d,#1d1e24)";
  const led: CSSProperties = { ...abs, bottom: 11, width: 24, height: 3, borderRadius: 2, background: "#34d399", boxShadow: "0 0 9px #34d399, 0 0 2px #a7f3d0" };
  return (
    <div style={{ ...abs, left: 0, top: 0, ...solid, transform: "translate3d(74px, 0, 182px) scale(1.08) rotateY(-30deg)" }}>
      {/* Top: laid flat. Its local "down" is towards the front of the printer. */}
      <div style={{ ...abs, left: -w / 2, top: -h, width: w, height: d, transformOrigin: "50% 0", transform: `translateZ(${-d / 2}px) rotateX(90deg)`, background: dark, borderRadius: "10px 10px 7px 7px", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 -10px 18px rgba(255,255,255,0.04)" }}>
        <div style={{ ...abs, left: 7, right: 7, top: 10, height: 1, background: "rgba(255,255,255,0.10)" }} />
        <div style={{ ...abs, left: 9, right: 9, bottom: 13, height: 5, borderRadius: 3, background: "#050507", boxShadow: "0 1px 0 rgba(255,255,255,0.10)" }} />
        <div style={{ ...abs, right: 11, bottom: 28, width: 5, height: 5, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 7px #34d399" }} />
        <div style={{ ...abs, left: 12, bottom: 27, width: 18, height: 7, borderRadius: 4, background: "linear-gradient(#45474f,#2e2f36)", boxShadow: "0 1px 0 rgba(0,0,0,0.5)" }} />
      </div>
      {/* Front, with its two green light bars */}
      <div style={{ ...abs, left: -w / 2, top: -h, width: w, height: h, transform: `translateZ(${d / 2}px)`, background: "linear-gradient(180deg,#2a2b32,#18191d)", borderRadius: "5px 5px 9px 9px", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)" }}>
        <div style={{ ...led, left: 14 }} /><div style={{ ...led, right: 14 }} />
        <div style={{ ...abs, left: "50%", top: 14, width: 26, height: 9, marginLeft: -13, borderRadius: 3, background: "rgba(255,255,255,0.06)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10)" }} />
      </div>
      {/* Right-hand side */}
      <div style={{ ...abs, left: w / 2 - d / 2, top: -h, width: d, height: h, transform: "rotateY(90deg)", background: "linear-gradient(90deg,#16171b,#272830)", borderRadius: 5 }} />
      <Receipt />
    </div>
  );
}

/**
 * The receipt: feeds out of the slot on the printer's top edge and ramps forward
 * and down over its front, ending on the table — how compact printers deliver it.
 * Hinged at the slot, so rotateX swings its lower end towards the viewer.
 */
function Receipt() {
  const { h, d } = PRINTER;
  const line: CSSProperties = { display: "flex", justifyContent: "space-between" };
  const rule: CSSProperties = { borderTop: "1px dashed #b9bcc6", margin: "3px 0" };
  return (
    <div
      style={{
        ...abs, left: -48, top: 0, width: 96, height: 100, transformOrigin: "50% 0",
        transform: `translate3d(0, ${-h}px, ${d / 2 - 14}px) rotateX(50deg)`,
        background: "linear-gradient(180deg,#eef0f4,#ffffff)", clipPath: TEAR,
        padding: "9px 8px 0", color: "#1c1d24", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 6.3, lineHeight: 1.3,
      }}
    >
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 8, letterSpacing: 0.5 }}>FRESH MART</div>
      <div style={rule} />
      <div style={line}><span>Coca-Cola 500ml</span><span>1.50</span></div>
      <div style={line}><span>Fresh Milk 1L</span><span>2.50</span></div>
      <div style={line}><span>Chicken 1kg</span><span>5.99</span></div>
      <div style={rule} />
      <div style={{ ...line, fontWeight: 700, fontSize: 7.4 }}><span>TOTAL · EcoCash</span><span>$9.99</span></div>
      <div style={{ display: "grid", placeItems: "center", marginTop: 4 }}><Qr size={24} /></div>
    </div>
  );
}

// ── The scene ───────────────────────────────────────────────────────────────

function Note({ tone, children }: { tone: "amber" | "green"; children: ReactNode }) {
  const c = tone === "amber"
    ? "border-amber-300/25 bg-[#1b1326] text-amber-200"
    : "border-emerald-300/25 bg-[#0f1f22] text-emerald-200";
  return <div className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium shadow-xl ${c}`}>{children}</div>;
}

const waiting = (
  <Note tone="amber"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />2 sales waiting to sync</Note>
);
const synced = (
  <Note tone="green"><span className="text-emerald-400"><IconCheck /></span>Back online — synced in seconds</Note>
);

export default function DeviceScene() {
  return (
    <div className="relative">
      <div className="device-scene" role="img" aria-label="The WivaePOS dashboard on a laptop and a phone, and a thermal printer with a receipt">
        <div className="device-stage">
          <div className="device-world">
            {/* Soft shadows and a pool of light on the table, so the devices sit on something. */}
            <div
              style={{
                ...abs, left: -330, top: 0, width: 660, height: 360, transformOrigin: "50% 0", transform: "translateZ(-130px) rotateX(90deg)",
                background:
                  "radial-gradient(ellipse 225px 56px at 55.5% 34%, rgba(0,0,0,0.7), transparent 72%)," +
                  "radial-gradient(ellipse 54px 26px at 25.5% 59%, rgba(0,0,0,0.66), transparent 72%)," +
                  "radial-gradient(ellipse 104px 42px at 61% 85%, rgba(0,0,0,0.68), transparent 72%)," +
                  "radial-gradient(ellipse 450px 150px at 52% 50%, rgba(139,92,246,0.32), transparent 70%)",
              }}
            />
            <Laptop />
            <Phone />
            <Printer />
          </div>
        </div>
      </div>

      {/* The offline story, in two notes — fixed in place, not scaled with the scene, so they stay readable. */}
      <div className="absolute -top-8 left-0 hidden sm:block">{waiting}</div>
      <div className="absolute -top-8 right-0 hidden sm:block">{synced}</div>
      <div className="mt-8 flex flex-wrap justify-center gap-2 sm:hidden">{waiting}{synced}</div>
    </div>
  );
}
