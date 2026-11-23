import React, { useState, useEffect, useRef } from 'react';
import {
  Users, UserCog, Edit3, TrendingUp, AlertTriangle, CheckCircle, RotateCcw,
  Save, Power, Settings2, Archive, CalendarDays, List, BarChart3, RefreshCw,
  Sliders, Trash2, Clock, Settings, X, UploadCloud, History,
  ShieldAlert, Key, Eye, Layers, Wrench, ArrowLeftRight,
  FileSpreadsheet, FileText, Inbox, Check, XCircle, Hourglass,
  ChevronDown, ChevronUp, Plus, Code2, Sparkles, Award, Download
} from 'lucide-react';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, updatePassword, onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, query, orderBy, limit, setDoc, getDoc, deleteDoc, writeBatch, onSnapshot, increment
} from 'firebase/firestore';

/* ======================================================
  1. إعدادات قاعدة البيانات (Firebase)
  ====================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyDrSPpzOlaC1CYRURzLWeI9crZwF5jV_QY",
  authDomain: "rolling-mill-tracker.firebaseapp.com",
  databaseURL: "https://rolling-mill-tracker-default-rtdb.firebaseio.com",
  projectId: "rolling-mill-tracker",
  storageBucket: "rolling-mill-tracker.firebasestorage.app",
  messagingSenderId: "528405881772",
  appId: "1:528405881772:web:30498fd387894331fb9009",
  measurementId: "G-3XR8MT7T3S"
};

let app, auth, db;
try {
  if (Object.keys(firebaseConfig).length > 0) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    // تخزين محلي: الشغل ما بيضيعش لو النت قطع، ويتبعت لما يرجع
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        ignoreUndefinedProperties: true
      });
    } catch (e) {
      db = getFirestore(app);
    }
  }
} catch (error) {
  console.error("Firebase init error:", error);
}

/* 12 ستاند أساسي: ستاند 1 .. ستاند 12 (مع دعم إضافة ستاندات جديدة بواسطة المدير) */
const DEFAULT_STANDS_CONFIG = [
  { type: 'بيضاوي', rollCode: '111', diameter: '380', hardness: '42 HRC', totalPasses: 6, maxLimit: 2500 },
  { type: 'مربع', rollCode: '207', diameter: '374', hardness: '45 HRC', totalPasses: 9, maxLimit: 2500 },
  { type: 'بيضاوي', rollCode: '307', diameter: '356', hardness: '46 HRC', totalPasses: 10, maxLimit: 2000 },
  { type: 'مربع', rollCode: '404', diameter: '400', hardness: '47 HRC', totalPasses: 15, maxLimit: 2000 },
  { type: 'بيضاوي', rollCode: '505', diameter: '371', hardness: '46 HRC', totalPasses: 14, maxLimit: 2000 },
  { type: 'مربع', rollCode: '604', diameter: '394', hardness: '47 HRC', totalPasses: 18, maxLimit: 2000 },
  { type: 'بيضاوي', rollCode: '70/ov', diameter: '340', hardness: '48 HRC', totalPasses: 15, maxLimit: 1500 },
  { type: 'دائري', rollCode: '804', diameter: '315', hardness: '45 HRC', totalPasses: 20, maxLimit: 1500 },
  { type: 'بيضاوي', rollCode: '90/ov', diameter: '345', hardness: '48 HRC', totalPasses: 19, maxLimit: 1000 },
  { type: '16 mm', rollCode: 'F16/15', diameter: '332', hardness: '51 HRC', totalPasses: 24, maxLimit: 1000 },
  { type: '', rollCode: '', diameter: '', hardness: '', totalPasses: 24, maxLimit: 1000 },
  { type: '', rollCode: '', diameter: '', hardness: '', totalPasses: 24, maxLimit: 1000 }
].map((c, i) => ({ ...c, id: String(i + 1), name: `ستاند ${i + 1}` }));

const SHIFTS_NORMAL = ['الوردية الأولى', 'الوردية الثانية', 'الوردية الثالثة'];
const SHIFTS_FRIDAY = ['الوردية الأولى (12 ساعة)', 'الوردية الثانية (12 ساعة)'];
const shiftsFor = (isFri) => (isFri ? SHIFTS_FRIDAY : SHIFTS_NORMAL);

const ROLE_TITLES = {
  tech: 'فني',
  engineer: 'مهندس',
  manager: 'مدير',
  admin: 'أدمن'
};

const createPassesArray = (count, activePassNum = 1, initialTons = 0) =>
  Array.from({ length: count }, (_, idx) => {
    const pNum = idx + 1;
    const isCurrent = pNum === activePassNum;
    return {
      passNumber: pNum,
      status: isCurrent ? 'active' : 'unused',
      tons: isCurrent ? initialTons : 0,
      order: isCurrent ? 1 : null,
      sizeLabel: ''
    };
  });

const buildStand = (cfg) => {
  const todayGB = new Date().toLocaleDateString('en-GB');
  return {
    id: String(cfg.id),
    name: cfg.name || `ستاند ${cfg.id}`,
    type: cfg.type || '',
    rollCode: cfg.rollCode || '',
    diameter: cfg.diameter || '',
    hardness: cfg.hardness || '',
    entryDate: todayGB,
    totalPasses: Number(cfg.totalPasses) || 10,
    activePass: 1,
    passes: createPassesArray(Number(cfg.totalPasses) || 10, 1, 0),
    isActive: true,
    accumulatedTons: 0,
    maxLimit: Number(cfg.maxLimit) || 1000,
    lastResetDate: todayGB,
    preCountedShifts: {}
  };
};
const buildInitialStands = () => DEFAULT_STANDS_CONFIG.map(buildStand);

const normalizeStand = (stand, fallbackCfg = {}) => {
  const totalPasses = Number(stand.totalPasses) || Number(fallbackCfg.totalPasses) || 10;
  const activePass = Number(stand.activePass) || 1;
  const currentTons = Number(stand.accumulatedTons) || 0;
  let passes = stand.passes;
  if (!Array.isArray(passes) || passes.length !== totalPasses) {
    passes = createPassesArray(totalPasses, activePass, currentTons);
  } else {
    passes = passes.map(p => p.passNumber === activePass
      ? { ...p, status: 'active', tons: currentTons, order: p.order || 1 } : p);
  }
  const idStr = String(stand.id ?? fallbackCfg.id ?? '1');
  return {
    ...stand,
    id: idStr,
    name: stand.name || fallbackCfg.name || `ستاند ${idStr}`,
    type: stand.type ?? fallbackCfg.type ?? '',
    rollCode: stand.rollCode ?? fallbackCfg.rollCode ?? '',
    diameter: stand.diameter ?? fallbackCfg.diameter ?? '',
    hardness: stand.hardness ?? fallbackCfg.hardness ?? '',
    entryDate: stand.entryDate || stand.lastResetDate || new Date().toLocaleDateString('en-GB'),
    maxLimit: Number(stand.maxLimit) || Number(fallbackCfg.maxLimit) || 1000,
    totalPasses,
    activePass,
    passes,
    preCountedShifts: stand.preCountedShifts || {}
  };
};

// يدعم الـ 12 ستاند الأساسية + أي ستاندات جديدة يضيفها المدير
const normalizeList = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) return buildInitialStands();
  const filtered = raw.filter(s => s && String(s.id) !== 'R.St');
  if (filtered.length === 0) return buildInitialStands();

  const normalized = filtered.map((s, idx) => {
    const cfg = DEFAULT_STANDS_CONFIG.find(c => c.id === String(s.id)) || DEFAULT_STANDS_CONFIG[idx] || {};
    return normalizeStand(s, cfg);
  });

  if (normalized.length < 12) {
    DEFAULT_STANDS_CONFIG.forEach(cfg => {
      if (!normalized.some(s => String(s.id) === cfg.id)) {
        normalized.push(buildStand(cfg));
      }
    });
  }

  return normalized.sort((a, b) => (Number(a.id) || 999) - (Number(b.id) || 999));
};

const LiveClock = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex bg-slate-800 border border-slate-700 rounded-lg px-2 py-0.5 items-center gap-1.5 shadow-inner shrink-0">
      <Clock className="w-3 h-3 text-blue-400 shrink-0" />
      <div className="flex flex-col items-center leading-none">
        <span className="text-[10px] font-mono font-bold text-slate-100 whitespace-nowrap" dir="ltr">
          {time.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <span className="text-[7px] text-slate-400 mt-0.5 whitespace-nowrap">
          {time.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </div>
    </div>
  );
};

/* دوال التاريخ */
const formatDateToISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const formatDateToGB = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const convertGBToISO = (gb) => {
  if (!gb || !gb.includes('/')) return formatDateToISO(new Date());
  const p = gb.split('/');
  if (p.length !== 3) return formatDateToISO(new Date());
  return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
};
const isISODateFriday = (iso) => {
  if (!iso || !iso.includes('-')) return false;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() === 5;
};

/* ======================================================
  التصدير (Excel / PDF) - للمدير فقط (بدون توقيع في الطباعة)
  ====================================================== */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* حماية محاولات تسجيل الدخول (على مستوى المتصفح - بتبطّأ التخمين لكنها مش بديل عن Firebase Auth) */
/* ستاندات بتتنفذ فيها طلبات الفني فوراً (من غير انتظار موافقة)، وبتروح للمدير للمراجعة والتأكيد */
const AUTO_APPLY_STANDS = [8, 9, 10, 11, 12];

/* تخصيص ممرات الستاند لمنتجات: productAlloc = [{ label: '10', count: 6 }, { label: '12-16-18', count: 4 }]
   بالترتيب من ممر 1: أول شريحة بتاخد أول (count) ممر، وهكذا */
const allocSegments = (stand) => (Array.isArray(stand && stand.productAlloc)
  ? stand.productAlloc.filter(a => a && a.label && Number(a.count) > 0)
  : []);
const passLabelOf = (stand, passNumber) => {
  let end = 0;
  for (const a of allocSegments(stand)) {
    end += Number(a.count);
    if (Number(passNumber) <= end) return String(a.label);
  }
  return '';
};
const labelHasSize = (label, size) => String(label).split('-').map(x => x.trim()).includes(String(size));

const GUARD_KEY = 'gioshy_login_guard';
const readGuard = () => { try { return JSON.parse(localStorage.getItem(GUARD_KEY)) || { fails: 0, until: 0 }; } catch { return { fails: 0, until: 0 }; } };
const writeGuard = (g) => { try { localStorage.setItem(GUARD_KEY, JSON.stringify(g)); } catch { /* ignore */ } };

/* الأدمن له إيميل ثابت. باقي الأفراد إيميلهم بيتولّد من الكود (مشفّر)، والكود نفسه هو كلمة المرور */
const ADMIN_EMAIL = 'admin@gioshy.local';
const sha256Hex = async (s) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};
const staffEmailFor = async (code) => `s${(await sha256Hex('gioshy|' + code)).slice(0, 24)}@gioshy.local`;

/* التحقق من صورة اللوجو: صور مسموحة فقط */
const isValidLogo = (s) => /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s) || /^https:\/\/[^\s"'<>]+$/.test(s);

/* شاشة بديلة بدل الشاشة البيضاء لو حصل خطأ غير متوقع */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { console.error('App crashed:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div dir="rtl" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#fff', padding: 24, textAlign: 'center' }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>حصل خطأ غير متوقع</h2>
            <p style={{ opacity: 0.8, marginBottom: 16 }}>بياناتك محفوظة. اضغط تحديث وكمل شغل.</p>
            <button onClick={() => window.location.reload()} style={{ background: '#f59e0b', color: '#0f172a', fontWeight: 800, padding: '10px 20px', borderRadius: 8 }}>تحديث الصفحة</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* توقيع مصمم النظام على التقارير */
const DESIGNER_NAME = 'Bassam Waleed';
const REPORT_CREDIT = `<div class="credit">System designed &amp; developed by <span class="nm">${DESIGNER_NAME}</span></div>`;

const REPORT_CREDIT_CSS = `
  .credit{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:10px;color:#444;letter-spacing:.5px;text-align:center}
  .credit .nm{font-style:normal;font-weight:bold;color:#0b3d7a;letter-spacing:1.2px}`;

const reportStamp = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return {
    now,
    dateStr: `${pad(now.getDate())} / ${pad(now.getMonth() + 1)} / ${now.getFullYear()}`,
    stamp: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${now.getHours()}:${pad(now.getMinutes())}`
  };
};

const reportLogoHtml = (logo) => (logo && isValidLogo(logo)
  ? `<img src="${esc(logo)}" style="height:46px" alt="logo">`
  : '<div style="font-weight:bold;font-size:18px">الجيوشي للصلب<br>ALGIOSHY STEEL</div>');

/* ---------- تقرير الممرات (نموذج GS-PLD/F-001) ---------- */
const buildPassReportHTML = ({ stands, archive, logo, productSize }) => {
  const { now, dateStr, stamp } = reportStamp();
  const monthEn = now.toLocaleString('en-US', { month: 'long' });
  const COLS = Math.max(26, ...stands.map(s => (s.passes || []).length));
  const standNo = (s) => (/^\d+$/.test(String(s.id)) ? String(s.id) : esc(s.name));

  const standRows = stands.map(s => {
    const passes = s.passes || [];
    const total = passes.reduce((a, p) => a + (Number(p.tons) || 0), 0);
    const off = s.isActive === false;
    // الصف العلوي: ترتيب التشغيل (أصفر)، وفي الممرات اللي لسه ما اتشغلتش بيظهر المنتج المخصص لها
    let orderCells = '';
    for (let i = 0; i < COLS;) {
      const p = passes[i];
      if (!p) { orderCells += '<td class="x"></td>'; i++; continue; }
      if (p.order) { orderCells += `<td class="ord">${esc(p.order)}</td>`; i++; continue; }
      const lbl = passLabelOf(s, p.passNumber || i + 1);
      if (!lbl) { orderCells += '<td class="oe"></td>'; i++; continue; }
      let j = i + 1;
      while (j < COLS && passes[j] && !passes[j].order && passLabelOf(s, passes[j].passNumber || j + 1) === lbl) j++;
      orderCells += `<td class="lab" colspan="${j - i}">${esc(lbl)} mm</td>`;
      i = j;
    }
    const tonCells = Array.from({ length: COLS }, (_, i) => {
      const p = passes[i];
      if (!p) return '<td class="x"></td>';
      const tons = Math.round(Number(p.tons) || 0);
      if (p.status === 'active') return `<td class="cur">${tons}</td>`;
      if (p.status === 'used') return `<td class="done">${tons}</td>`;
      return `<td class="un">${tons}</td>`;
    }).join('');
    const lead = (txt, cls = '') => `<td rowspan="2" class="${cls}">${txt}</td>`;
    return `<tr class="${off ? 'off' : ''}">${lead('Stand', 'lbl')}${lead(`<b>${standNo(s)}</b>${off ? '<div class="offtag">OFF</div>' : ''}`)}${lead(esc(s.type || ''), 'sm')}${lead(`<b>${esc(s.rollCode || '')}</b>`)}${lead(esc(s.diameter || ''))}${lead(esc(s.hardness || ''), 'sm')}${lead(esc(s.entryDate || ''), 'entry')}${lead(esc(s.totalPasses || ''), 'pn')}${orderCells}${lead(`<b>${Math.round(total)}</b>`, 'tot')}${lead(esc(s.maxLimit || ''), 'req')}</tr><tr class="${off ? 'off' : ''}">${tonCells}</tr>`;
  }).join('');

  const asc = [...archive].filter(l => l.productSize).sort((x, y) => x.timestamp - y.timestamp);
  const sched = [];
  let prev = null;
  asc.forEach(l => {
    const cur = String(l.productSize);
    if (prev !== null && cur !== prev) sched.push({ date: l.date, from: prev, to: cur });
    prev = cur;
  });
  const schedRows = sched.slice(-6).map((c, i) => `<tr><td>${esc(c.date)}</td><td>${esc(c.from)} mm</td><td>To</td><td>${esc(c.to)} mm</td><td>تغيير منتج</td><td>${i + 1}</td></tr>`).join('')
    || '<tr><td colspan="6">-</td></tr>';
  const avrRows = stands.map(s => `<tr><td>STAND ${standNo(s)}</td><td>${esc(s.activePass)}</td><td>${esc(s.maxLimit)} Ton</td></tr>`).join('');
  const allocStands = stands.filter(s => allocSegments(s).length);
  const allocTable = allocStands.length
    ? `<table class="low" style="width:100%;margin-top:6px"><tr><th colspan="2" style="background:#e4dfec">PASSES ALLOCATION BY PRODUCT &nbsp;|&nbsp; تخصيص الممرات للمنتجات</th></tr>${allocStands.map(s => `<tr><td>STAND ${standNo(s)}</td><td>${allocSegments(s).map(a => `${esc(a.label)} mm × ${esc(a.count)}`).join(' &nbsp;|&nbsp; ')}</td></tr>`).join('')}</table>`
    : '';

  return `<html dir="ltr" lang="en" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8">
<title>Daily Report Of Pass Change</title>
<style>
  @page{size:A4 landscape;margin:7mm}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:'Times New Roman',Tahoma,serif;color:#000;margin:0;padding:0}
  #sheet{width:1065px;margin:0 auto;page-break-inside:avoid}
  table{border-collapse:collapse}
  .hd{width:100%;border:2px solid #000;margin-bottom:2px}
  .hd td{padding:4px 8px;vertical-align:middle}
  .ttl{background:#ffff00;font-weight:bold;font-size:15px;text-align:center;padding:2px 14px;display:inline-block}
  .ar{background:#ddd9c4;border:2px solid #000;font-weight:bold;font-size:14px;text-align:center;padding:2px 20px;display:inline-block;margin-top:3px}
  .pbadge{background:#0070c0;color:#fff;font-weight:bold;font-size:14px;padding:1px 14px;display:inline-block;margin-top:3px}
  .code{font-size:22px;font-weight:bold;text-align:center}
  table.main{width:100%;font-size:9px;table-layout:fixed}
  table.main th,table.main td{border:1px solid #000;text-align:center;padding:0;height:14px;font-style:italic}
  table.main th{background:#fff;font-weight:bold;font-size:8px;font-style:normal}
  .lbl{font-weight:bold;font-style:italic;font-size:8px}
  .sm{font-size:8px}
  .entry{font-weight:bold;font-size:8px;background:#d7e4bc}
  .pn{background:#d7e4bc;font-weight:bold;font-size:12px}
  .ord{background:#ffff00;font-weight:bold}
  .oe{background:#fff}
  .lab{background:#e4dfec;font-weight:bold;font-style:normal;font-size:8px}
  .cur{background:#000;color:#fff;font-weight:bold}
  .done{background:#b7d0ea;font-weight:bold}
  .un{background:#fff}
  .x{background:#d7e4bc}
  .tot{background:#000;color:#fff;font-size:11px}
  .req{font-size:8px}
  tr.off td{background:#d9d9d9!important;color:#555!important}
  .offtag{font-size:7px;font-weight:bold;color:#c00}
  .low td,.low th{border:1px solid #000;font-size:7.5px;padding:1px 3px;line-height:1.15;text-align:center}
  .low th{background:#f2dcdb}
  .foot{font-size:8px;font-weight:bold;font-style:italic}
  ${REPORT_CREDIT_CSS}
</style></head><body>
<div id="sheet">
<table class="hd"><tr>
  <td style="width:26%;border-right:2px solid #000">${reportLogoHtml(logo)}</td>
  <td style="text-align:center"><div class="ttl">Daily Report Of Pass Change</div><br><div class="ar">التقرير اليومى لتغيير الممرات</div><br><div style="font-weight:bold;font-size:14px;border:2px solid #000;display:inline-block;padding:0 40px;margin-top:3px">${esc(dateStr)}</div><br><div class="pbadge">${esc(productSize)} mm</div></td>
  <td style="width:26%;border-left:2px solid #000;text-align:center"><div class="code">GS-PLD/F-001</div><div style="font-size:10px;margin-top:8px"><b>DATE</b> &nbsp; ${esc(stamp)}</div></td>
</tr></table>

<table class="main">
<colgroup><col style="width:3.2%"><col style="width:2.6%"><col style="width:3.4%"><col style="width:4.2%"><col style="width:2.8%"><col style="width:4%"><col style="width:5.2%"><col style="width:2.8%">${Array.from({ length: COLS }, () => `<col style="width:${(61 / COLS).toFixed(2)}%">`).join('')}<col style="width:4%"><col style="width:3.6%"></colgroup>
<tr><th>Stand</th><th>No.</th><th></th><th>CODE</th><th>Dia.</th><th>HARD-<br>NESS</th><th>Entry Date<br>For Line</th><th>PASS<br>No</th>${Array.from({ length: COLS }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>TOTAL<br>TON</th><th>الإنتاجية<br>المطلوبة</th></tr>
${standRows}
</table>

<table style="width:100%;margin-top:10px"><tr>
  <td style="width:34%;vertical-align:top">
    <table class="low" style="width:100%">
      <tr><th colspan="6" style="background:#fff">( SCHEDULE OF CHANGE TYPE OF PRODUCT ) ${esc(monthEn)} <span style="color:#c00">${now.getFullYear()}</span></th></tr>
      ${schedRows}
    </table>
  </td>
  <td style="width:26%;vertical-align:top;padding:0 10px">
    <table class="low" style="width:100%">
      <tr><th>STAND</th><th>Pass No.</th><th>Avr.</th></tr>
      ${avrRows}
    </table>
  </td>
  <td style="vertical-align:top">
    <table class="low" style="width:100%">
      <tr><td class="cur" style="width:60px">0</td><td style="text-align:right">الممر الحالي وإجمالي الإنتاجية حتى تاريخه</td></tr>
      <tr><td class="done">2500</td><td style="text-align:right">ممر منتهي وإجمالي إنتاجيته</td></tr>
      <tr><td style="background:#d9d9d9">OFF</td><td style="text-align:right">ستاند متوقف</td></tr>
    </table>
    ${allocTable}
  </td>
</tr></table>

<table style="width:100%;margin-top:12px"><tr>
  <td class="foot" style="width:30%;text-align:left">Issue No 1 /Revision 0</td>
  <td style="text-align:center">${REPORT_CREDIT}</td>
  <td class="foot" style="width:30%;text-align:right">Issue Date 1 /1/2025</td>
</tr></table>
</div>
<script>
(function () {
  /* بيصغّر الورقة تلقائياً لو طولها أكبر من صفحة A4 بالعرض، عشان تتطبع في صفحة واحدة */
  function fit() {
    var s = document.getElementById('sheet');
    if (!s) return;
    s.style.zoom = 1;
    var max = 730, h = s.scrollHeight;
    if (h > max) s.style.zoom = max / h;
  }
  window.addEventListener('load', fit);
  window.addEventListener('beforeprint', fit);
})();
</script>
</body></html>`;
};

/* ---------- التقرير اليومي (سجل الإنتاج + تغييرات الممرات) ---------- */
const buildDailyReportHTML = ({ archive, changes, billetWeight, logo, stands = [] }) => {
  const { dateStr, stamp } = reportStamp();
  const th = (arr) => `<tr>${arr.map(h => `<th>${esc(h)}</th>`).join('')}</tr>`;
  const td = (arr) => `<tr>${arr.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`;
  const logs = [...archive].sort((a, b) => b.timestamp - a.timestamp);
  const archiveRows = logs.map(l => td([l.date, l.dayName, l.shift, l.productSize || '', l.billets, Number(l.tons).toFixed(1), l.recordedBy || '-', l.time])).join('');
  const sumT = logs.reduce((a, l) => a + l.tons, 0).toFixed(1);
  const sumB = logs.reduce((a, l) => a + l.billets, 0);
  const changeRows = changes.map(c => td([c.date, c.shift, c.standName,
    c.kind === 'newRoll' ? `درفيل جديد (قطر ${c.newDiameter || '-'}) يبدأ من ممر ${c.toPass}` : `ممر ${c.fromPass} ← ممر ${c.toPass}`,
    Number(c.tons).toFixed(1), c.billetsAtChange || 0, c.productSize || '', c.requestedBy || '-', c.approvedBy || '-', c.notes || ''])).join('');

  const allocStands = stands.filter(s => allocSegments(s).length);
  const allocRows = allocStands.map(s => {
    let from = 1;
    const parts = allocSegments(s).map(a => { const f = from; from += Number(a.count); return `${a.label} مم: ممر ${f}${Number(a.count) > 1 ? '–' + (from - 1) : ''}`; });
    const rest = Number(s.totalPasses) - (from - 1);
    return td([s.name, s.rollCode || '-', parts.join('  |  '), rest > 0 ? `${rest} ممر` : '-']);
  }).join('');
  const allocSection = allocStands.length
    ? `<h2>توزيع الممرات على المنتجات</h2><table class="dt">${th(['الستاند', 'كود الدرفيل', 'التوزيع', 'غير مخصص'])}${allocRows}</table>`
    : '';

  return `<html dir="rtl" lang="ar" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8">
<title>Daily Production Report</title>
<style>
  @page{size:A4 portrait;margin:10mm}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:Tahoma,Arial,sans-serif;color:#0f172a;margin:0;padding:8px}
  table{border-collapse:collapse}
  .hd{width:100%;border:2px solid #0f172a;margin-bottom:10px}
  .hd td{padding:6px 10px;vertical-align:middle}
  .t1{font-size:17px;font-weight:bold}
  .t2{font-family:Georgia,'Times New Roman',serif;font-size:12px;color:#475569;font-style:italic}
  h2{font-size:13px;margin:16px 0 6px;border-right:4px solid #2563eb;padding-right:8px}
  table.dt{width:100%;font-size:10px;margin-bottom:8px}
  table.dt th{background:#0f172a;color:#fff;padding:5px;border:1px solid #334155}
  table.dt td{padding:4px;border:1px solid #cbd5e1;text-align:center}
  table.dt tr:nth-child(even) td{background:#f1f5f9}
  table.dt tr.tt td{font-weight:bold;background:#dbeafe!important}
  tr{break-inside:avoid}
  .cr{margin-top:22px;padding-top:6px;border-top:1px solid #94a3b8}
  ${REPORT_CREDIT_CSS}
</style></head><body>
<table class="hd"><tr>
  <td style="width:28%">${reportLogoHtml(logo)}</td>
  <td style="text-align:center"><div class="t1">التقرير اليومي للإنتاج</div><div class="t2">Daily Production Report</div></td>
  <td style="width:28%;text-align:left;font-size:11px"><b>${esc(dateStr)}</b><br>${esc(stamp)}<br>وزن البليت: ${esc(billetWeight)} طن</td>
</tr></table>
<h2>سجل الإنتاج اليومي</h2>
<table class="dt">${th(['التاريخ', 'اليوم', 'الوردية', 'المقاس', 'البليت', 'الطن', 'المسجل باسم', 'وقت التسجيل'])}${archiveRows}
<tr class="tt"><td colspan="4">الإجمالي</td><td>${sumB}</td><td>${sumT}</td><td colspan="2"></td></tr></table>
<h2>سجل تغيير الممرات والدرافيل</h2>
<table class="dt">${th(['التاريخ', 'الوردية', 'الستاند', 'التغيير', 'إنتاج الممر/الدرفيل (طن)', 'بليت إضافي', 'المقاس', 'طلب بواسطة', 'اعتماد بواسطة', 'ملاحظات'])}${changeRows}</table>
${allocSection}
<div class="cr">${REPORT_CREDIT}</div>
</body></html>`;
};

const buildReportHTML = (data, kind = 'pass') => (kind === 'daily' ? buildDailyReportHTML(data) : buildPassReportHTML(data));

const downloadExcel = (data, kind = 'pass') => {
  const html = '\ufeff' + buildReportHTML(data, kind);
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${kind === 'daily' ? 'التقرير-اليومي' : 'تقرير-الممرات'}-${formatDateToISO(new Date())}.xls`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

const printPDF = (data, onBlocked, kind = 'pass') => {
  const w = window.open('', '_blank');
  if (!w) { onBlocked && onBlocked(); return; }
  w.document.open();
  w.document.write(buildReportHTML(data, kind) + '<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script>');
  w.document.close();
};

/* ======================================================
  دالة حساب تقسيم البليت والأطنان بين الممر القديم والجديد
  ====================================================== */
const computePassSplit = (stand, shiftDateGB, shiftName, oldBilletsInput, billetWeight, archive) => {
  const currentTons = Number(stand.accumulatedTons) || 0;
  const oldShiftBillets = Number(oldBilletsInput) || 0;
  const oldShiftExtraTons = oldShiftBillets * billetWeight;

  const shiftLog = (archive || []).find(l => l.date === shiftDateGB && l.shift === shiftName);
  const isShiftAlreadyLogged = Boolean(shiftLog);

  const shiftKey = `${shiftDateGB}__${shiftName}`;
  const prevPreCounted = Number((stand.preCountedShifts || {})[shiftKey] || 0);

  if (oldShiftBillets <= 0) {
    return {
      isShiftAlreadyLogged,
      finalOldPassTons: currentTons,
      newPassOpeningTons: 0,
      newPreCountedForShift: prevPreCounted,
      deductedLaterBillets: 0,
      transferredNowBillets: 0
    };
  }

  if (isShiftAlreadyLogged) {
    const netShiftTonsInStand = Math.max(0, Number(shiftLog.tons) - (prevPreCounted * billetWeight));
    const baseTonsBeforeShift = Math.max(0, currentTons - netShiftTonsInStand);
    const finalOldPassTons = baseTonsBeforeShift + oldShiftExtraTons;
    const newPassOpeningTons = Math.max(0, netShiftTonsInStand - oldShiftExtraTons);
    const transferredNowBillets = Math.max(0, (Number(shiftLog.billets) - prevPreCounted) - oldShiftBillets);

    return {
      isShiftAlreadyLogged: true,
      finalOldPassTons,
      newPassOpeningTons,
      newPreCountedForShift: prevPreCounted,
      deductedLaterBillets: 0,
      transferredNowBillets
    };
  } else {
    const finalOldPassTons = currentTons + oldShiftExtraTons;
    const newPassOpeningTons = 0;
    const newPreCountedForShift = prevPreCounted + oldShiftBillets;

    return {
      isShiftAlreadyLogged: false,
      finalOldPassTons,
      newPassOpeningTons,
      newPreCountedForShift,
      deductedLaterBillets: newPreCountedForShift,
      transferredNowBillets: 0
    };
  }
};

/* ======================================================
  تطبيق تغيير ممر / درفيل على قائمة الستاندات
  ====================================================== */
const applyPassChange = (list, req, billetWeight, approver, archive) => {
  const idx = list.findIndex(s => String(s.id) === String(req.standId));
  if (idx < 0) return null;
  const st = { ...list[idx], preCountedShifts: { ...(list[idx].preCountedShifts || {}) } };
  const prev = st.activePass;
  const base = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    standId: st.id, standName: st.name, date: req.date,
    time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    shift: req.shift, productSize: req.productSize,
    requestedBy: req.requestedBy || approver, approvedBy: approver
  };
  let log;

  if (req.kind === 'newRoll') {
    const newTotalPasses = Math.max(1, Math.min(40, Number(req.newTotalPasses) || st.totalPasses));
    const startPass = Math.max(1, Math.min(newTotalPasses, Math.floor(Number(req.startPass)) || 1));
    const oldBillets = Number(req.billets) || 0;

    // إنتاج الدرفيل القديم: بنفس منطق تغيير الممر (البليت اللي اشتغله قبل التغيير في الوردية)
    const split = computePassSplit(st, req.date, req.shift, oldBillets, billetWeight, archive);
    const total = st.passes.reduce((a, p) => a + (p.passNumber === prev ? 0 : (Number(p.tons) || 0)), 0) + split.finalOldPassTons;
    const shiftKey = `${req.date}__${req.shift}`;

    if (req.newRollCode !== undefined) st.rollCode = req.newRollCode;
    if (req.newDiameter !== undefined && req.newDiameter !== '') st.diameter = req.newDiameter;
    if (req.newHardness !== undefined && req.newHardness !== '') st.hardness = req.newHardness;
    if (req.newType !== undefined && req.newType !== '') st.type = req.newType;
    if (req.newMaxLimit !== undefined && Number(req.newMaxLimit) >= 100) st.maxLimit = Number(req.newMaxLimit);
    st.totalPasses = newTotalPasses;
    st.entryDate = req.date || new Date().toLocaleDateString('en-GB');
    st.lastResetDate = st.entryDate;
    st.activePass = startPass;
    st.accumulatedTons = split.newPassOpeningTons;
    st.preCountedShifts = split.newPreCountedForShift > 0 ? { [shiftKey]: split.newPreCountedForShift } : {};
    st.passes = createPassesArray(newTotalPasses, startPass, split.newPassOpeningTons);

    const specSummary = [
      st.diameter && `قطر ${st.diameter}`,
      st.hardness && `صلابة ${st.hardness}`,
      `${newTotalPasses} ممر`,
      startPass > 1 && `يبدأ من ممر ${startPass}`
    ].filter(Boolean).join(' - ');
    const billetNote = oldBillets > 0
      ? (split.isShiftAlreadyLogged
          ? ` — إضافة ${oldBillets} بليت للدرفيل القديم وتحويل باقي الوردية (${split.transferredNowBillets} بليت) للدرفيل الجديد`
          : ` — إضافة ${oldBillets} بليت للدرفيل القديم (سيتم خصمها تلقائياً عند تسجيل ${req.shift})`)
      : '';

    log = {
      ...base,
      kind: 'newRoll',
      fromPass: prev,
      toPass: startPass,
      tons: total,
      billetsAtChange: oldBillets,
      newDiameter: st.diameter,
      newTotalPasses,
      notes: (req.notes ? `${req.notes} (${specSummary})` : `تركيب درفيل جديد (${specSummary})`) + billetNote
    };
  } else {
    const target = Number(req.targetPass) || prev;
    const oldBillets = Number(req.billets) || 0;

    const split = computePassSplit(st, req.date, req.shift, oldBillets, billetWeight, archive);
    const finalOld = split.finalOldPassTons;
    const opening = split.newPassOpeningTons;

    const shiftKey = `${req.date}__${req.shift}`;
    if (split.newPreCountedForShift > 0) {
      st.preCountedShifts[shiftKey] = split.newPreCountedForShift;
    }

    const maxOrder = Math.max(0, ...st.passes.map(p => p.order || 0));
    st.passes = st.passes.map(p => {
      if (p.passNumber === prev && prev !== target)
        return { ...p, status: 'used', tons: finalOld, order: p.order || Math.max(1, maxOrder) };
      if (p.passNumber === target)
        return { ...p, status: 'active', tons: opening,
          order: prev === target ? (p.order || 1) : (p.order ? p.order : maxOrder + 1) };
      return p;
    });
    st.activePass = target;
    st.accumulatedTons = opening;
    st.lastResetDate = req.date;

    const autoNote = oldBillets > 0
      ? (split.isShiftAlreadyLogged
          ? `إضافة ${oldBillets} بليت للممر ${prev} وتحويل باقي الوردية (${split.transferredNowBillets} بليت) للممر ${target}`
          : `إضافة ${oldBillets} بليت للممر ${prev} (سيتم خصمها تلقائياً عند تسجيل ${req.shift})`)
      : `نقل من ممر ${prev} إلى ممر ${target}`;

    log = {
      ...base,
      kind: 'pass',
      fromPass: prev,
      toPass: target,
      tons: finalOld,
      billetsAtChange: oldBillets,
      notes: req.notes ? `${req.notes} — ${autoNote}` : autoNote
    };
  }
  const newList = [...list]; newList[idx] = st;
  return { list: newList, log };
};

const Overlay = ({ z = 50, children }) => (
  <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-3 backdrop-blur-sm" style={{ zIndex: z }}>{children}</div>
);

/* ======================================================
  التطبيق الرئيسي
  ====================================================== */
/* خانة وزن البليت: بتتحفظ لما تخلّص كتابة (مش مع كل رقم) وبتقبل قيمة منطقية بس */
const WeightControl = ({ value, onCommit }) => {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const v = Number(draft);
    if (v >= 0.1 && v <= 5) { if (v !== Number(value)) onCommit(v); }
    else setDraft(String(value));
  };
  return (
    <input
      type="number" step="0.01" min="0.1" max="5" value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className="w-20 p-1 border border-slate-300 rounded text-center font-mono font-bold text-xs bg-white outline-none focus:border-blue-500"
    />
  );
};

/* نسبة تنبيه الممرات (للأدمن): 50 إلى 100 */
const PercentControl = ({ value, onCommit }) => {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const v = Math.round(Number(draft));
    if (v >= 50 && v <= 100) { if (v !== Number(value)) onCommit(v); setDraft(String(v)); }
    else setDraft(String(value));
  };
  return (
    <input
      type="number" step="1" min="50" max="100" value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className="w-20 p-1 border border-slate-300 rounded text-center font-mono font-bold text-xs bg-white outline-none focus:border-blue-500"
    />
  );
};

/* الجلسة: التطبيق المثبّت على الموبايل بيتقفل ويتفتح كتير، فبنكمل بنفس الشخص خلال 12 ساعة من آخر فتح */
const SESSION_KEY = 'gioshy_session';
const SESSION_TTL = 12 * 60 * 60 * 1000;
const saveSession = (uid) => { try { localStorage.setItem(SESSION_KEY, JSON.stringify({ uid, at: Date.now() })); } catch { /* ignore */ } };
const clearSession = () => { try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } };

/* التثبيت كتطبيق (PWA): بنلتقط حدث التثبيت بدري لأنه بييجي قبل ما شاشة الدخول تظهر */
let installPromptEvent = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPromptEvent = e;
    window.dispatchEvent(new Event('gioshy-installable'));
  });
  window.addEventListener('appinstalled', () => {
    installPromptEvent = null;
    window.dispatchEvent(new Event('gioshy-installable'));
  });
}
const InstallButton = () => {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const h = () => force(n => n + 1);
    window.addEventListener('gioshy-installable', h);
    return () => window.removeEventListener('gioshy-installable', h);
  }, []);
  const standalone = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  if (!installPromptEvent || standalone) return null;
  const install = async () => {
    const ev = installPromptEvent;
    installPromptEvent = null;
    ev.prompt();
    try { await ev.userChoice; } catch { /* ignore */ }
    force(n => n + 1);
  };
  return (
    <button type="button" onClick={install}
      className="w-full mt-3 flex items-center justify-center gap-2 p-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700/50 text-xs font-bold transition-colors">
      <Download className="w-4 h-4" /> تثبيت التطبيق على الموبايل
    </button>
  );
};

/* توقيع فريق التطوير (شاشة الدخول + الشريط السفلي) */
const Credits = ({ onClick, compact = false }) => (
  <button
    type="button"
    onClick={onClick}
    title="عرض بطاقة فريق تطوير وإشراف النظام"
    className={`group rounded-xl border border-slate-600/70 hover:border-amber-300/70 bg-slate-900/80 hover:bg-slate-900 transition-colors ${compact ? 'w-auto px-3 py-1' : 'w-full px-4 py-3'}`}
  >
    <div className={compact ? 'flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5' : 'flex flex-col gap-2'}>
      <div className="flex items-center justify-center gap-2">
        <Award className="w-3.5 h-3.5 text-sky-300 shrink-0" />
        <span className="text-[10px] font-bold text-slate-400"> فريق العمل</span>
        <span className="text-xs font-black text-sky-300">الباشمهندس حسين</span>

      </div>
      {compact
        ? <span className="hidden sm:block w-px h-3.5 bg-slate-600" />
        : <div className="h-px w-1/2 mx-auto bg-slate-700" />}
      <div className="flex items-center justify-center gap-2">
        <Code2 className="w-3.5 h-3.5 text-amber-300 shrink-0 group-hover:rotate-12 transition-transform" />
        <span className="text-[10px] font-bold text-slate-400">تصميم وتطوير</span>
        <span className="text-xs font-black text-amber-300">بسام وليد</span>
      </div>
    </div>
  </button>
);

function App() {
  const [currentUser, setCurrentUser] = useState('none'); // 'none' | 'tech' | 'engineer' | 'manager' | 'admin'
  const [loggedUserInfo, setLoggedUserInfo] = useState({ name: '', roleTitle: '', code: '' });
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [userAuth, setUserAuth] = useState(null);
  const appId = 'al-gioshy-steel-rolls';

  // نافذة بطاقة فريق تطوير وإشراف النظام
  const [devModalOpen, setDevModalOpen] = useState(false);

  // الصلاحيات
  const isManagerLike = currentUser === 'manager' || currentUser === 'admin' || currentUser === 'engineer';
  const canManageUsers = currentUser === 'admin' || isSuperAdmin;
  const canAddStand = currentUser === 'admin' || isSuperAdmin;
  const canApplyDirect = (standId) => isManagerLike || AUTO_APPLY_STANDS.includes(Number(standId));
  const isAdminRole = currentUser === 'admin' || isSuperAdmin;
  const canRecordShift = currentUser === 'tech' || currentUser === 'engineer' || currentUser === 'admin';

  const roleLabel = loggedUserInfo.name
    ? `${loggedUserInfo.roleTitle}: ${loggedUserInfo.name}`
    : (ROLE_TITLES[currentUser] || 'مستخدم');

  const [isManagerToolbarOpen, setIsManagerToolbarOpen] = useState(false);

  const secretTapCount = useRef(0);
  const secretTapTimer = useRef(null);
  const handleSecretAdminTrigger = () => {
    secretTapCount.current += 1;
    if (secretTapTimer.current) clearTimeout(secretTapTimer.current);
    if (secretTapCount.current >= 5) {
      secretTapCount.current = 0;
      if (isSuperAdmin) { setCurrentUser('admin'); setActiveTab('admin'); }
      else setLoginPrompt({ isOpen: true, role: 'admin', codeInput: '', error: '' });
    } else {
      secretTapTimer.current = setTimeout(() => { secretTapCount.current = 0; }, 1500);
    }
  };

  const [stands, setStands] = useState(buildInitialStands);
  const [shiftBillets, setShiftBillets] = useState('');
  const [productionArchive, setProductionArchive] = useState([]);
  const [passChanges, setPassChanges] = useState([]);
  const [pendingList, setPendingList] = useState([]);
  const [staffAccounts, setStaffAccounts] = useState([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const [billetWeight, setBilletWeight] = useState(0.75);
  const [alertPercent, setAlertPercent] = useState(80);
  const [alertExpanded, setAlertExpanded] = useState(false);
  const [passReportOpen, setPassReportOpen] = useState(false);
  const [allocOpenFor, setAllocOpenFor] = useState(null);
  const [allocRows, setAllocRows] = useState([]);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityList, setActivityList] = useState([]);
  const backupInputRef = useRef(null);
  const [selectedProductSize, setSelectedProductSize] = useState('16');
  const [customLogo, setCustomLogo] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempLogoUrl, setTempLogoUrl] = useState('');

  // نافذة إدارة أكواد الأفراد والمهندسين (للمدير)
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [newStaffForm, setNewStaffForm] = useState({ name: '', code: '', role: 'tech' });

  // نافذة إضافة ستاند جديد (للمدير فقط)
  const [addStandModalOpen, setAddStandModalOpen] = useState(false);
  const [newStandForm, setNewStandForm] = useState({
    name: '', type: 'بيضاوي', diameter: '320', hardness: '50 HRC', rollCode: '', totalPasses: 20, maxLimit: 1000
  });

  const [adminState, setAdminState] = useState({
    isMaintenance: false,
    maintenanceMessage: 'الموقع مغلق حالياً لإجراء تحديثات وصيانة للنظام.. يرجى المحاولة لاحقاً.',
    visitsCount: 0, lastVisit: ''
  });
  const [loginPrompt, setLoginPrompt] = useState({ isOpen: false, role: '', codeInput: '', error: '' });
  const [quickCode, setQuickCode] = useState('');
  const [quickError, setQuickError] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const [visitLogged, setVisitLogged] = useState(false);

  const [rollModal, setRollModal] = useState({ isOpen: false, standIndex: null, isEditingInfo: false });
  const [rollEditForm, setRollEditForm] = useState({ rollCode: '', diameter: '', hardness: '', type: '', entryDate: '', totalPasses: 6 });

  const [newRollModal, setNewRollModal] = useState({ isOpen: false, standIndex: null });
  const [newRollForm, setNewRollForm] = useState({
    rollCode: '', diameter: '', hardness: '', type: '', entryDate: '', totalPasses: 6, maxLimit: 1000, notes: '',
    startPass: 1, shift: '', billets: ''
  });

  // نافذة تعديل سجل تغيير ممر (للأدمن / المدير عند المراجعة)
  const [editChangeModal, setEditChangeModal] = useState({ isOpen: false, changeId: null, fromReview: false });
  const [editChangeForm, setEditChangeForm] = useState({
    standName: '', kind: 'pass', date: '', shift: '', fromPass: 1, toPass: 2,
    tons: 0, billetsAtChange: 0, productSize: '16', notes: ''
  });

  // نافذة تعديل إنتاجية الممر (الشغال للأدمن / المنتهي للمدير والأدمن)
  const [passTonsModal, setPassTonsModal] = useState({
    isOpen: false, standIndex: null, passNumber: null, isCurrent: false, tonsInput: ''
  });

  const [resetModal, setResetModal] = useState({ isOpen: false, standIndex: null });
  const [resetBillets, setResetBillets] = useState('');
  const [resetNotes, setResetNotes] = useState('');
  const [resetDateInput, setResetDateInput] = useState('');
  const [resetShiftInput, setResetShiftInput] = useState('');
  const [resetTargetPass, setResetTargetPass] = useState(null);

  const [historyModal, setHistoryModal] = useState({ isOpen: false, standId: null });
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [reqEdits, setReqEdits] = useState({});
  const [dupModal, setDupModal] = useState(false);

  const [modal, setModal] = useState({ isOpen: false, type: '', title: '', message: '', onConfirm: null });
  const closeBox = () => setModal(m => ({ ...m, isOpen: false }));
  const showAlert = (title, message) => setModal({ isOpen: true, type: 'alert', title, message, onConfirm: null });
  const showConfirm = (title, message, onConfirm) => setModal({ isOpen: true, type: 'confirm', title, message, onConfirm });

  /* ---------- الاتصال وجلب البيانات ---------- */
  const isLoggedIn = currentUser !== 'none';
  const [standsEmpty, setStandsEmpty] = useState(false);
  const listenerError = (label) => (e) => console.error(`Listener error (${label}):`, e);

  // الحالة العامة (وضع الصيانة): متاحة قبل تسجيل الدخول
  useEffect(() => {
    if (!db) { setIsDataLoaded(true); return; }
    const unsub = onSnapshot(doc(db, 'config', 'public'), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setAdminState(prev => ({ ...prev, ...d }));
        if (d.logoUrl) setCustomLogo(d.logoUrl);
      }
      setIsDataLoaded(true);
    }, (e) => { console.error(e); setIsDataLoaded(true); });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, setUserAuth);
    return () => unsub();
  }, []);

  // استرجاع الجلسة: نفس الشخص يكمل من غير ما يكتب الكود تاني (بيشتغل حتى بدون نت من التخزين المحلي)
  useEffect(() => {
    if (!userAuth || !db || currentUser !== 'none') return;
    let session = null;
    try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { /* ignore */ }
    if (!session || session.uid !== userAuth.uid || Date.now() - session.at > SESSION_TTL) return;
    let cancelled = false;
    getDoc(doc(db, 'users', userAuth.uid)).then((snap) => {
      if (cancelled || !snap.exists()) return;
      const u = snap.data();
      const isAdminUser = u.role === 'admin';
      setIsSuperAdmin(isAdminUser);
      setLoggedUserInfo({
        name: isAdminUser ? 'مسؤول النظام' : (u.name || ''),
        roleTitle: isAdminUser ? 'أدمن' : (u.roleTitle || ROLE_TITLES[u.role] || 'فني'),
        code: ''
      });
      setCurrentUser(u.role);
      setActiveTab('dashboard');
      saveSession(userAuth.uid);
    }).catch(e => console.error('session restore:', e));
    return () => { cancelled = true; };
  }, [userAuth]);

  // بيانات المصنع: كل سجل في document مستقل، وبتتحمل بعد تسجيل الدخول فقط
  useEffect(() => {
    if (!userAuth || !db || !isLoggedIn) return;
    const col = (name) => collection(db, 'factory', appId, name);
    const byIdDesc = (a, b) => Number(b.id) - Number(a.id);
    const unsubs = [
      onSnapshot(col('stands'), (snap) => {
        if (snap.empty) {
          if (!snap.metadata.fromCache) setStandsEmpty(true);
          setStands(buildInitialStands());
        } else {
          setStandsEmpty(false);
          setStands(normalizeList(snap.docs.map(d => d.data())));
        }
      }, listenerError('stands')),
      onSnapshot(query(col('archive'), orderBy('id', 'desc'), limit(90)), (snap) => setProductionArchive(snap.docs.map(d => d.data())), listenerError('archive')),
      onSnapshot(query(col('passChanges'), orderBy('id', 'desc'), limit(120)), (snap) => setPassChanges(snap.docs.map(d => d.data())), listenerError('passChanges')),
      onSnapshot(col('pending'), (snap) => setPendingList(snap.docs.map(d => d.data()).sort(byIdDesc)), listenerError('pending')),
      onSnapshot(doc(db, 'factory', appId, 'settings', 'main'), (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        if (d.billetWeight) setBilletWeight(d.billetWeight);
        if (d.alertPercent) setAlertPercent(d.alertPercent);
        if (d.logoUrl) setCustomLogo(prev => prev || d.logoUrl);
        if (d.selectedProductSize) setSelectedProductSize(d.selectedProductSize);
      }, listenerError('settings'))
    ];
    return () => unsubs.forEach(u => u());
  }, [userAuth, isLoggedIn]);

  // قائمة الأفراد (للمدير والأدمن فقط)
  useEffect(() => {
    if (!userAuth || !db || !(currentUser === 'admin' || isSuperAdmin)) return;
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setStaffAccounts(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(u => u.role !== 'admin')
          .sort((a, b) => (b.createdTs || 0) - (a.createdTs || 0))
      );
    }, listenerError('users'));
    return () => unsub();
  }, [userAuth, currentUser, isSuperAdmin]);

  // عدّاد الزيارات (يظهر للأدمن فقط)
  useEffect(() => {
    if (!userAuth || !db || !(currentUser === 'admin' || isSuperAdmin)) return;
    const unsub = onSnapshot(doc(db, 'factory', appId, 'meta', 'visits'), (snap) => {
      if (snap.exists()) setAdminState(prev => ({ ...prev, ...snap.data() }));
    }, listenerError('visits'));
    return () => unsub();
  }, [userAuth, currentUser, isSuperAdmin]);

  // نقل الشعار القديم (كان في الإعدادات) للمكان العام مرة واحدة، عشان يظهر قبل تسجيل الدخول
  useEffect(() => {
    if (!db || !userAuth || !isAdminRole || !isDataLoaded || !customLogo || adminState.logoUrl) return;
    if (!isValidLogo(customLogo)) return;
    setDoc(doc(db, 'config', 'public'), { logoUrl: customLogo }, { merge: true }).catch(e => console.error('logo migrate:', e));
  }, [userAuth, isAdminRole, isDataLoaded, customLogo, adminState.logoUrl]);

  // سجل النشاط (للأدمن فقط، وبيتحمل لما يتفتح بس)
  useEffect(() => {
    if (!activityOpen || !userAuth || !db || !(currentUser === 'admin' || isSuperAdmin)) return;
    const q = query(collection(db, 'factory', appId, 'activity'), orderBy('ts', 'desc'), limit(200));
    const unsub = onSnapshot(q, (snap) => setActivityList(snap.docs.map(d => d.data())), listenerError('activity'));
    return () => unsub();
  }, [activityOpen, userAuth, currentUser, isSuperAdmin]);

  // أول تشغيل: المدير/الأدمن بيزرع الستاندات الافتراضية لو قاعدة البيانات فاضية فعلاً (مؤكد من السيرفر)
  useEffect(() => {
    if (!standsEmpty || !db || !userAuth) return;
    if (!(currentUser === 'admin' || isSuperAdmin)) return;
    const b = writeBatch(db);
    buildInitialStands().forEach(s => b.set(doc(db, 'factory', appId, 'stands', String(s.id)), s));
    b.commit().catch(e => console.error('Seed error:', e));
    setStandsEmpty(false);
  }, [standsEmpty, userAuth, currentUser, isSuperAdmin]);

  useEffect(() => {
    if (userAuth && isLoggedIn && db && !visitLogged) {
      setVisitLogged(true);
      setDoc(doc(db, 'factory', appId, 'meta', 'visits'),
        { visitsCount: increment(1), lastVisit: new Date().toLocaleString('ar-EG') },
        { merge: true }).catch(e => console.error(e));
    }
  }, [userAuth, isLoggedIn, visitLogged]);

  /* ---------- اليوم الإنتاجي والورديات ---------- */
  const getInitialProductionState = () => {
    const now = new Date();
    const hour = now.getHours();
    const prodDate = new Date(now);
    if (hour < 8) prodDate.setDate(prodDate.getDate() - 1);
    const fri = prodDate.getDay() === 5;
    let initialShift = '';
    if (fri) initialShift = (hour >= 8 && hour < 20) ? SHIFTS_FRIDAY[0] : SHIFTS_FRIDAY[1];
    else if (hour >= 8 && hour < 16) initialShift = SHIFTS_NORMAL[0];
    else if (hour >= 16 && hour < 24) initialShift = SHIFTS_NORMAL[1];
    else initialShift = SHIFTS_NORMAL[2];
    return { prodDate, initialShift };
  };
  const initState = getInitialProductionState();
  const [currentProdDate, setCurrentProdDate] = useState(initState.prodDate);
  const [selectedShift, setSelectedShift] = useState(initState.initialShift);

  const isFriday = currentProdDate.getDay() === 5;
  const availableShifts = shiftsFor(isFriday);
  useEffect(() => {
    if (!availableShifts.includes(selectedShift)) setSelectedShift(availableShifts[0]);
  }, [isFriday]);

  const handleDateChange = (dir) => {
    const nd = new Date(currentProdDate);
    nd.setDate(nd.getDate() + dir);
    setCurrentProdDate(nd);
    setSelectedShift(shiftsFor(nd.getDay() === 5)[0]);
  };
  const handleGoToToday = () => {
    const s = getInitialProductionState();
    setCurrentProdDate(new Date(s.prodDate.getTime()));
    setSelectedShift(s.initialShift);
  };

  /* ---------- الحفظ السحابي ---------- */
  const save = async ({ stands: s, archive, weight, logo, changes, productSize, admin, pending, alertPct, label } = {}) => {
    if (userAuth && db) {
      try {
        // بنكتب بس السجلات اللي اتغيرت/اتضافت/اتمسحت (كل سجل document مستقل)
        // فمفيش حد بيمسح شغل التاني، وحجم أي document يفضل صغير مهما كبر الأرشيف
        const ops = [];
        const sync = (colName, newList, oldList) => {
          const oldMap = new Map(oldList.map(x => [String(x.id), x]));
          const newMap = new Map(newList.map(x => [String(x.id), x]));
          newMap.forEach((val, id) => {
            const prev = oldMap.get(id);
            if (!prev || JSON.stringify(prev) !== JSON.stringify(val)) {
              ops.push({ type: 'set', ref: doc(db, 'factory', appId, colName, id), data: val });
            }
          });
          oldMap.forEach((_, id) => {
            if (!newMap.has(id)) ops.push({ type: 'delete', ref: doc(db, 'factory', appId, colName, id) });
          });
        };
        if (s !== undefined) sync('stands', s, stands);
        if (archive !== undefined) sync('archive', archive, productionArchive);
        if (changes !== undefined) sync('passChanges', changes, passChanges);
        if (pending !== undefined) sync('pending', pending, pendingList);
        // سجل النشاط: بيتكتب مع نفس العملية
        const logs = [];
        const addLog = (action, details = '') => logs.push({ action, details });
        if (label) {
          addLog(label);
        } else {
          if (s !== undefined) {
            const oldMap = new Map(stands.map(x => [String(x.id), x]));
            const changedS = s.filter(n => { const o = oldMap.get(String(n.id)); return !o || JSON.stringify(o) !== JSON.stringify(n); });
            const newIds = new Set(s.map(n => String(n.id)));
            const removedS = stands.filter(o => !newIds.has(String(o.id)));
            if (changedS.length) addLog('تعديل ستاندات', changedS.slice(0, 6).map(x => x.name).join('، ') + (changedS.length > 6 ? ` و${changedS.length - 6} آخرين` : ''));
            if (removedS.length) addLog('حذف ستاند', removedS.map(x => x.name).join('، '));
          }
          if (archive !== undefined) {
            const oldA = new Map(productionArchive.map(x => [String(x.id), x]));
            const desc = (x) => `${x.date} - ${x.shift}: ${x.billets} بليت (${Number(x.tons).toFixed(1)} طن)`;
            archive.forEach(x => {
              const o = oldA.get(String(x.id));
              if (!o) addLog('تسجيل إنتاج وردية', desc(x));
              else if (JSON.stringify(o) !== JSON.stringify(x)) addLog('تعديل إنتاج وردية', desc(x));
            });
            const aIds = new Set(archive.map(x => String(x.id)));
            const removedA = productionArchive.filter(x => !aIds.has(String(x.id)));
            if (removedA.length) addLog('حذف سجلات إنتاج', `${removedA.length} سجل`);
          }
          if (changes !== undefined) {
            const oldC = new Map(passChanges.map(x => [String(x.id), x]));
            changes.forEach(x => {
              const o = oldC.get(String(x.id));
              const what = x.kind === 'newRoll' ? 'درفيل جديد' : `ممر ${x.fromPass} ← ممر ${x.toPass}`;
              if (!o) addLog(x.autoApplied ? 'تغيير مباشر (ستاند 8-12)' : (x.kind === 'newRoll' ? 'تركيب درفيل جديد' : 'تغيير ممر'), `${x.standName}: ${what}`);
              else if (o.needsReview && !x.needsReview) addLog('تأكيد تغيير', `${x.standName}: ${what}`);
            });
          }
          if (pending !== undefined) {
            const oldP = new Map(pendingList.map(x => [String(x.id), x]));
            pending.forEach(x => {
              const o = oldP.get(String(x.id));
              if (!o) addLog('طلب جديد', `${x.standName}: ${x.kind === 'newRoll' ? 'تركيب درفيل' : `ممر ${x.fromPass} ← ممر ${x.targetPass}`}`);
              else if (o.status === 'pending' && x.status === 'rejected') addLog('رفض طلب', x.standName);
            });
          }
          if (weight !== undefined) addLog('تغيير وزن البليت', `${weight} طن`);
          if (productSize !== undefined) addLog('تغيير مقاس المنتج', String(productSize));
          if (logo !== undefined) addLog('تغيير شعار الموقع');
          if (alertPct !== undefined) addLog('تغيير نسبة تنبيه الممرات', `${alertPct}%`);
          if (admin !== undefined && admin.isMaintenance !== undefined && !!admin.isMaintenance !== !!adminState.isMaintenance) {
            addLog(admin.isMaintenance ? 'تفعيل وضع الصيانة' : 'إيقاف وضع الصيانة');
          }
        }
        const baseId = Date.now() * 10;
        logs.slice(0, 40).forEach((lg, i) => {
          const id = baseId + i;
          ops.push({
            type: 'set',
            ref: doc(db, 'factory', appId, 'activity', String(id)),
            data: {
              id, ts: Date.now(), at: new Date().toLocaleString('ar-EG'), uid: userAuth.uid,
              user: roleLabel, role: isSuperAdmin ? 'admin' : currentUser,
              action: lg.action, details: String(lg.details || '').slice(0, 500)
            }
          });
        });

        for (let i = 0; i < ops.length; i += 400) {
          const batch = writeBatch(db);
          ops.slice(i, i + 400).forEach(op => (op.type === 'delete' ? batch.delete(op.ref) : batch.set(op.ref, op.data)));
          await batch.commit();
        }
        const upd = {};
        if (weight !== undefined) upd.billetWeight = weight;
        if (productSize !== undefined) upd.selectedProductSize = productSize;
        if (alertPct !== undefined) upd.alertPercent = alertPct;
        if (Object.keys(upd).length) await setDoc(doc(db, 'factory', appId, 'settings', 'main'), upd, { merge: true });
        if (admin !== undefined || logo !== undefined) {
          const pub = {};
          if (admin !== undefined && admin.isMaintenance !== undefined) pub.isMaintenance = !!admin.isMaintenance;
          if (admin !== undefined && admin.maintenanceMessage !== undefined) pub.maintenanceMessage = String(admin.maintenanceMessage);
          if (logo !== undefined) pub.logoUrl = logo;
          await setDoc(doc(db, 'config', 'public'), pub, { merge: true });
        }
        return true;
      } catch (e) {
        console.error("Save error:", e);
        const denied = e && e.code === 'permission-denied';
        showAlert('لم يتم الحفظ', denied
          ? 'مفيش صلاحية لحفظ التغيير ده. اتأكد من تسجيل الدخول.'
          : 'حصلت مشكلة أثناء الحفظ. اتأكد من الاتصال بالإنترنت وجرب تاني، وما تعتمدش إن التسجيل اتحفظ.');
        return false;
      }
    } else {
      if (s !== undefined) setStands(s);
      if (archive !== undefined) setProductionArchive(archive);
      if (weight !== undefined) setBilletWeight(weight);
      if (logo !== undefined) setCustomLogo(logo);
      if (changes !== undefined) setPassChanges(changes);
      if (pending !== undefined) setPendingList(pending);
      if (productSize !== undefined) setSelectedProductSize(productSize);
      if (alertPct !== undefined) setAlertPercent(alertPct);
      if (admin !== undefined) setAdminState(prev => ({ ...prev, ...admin }));
      return true;
    }
  };

  // تسجيل حدث منفرد في سجل النشاط (دخول، حسابات...)
  const logActivity = (action, details = '', who = roleLabel, roleKey = (isSuperAdmin ? 'admin' : currentUser)) => {
    if (!db || !auth || !auth.currentUser) return;
    const id = Date.now() * 10 + Math.floor(Math.random() * 10);
    setDoc(doc(db, 'factory', appId, 'activity', String(id)), {
      id, ts: Date.now(), at: new Date().toLocaleString('ar-EG'), uid: auth.currentUser.uid,
      user: who, role: roleKey, action, details: String(details).slice(0, 500)
    }).catch(e => console.error('activity log:', e));
  };

  /* ---------- إضافة وحذف ستاندات جديدة (للمدير فقط) ---------- */
  const openAddStandModal = () => {
    const maxId = Math.max(0, ...stands.map(s => Number(s.id) || 0));
    const nextNum = maxId + 1;
    setNewStandForm({
      name: `ستاند ${nextNum}`,
      type: 'بيضاوي',
      diameter: '320',
      hardness: '50 HRC',
      rollCode: '',
      totalPasses: 20,
      maxLimit: 1000
    });
    setAddStandModalOpen(true);
  };

  const handleCreateNewStand = (e) => {
    e.preventDefault();
    if (!canAddStand) return;
    const maxId = Math.max(0, ...stands.map(s => Number(s.id) || 0));
    const nextId = String(maxId + 1);
    const createdStand = buildStand({
      id: nextId,
      name: newStandForm.name.trim() || `ستاند ${nextId}`,
      type: newStandForm.type.trim(),
      diameter: newStandForm.diameter.trim(),
      hardness: newStandForm.hardness.trim(),
      rollCode: newStandForm.rollCode.trim(),
      totalPasses: Math.max(1, Math.min(40, Number(newStandForm.totalPasses) || 10)),
      maxLimit: Math.max(100, Number(newStandForm.maxLimit) || 1000)
    });
    const updatedStands = [...stands, createdStand];
    save({ stands: updatedStands });
    setAddStandModalOpen(false);
    showAlert('تمت الإضافة', `تم إضافة (${createdStand.name}) بنجاح إلى شبكة التشغيل.`);
  };

  const handleDeleteStand = (standIndex) => {
    if (!canAddStand) return;
    const st = stands[standIndex];
    if (!st) return;
    if (stands.length <= 1) {
      showAlert('تنبيه', 'لا يمكن حذف جميع الستاندات.');
      return;
    }
    showConfirm('حذف ستاند', `هل أنت متأكد من حذف (${st.name}) نهائياً من قائمة الستاندات؟`, () => {
      const updated = stands.filter((_, i) => i !== standIndex);
      save({ stands: updated });
      setRollModal({ isOpen: false, standIndex: null, isEditingInfo: false });
    });
  };

  /* ---------- إدارة أكواد الأفراد والمهندسين (للمدير) ---------- */
  const handleAddStaffMember = async (e) => {
    e.preventDefault();
    const cleanName = newStaffForm.name.trim();
    const cleanCode = newStaffForm.code.trim();
    if (!cleanName || !cleanCode) {
      showAlert('بيانات ناقصة', 'يرجى كتابة اسم الفرد والكود الخاص به.');
      return;
    }
    if (cleanCode.length < 6) {
      showAlert('كود ضعيف', 'الكود لازم يكون 6 حروف أو أرقام على الأقل.');
      return;
    }
    if (!db || !userAuth) {
      showAlert('غير متصل', 'لازم تكون متصل وداخل بحساب مدير لإنشاء الأكواد.');
      return;
    }
    let secondary;
    try {
      const email = await staffEmailFor(cleanCode);
      if (staffAccounts.some(u => u.emailKey === email)) {
        showAlert('كود مستخدم', 'هذا الكود مستخدم بالفعل، اختر كوداً آخر.');
        return;
      }
      // نسخة تانية من Firebase بنعمل بيها الحساب، عشان المدير ما يتسجلش خروج
      secondary = initializeApp(firebaseConfig, 'staff-' + Date.now());
      const sAuth = getAuth(secondary);
      let cred;
      try {
        cred = await createUserWithEmailAndPassword(sAuth, email, cleanCode);
      } catch (err) {
        if (err.code === 'auth/email-already-in-use') cred = await signInWithEmailAndPassword(sAuth, email, cleanCode);
        else throw err;
      }
      await setDoc(doc(db, 'users', cred.user.uid), {
        name: cleanName,
        role: newStaffForm.role,
        roleTitle: ROLE_TITLES[newStaffForm.role] || 'فني',
        emailKey: email,
        createdAt: new Date().toLocaleDateString('en-GB'),
        createdTs: Date.now(),
        createdBy: roleLabel
      });
      await signOut(sAuth);
      logActivity('إضافة فرد', `${cleanName} (${ROLE_TITLES[newStaffForm.role] || 'فني'})`);
      setNewStaffForm({ name: '', code: '', role: 'tech' });
    } catch (err) {
      console.error(err);
      showAlert('تعذر الإنشاء', err && err.code === 'permission-denied'
        ? 'مفيش صلاحية لإنشاء هذا الحساب.'
        : 'حصلت مشكلة أثناء إنشاء الحساب. اتأكد من الاتصال وإن تسجيل الدخول بالإيميل مفعّل في Firebase.');
    } finally {
      if (secondary) deleteApp(secondary).catch(() => {});
    }
  };

  const handleDeleteStaffMember = async (id) => {
    try {
      const member = staffAccounts.find(u => u.id === id);
      await deleteDoc(doc(db, 'users', id));
      logActivity('حذف فرد', member ? `${member.name} (${member.roleTitle || ''})` : '');
    } catch (err) {
      console.error(err);
      showAlert('تعذر الحذف', 'مقدرناش نحذف الحساب. جرب تاني.');
    }
  };

  const handleProductSizeChange = (size) => {
    setSelectedProductSize(size);
    // المنتج أكبر من 12 مم: ستاند 11 و12 بيتفصلوا تلقائياً، وباقي الستاندات شغالة
    const big = Number(size) > 12;
    const next = stands.map(s => ({ ...s, isActive: !(big && (String(s.id) === '11' || String(s.id) === '12')) }));
    const flipped = next.filter((s, i) => s.isActive !== stands[i].isActive);
    save({ stands: next, productSize: size });
    if (flipped.length) {
      showAlert(big ? 'تم فصل ستاندات' : 'تم تشغيل ستاندات',
        big ? `تم فصل ${flipped.map(s => s.name).join(' و')} تلقائياً لأن المقاس أكبر من 12 مم.`
            : `تم تشغيل ${flipped.map(s => s.name).join(' و')} تلقائياً.`);
    }
  };

  const getStandStatus = (tons, limit) => {
    const pct = Math.max(0, (tons / limit) * 100);
    if (pct >= 100) return { color: 'danger', bg: 'bg-red-100', border: 'border-red-500', bar: 'bg-red-600', text: 'text-red-700', hex: '#dc2626' };
    if (pct >= 80) return { color: 'warning', bg: 'bg-yellow-100', border: 'border-yellow-400', bar: 'bg-yellow-500', text: 'text-yellow-700', hex: '#eab308' };
    return { color: 'good', bg: 'bg-slate-50', border: 'border-slate-300', bar: 'bg-green-500', text: 'text-slate-700', hex: '#22c55e' };
  };

  const openSettingsModal = () => { setTempLogoUrl(customLogo); setIsSettingsOpen(true); };
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { showAlert("خطأ", "الصيغة مش مدعومة. استخدم PNG أو JPG أو WEBP."); return; }
    if (file.size > 400 * 1024) { showAlert("خطأ", "حجم الصورة كبير جداً. يرجى اختيار صورة أقل من 400 كيلوبايت."); return; }
    const reader = new FileReader();
    reader.onloadend = () => setTempLogoUrl(reader.result);
    reader.readAsDataURL(file);
  };
  const handleSaveSettings = () => {
    if (tempLogoUrl && tempLogoUrl.trim() !== '') {
      if (!isValidLogo(tempLogoUrl.trim())) { showAlert("خطأ", "اللوجو غير صالح. ارفع صورة PNG/JPG/WEBP."); return; }
      save({ logo: tempLogoUrl.trim() });
    }
    setIsSettingsOpen(false);
  };

  const handleToggleActive = (index, e) => {
    if (e) e.stopPropagation();
    const ns = stands.map((s, i) => i === index ? { ...s, isActive: !s.isActive } : s);
    save({ stands: ns });
  };

  /* ---------- صفحة الدرفيل ---------- */
  const openStandRollPage = (index) => {
    const st = stands[index];
    setRollEditForm({
      rollCode: st.rollCode || '', diameter: st.diameter || '', hardness: st.hardness || '',
      type: st.type || '', entryDate: convertGBToISO(st.entryDate), totalPasses: st.totalPasses || 6
    });
    setRollModal({ isOpen: true, standIndex: index, isEditingInfo: false });
  };

  const handleSaveRollMetadata = () => {
    const idx = rollModal.standIndex;
    if (idx === null) return;
    const ns = [...stands];
    const st = { ...ns[idx] };
    const newTotal = Math.max(1, Math.min(40, Number(rollEditForm.totalPasses) || st.totalPasses));
    st.rollCode = rollEditForm.rollCode; st.diameter = rollEditForm.diameter;
    st.hardness = rollEditForm.hardness; st.type = rollEditForm.type;
    st.entryDate = formatDateToGB(rollEditForm.entryDate) || st.entryDate;
    if (newTotal !== st.totalPasses) {
      st.passes = Array.from({ length: newTotal }, (_, i) => {
        const n = i + 1;
        const ex = st.passes.find(p => p.passNumber === n);
        if (ex) return ex;
        return { passNumber: n, status: n === st.activePass ? 'active' : 'unused',
          tons: n === st.activePass ? st.accumulatedTons : 0, order: n === st.activePass ? 1 : null, sizeLabel: '' };
      });
      st.totalPasses = newTotal;
      if (st.activePass > newTotal) st.activePass = 1;
    }
    ns[idx] = st;
    save({ stands: ns });
    setRollModal(prev => ({ ...prev, isEditingInfo: false }));
    showAlert("تم الحفظ", "تم تحديث بيانات الدرفيل والممرات بنجاح.");
  };

  const pendingFor = (standId) => pendingList.filter(r => String(r.standId) === String(standId) && r.status === 'pending');

  const buildRequest = (st, kind, extra = {}) => ({
    id: Date.now() + Math.floor(Math.random() * 1000),
    kind, status: 'pending', standId: st.id, standName: st.name,
    fromPass: st.activePass, currentTons: st.accumulatedTons,
    productSize: selectedProductSize, requestedBy: roleLabel,
    createdAt: new Date().toLocaleString('ar-EG'),
    date: new Date().toLocaleDateString('en-GB'), shift: selectedShift, ...extra
  });

  const submitChange = (req) => {
    if (isManagerLike) {
      const r = applyPassChange(stands, req, billetWeight, roleLabel, productionArchive);
      if (!r) return;
      save({ stands: r.list, changes: [r.log, ...passChanges] });
      return;
    }
    if (AUTO_APPLY_STANDS.includes(Number(req.standId))) {
      const r = applyPassChange(stands, req, billetWeight, roleLabel, productionArchive);
      if (!r) return;
      r.log.autoApplied = true;
      r.log.needsReview = true;
      r.log.approvedBy = 'تنفيذ مباشر (بانتظار تأكيد المدير)';
      save({ stands: r.list, changes: [r.log, ...passChanges] });
      showAlert('تم التنفيذ', `تم تنفيذ التغيير فوراً باسم (${roleLabel}) وإرساله للمدير للاطلاع والتأكيد.`);
      return;
    }
    save({ pending: [req, ...pendingList] });
    showAlert('تم إرسال الطلب', `تم إرسال الطلب باسم (${roleLabel}) للمدير. هيتنفذ بعد موافقته، وتقدر تتابع حالته من كارت الستاند.`);
  };

  const handleInstallNewRoll = () => {
    const idx = rollModal.standIndex;
    if (idx === null) return;
    const st = stands[idx];
    if (!isManagerLike && pendingFor(st.id).length) {
      showAlert('يوجد طلب معلّق', 'فيه طلب لهذا الستاند بانتظار موافقة المدير.');
      return;
    }
    setNewRollForm({
      rollCode: st.rollCode || '',
      diameter: st.diameter || '',
      hardness: st.hardness || '',
      type: st.type || '',
      entryDate: formatDateToISO(currentProdDate),
      totalPasses: st.totalPasses || 6,
      maxLimit: st.maxLimit || 1000,
      notes: '',
      startPass: 1,
      shift: selectedShift,
      billets: ''
    });
    setNewRollModal({ isOpen: true, standIndex: idx });
  };

  const confirmInstallNewRoll = (e) => {
    e.preventDefault();
    const idx = newRollModal.standIndex;
    if (idx === null) return;
    const st = stands[idx];
    const entryDateGB = formatDateToGB(newRollForm.entryDate) || new Date().toLocaleDateString('en-GB');
    const req = buildRequest(st, 'newRoll', {
      date: entryDateGB,
      newRollCode: newRollForm.rollCode.trim(),
      newDiameter: newRollForm.diameter.trim(),
      newHardness: newRollForm.hardness.trim(),
      newType: newRollForm.type.trim(),
      newTotalPasses: Math.max(1, Math.min(40, Number(newRollForm.totalPasses) || st.totalPasses)),
      newMaxLimit: Math.max(100, Number(newRollForm.maxLimit) || st.maxLimit || 1000),
      startPass: Math.max(1, Math.min(Math.max(1, Math.min(40, Number(newRollForm.totalPasses) || st.totalPasses)), Math.floor(Number(newRollForm.startPass)) || 1)),
      shift: newRollForm.shift || selectedShift,
      billets: Number(newRollForm.billets) || 0,
      notes: newRollForm.notes.trim() || 'تركيب درفيل جديد'
    });
    submitChange(req);
    setNewRollModal({ isOpen: false, standIndex: null });
  };

  const handleDirectPassStatusChange = (standIdx, passNum, newStatus, customTons) => {
    const ns = [...stands];
    const st = { ...ns[standIdx] };
    const maxOrder = Math.max(0, ...st.passes.map(p => p.order || 0));
    st.passes = st.passes.map(p => {
      if (p.passNumber !== passNum) return p;
      if (newStatus === 'unused') return { ...p, status: 'unused', tons: 0, order: null };
      return { ...p, status: 'used', tons: customTons !== undefined ? Number(customTons) : p.tons, order: p.order || (maxOrder + 1) };
    });
    ns[standIdx] = st;
    save({ stands: ns });
  };

  const openPassTonsModal = (standIndex, passNumber, currentTons, isCurrent) => {
    if (isCurrent && !isAdminRole) return;
    if (!isCurrent && !isManagerLike) return;
    setPassTonsModal({
      isOpen: true,
      standIndex,
      passNumber,
      isCurrent,
      tonsInput: String(Number(currentTons || 0))
    });
  };

  const handleSavePassTons = (e) => {
    e.preventDefault();
    const { standIndex, passNumber, isCurrent, tonsInput } = passTonsModal;
    if (standIndex === null || passNumber === null) return;
    const val = Math.max(0, Number(tonsInput));
    if (isNaN(val)) { showAlert('قيمة غير صحيحة', 'أدخل رقماً صحيحاً للإنتاجية بالطن.'); return; }

    if (isCurrent) {
      if (!isAdminRole) return;
      const ns = [...stands];
      const st = { ...ns[standIndex] };
      st.accumulatedTons = val;
      st.passes = st.passes.map(p => p.passNumber === passNumber ? { ...p, status: 'active', tons: val, order: p.order || 1 } : p);
      ns[standIndex] = st;
      save({ stands: ns, label: `تعديل إنتاجية الممر الشغال (${st.name} - ممر ${passNumber}: ${val} طن)` });
    } else {
      handleDirectPassStatusChange(standIndex, passNumber, val > 0 ? 'used' : 'unused', val);
    }
    setPassTonsModal({ isOpen: false, standIndex: null, passNumber: null, isCurrent: false, tonsInput: '' });
  };

  /* ---------- تعديل وحذف تغييرة ممر معينة (للأدمن / المدير عند المراجعة) ---------- */
  const openEditPassChange = (c, fromReview = false) => {
    if (!isAdminRole && !(fromReview && isManagerLike)) return;
    setEditChangeForm({
      standName: c.standName || `ستاند ${c.standId}`,
      kind: c.kind || 'pass',
      date: convertGBToISO(c.date),
      shift: c.shift || SHIFTS_NORMAL[0],
      fromPass: c.fromPass ?? 1,
      toPass: c.toPass ?? 1,
      tons: Number(c.tons || 0),
      billetsAtChange: Number(c.billetsAtChange || 0),
      productSize: String(c.productSize || selectedProductSize),
      notes: c.notes || ''
    });
    setEditChangeModal({ isOpen: true, changeId: c.id, fromReview });
  };

  const handleSavePassChange = (e) => {
    e.preventDefault();
    const { changeId, fromReview } = editChangeModal;
    if (!changeId) return;
    const updated = passChanges.map(x => {
      if (x.id !== changeId) return x;
      return {
        ...x,
        date: formatDateToGB(editChangeForm.date) || x.date,
        shift: editChangeForm.shift || x.shift,
        fromPass: Number(editChangeForm.fromPass) || x.fromPass,
        toPass: Number(editChangeForm.toPass) || x.toPass,
        tons: Math.max(0, Number(editChangeForm.tons) || 0),
        billetsAtChange: Math.max(0, Number(editChangeForm.billetsAtChange) || 0),
        productSize: editChangeForm.productSize || x.productSize,
        notes: editChangeForm.notes,
        ...(fromReview ? { needsReview: false, reviewedBy: roleLabel, reviewedAt: new Date().toLocaleString('ar-EG'), approvedBy: `معتمد بعد التعديل (${roleLabel})` } : { editedBy: roleLabel })
      };
    });
    save({ changes: updated, label: `تعديل سجل تغيير ممر (${editChangeForm.standName})` });
    setEditChangeModal({ isOpen: false, changeId: null, fromReview: false });
  };

  const handleDeletePassChange = (c, fromReview = false) => {
    if (!isAdminRole && !(fromReview && isManagerLike)) return;
    const desc = c.kind === 'newRoll' ? 'تركيب درفيل جديد' : `ممر ${c.fromPass} ← ممر ${c.toPass}`;
    showConfirm(
      fromReview ? 'رفض وحذف التغيير' : 'حذف تغييرة ممر',
      `هل أنت متأكد من حذف هذا السجل (${c.standName || `ستاند ${c.standId}`} - ${desc} - بتاريخ ${c.date})؟

ملاحظة: لو الستاند محتاج يرجع للممر القديم أو تعديل إنتاجيته، تقدر تعدله من صفحة الدرفيل.`,
      () => {
        save({
          changes: passChanges.filter(x => x.id !== c.id),
          label: `${fromReview ? 'رفض وحذف تغيير مباشر' : 'حذف تغييرة ممر'} (${c.standName || `ستاند ${c.standId}`}: ${desc})`
        });
      }
    );
  };

  const initiateResetStand = (index, preselectedPassNum = null, e = null) => {
    if (e) e.stopPropagation();
    const st = stands[index];
    if (!isManagerLike && pendingFor(st.id).length) { showAlert('يوجد طلب معلّق', 'فيه طلب لهذا الستاند بانتظار موافقة المدير. استنى الرد عليه الأول.'); return; }
    setResetBillets(''); setResetNotes('');
    setResetDateInput(formatDateToISO(currentProdDate));
    setResetShiftInput(selectedShift);
    if (preselectedPassNum) setResetTargetPass(preselectedPassNum);
    else {
      const next = st.passes.find(p => p.status === 'unused' && p.passNumber !== st.activePass);
      setResetTargetPass(next ? next.passNumber : st.activePass);
    }
    setResetModal({ isOpen: true, standIndex: index });
  };

  const handleResetDateChange = (e) => {
    const nd = e.target.value;
    setResetDateInput(nd);
    const valid = shiftsFor(isISODateFriday(nd));
    if (!valid.includes(resetShiftInput)) setResetShiftInput(valid[0]);
  };

  const confirmResetStand = () => {
    const index = resetModal.standIndex;
    if (index === null) return;
    const st = stands[index];
    const req = buildRequest(st, 'pass', {
      targetPass: Number(resetTargetPass) || st.activePass,
      billets: Number(resetBillets) || 0,
      notes: resetNotes,
      date: formatDateToGB(resetDateInput) || new Date().toLocaleDateString('en-GB'),
      shift: resetShiftInput
    });
    submitChange(req);
    setResetModal({ isOpen: false, standIndex: null });
  };

  /* ---------- موافقات المدير ---------- */
  const getEdit = (r) => ({
    targetPass: r.targetPass,
    billets: r.billets,
    notes: r.notes,
    newRollCode: r.newRollCode ?? '',
    newDiameter: r.newDiameter ?? '',
    newHardness: r.newHardness ?? '',
    newType: r.newType ?? '',
    newTotalPasses: r.newTotalPasses ?? 6,
    newMaxLimit: r.newMaxLimit ?? '',
    startPass: r.startPass ?? 1,
    date: r.date,
    shift: r.shift,
    rejectReason: '',
    ...(reqEdits[r.id] || {})
  });
  const setEdit = (id, patch) => setReqEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));

  const approveRequest = (r) => {
    const ed = getEdit(r);
    const merged = { ...r, ...ed };
    const res = applyPassChange(stands, merged, billetWeight, roleLabel, productionArchive);
    if (!res) { showAlert('خطأ', 'تعذر تنفيذ الطلب: الستاند غير موجود.'); return; }
    if (reqEdits[r.id]) res.log.notes = `${res.log.notes} (عُدّل بواسطة ${roleLabel})`;
    save({ stands: res.list, changes: [res.log, ...passChanges], pending: pendingList.filter(x => x.id !== r.id) });
  };
  const rejectRequest = (r) => {
    const reason = String((reqEdits[r.id] || {}).rejectReason || '').trim();
    save({ pending: pendingList.map(x => x.id === r.id ? { ...x, status: 'rejected', rejectedAt: new Date().toLocaleString('ar-EG'), rejectedBy: roleLabel, ...(reason ? { rejectReason: reason } : {}) } : x) });
  };
  const dismissRequest = (id) => save({ pending: pendingList.filter(x => x.id !== id) });

  /* تغييرات ستاندات 8-12 اللي اتنفذت مباشرة: المدير يأكدها أو يعدّلها */
  const confirmReviewedChange = (c) => save({
    changes: passChanges.map(x => x.id === c.id
      ? { ...x, needsReview: false, reviewedBy: roleLabel, reviewedAt: new Date().toLocaleString('ar-EG') }
      : x)
  });
  const editStandFromReview = (c) => {
    const idx = stands.findIndex(s => String(s.id) === String(c.standId));
    if (idx < 0) return;
    setApprovalsOpen(false);
    setRollModal({ isOpen: true, standIndex: idx, isEditingInfo: true });
  };

  const handleResetAllStands = () => {
    if (!isAdminRole) return;
    showConfirm('تحذير شديد', 'هل أنت متأكد من تصفير كافة الستاندات والممرات بالكامل والبدء من ممر 1؟', () => {
      const today = new Date().toLocaleDateString('en-GB');
      save({ stands: stands.map(s => ({ ...s, activePass: 1, accumulatedTons: 0, lastResetDate: today, preCountedShifts: {}, passes: createPassesArray(s.totalPasses, 1, 0) })), label: 'تصفير كل الستاندات' });
    });
  };
  const handleClearArchive = () => {
    if (!isAdminRole) return;
    showConfirm('تحذير نهائي', 'هل أنت متأكد من مسح جميع بيانات الأرشيف القديمة وسجل الممرات بالكامل والبدء من جديد؟', () => {
      save({ archive: [], changes: [], label: `مسح الأرشيف وسجل التغييرات (${productionArchive.length} سجل)` });
      showAlert('تمت العملية', 'تم مسح الأرشيف وسجل الممرات بنجاح.');
    });
  };
  const handleLimitChange = (index, v) => {
    const val = Number(v);
    if (val > 0) save({ stands: stands.map((s, i) => i === index ? { ...s, maxLimit: val } : s) });
  };
  const handleWeightChange = (v) => { const val = Number(v); if (val >= 0.1 && val <= 5) save({ weight: val }); };
  /* تخصيص عدد ممرات لمنتج معين (للأدمن) */
  const handleSaveAlloc = () => {
    const st = stands[rollModal.standIndex];
    if (!st || !isAdminRole) return;
    const rows = allocRows
      .map(r => ({ label: String(r.label || '').replace(/\s+/g, ''), count: Math.floor(Number(r.count)) }))
      .filter(r => r.label || r.count);
    if (rows.some(r => !r.label || !(r.count > 0))) { showAlert('بيانات ناقصة', 'اكتب المنتج وعدد الممرات لكل سطر.'); return; }
    if (rows.some(r => !/^\d+(-\d+)*$/.test(r.label))) { showAlert('مقاس غير صحيح', 'اكتب المقاس بالأرقام فقط، ولو أكتر من مقاس افصل بينهم بشرطة مثل 12-16-18.'); return; }
    const total = rows.reduce((a, r) => a + r.count, 0);
    if (total > st.totalPasses) { showAlert('عدد غير صحيح', `إجمالي الممرات الموزعة (${total}) أكبر من عدد ممرات الستاند (${st.totalPasses}).`); return; }
    save({
      stands: stands.map((s, i) => {
        if (i !== rollModal.standIndex) return s;
        if (rows.length) return { ...s, productAlloc: rows };
        const { productAlloc, ...rest } = s;
        return rest;
      }),
      label: `تخصيص ممرات ${st.name} لمنتجات`
    });
    setAllocOpenFor(null);
  };
  const handleAlertPercentChange = (v) => { const n = Math.round(Number(v)); if (n >= 50 && n <= 100) save({ alertPct: n }); };

  /* ---------- النسخ الاحتياطي (للأدمن) ---------- */
  const handleBackupDownload = () => {
    if (!isAdminRole) return;
    const data = {
      format: 'gioshy-backup-v1', exportedAt: new Date().toISOString(),
      billetWeight, selectedProductSize, alertPercent,
      stands, archive: productionArchive, passChanges, pending: pendingList
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gioshy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    logActivity('تنزيل نسخة احتياطية', `${productionArchive.length} سجل إنتاج، ${stands.length} ستاند`);
  };
  const handleBackupFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !isAdminRole) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        if (d.format !== 'gioshy-backup-v1' || !Array.isArray(d.stands) || !Array.isArray(d.archive) || !Array.isArray(d.passChanges) || !Array.isArray(d.pending)) throw new Error('bad');
        const w = Number(d.billetWeight);
        showConfirm('استعادة نسخة احتياطية', `هتتبدل كل البيانات الحالية بمحتوى الملف (${d.stands.length} ستاند، ${d.archive.length} سجل إنتاج، نسخة بتاريخ ${d.exportedAt ? new Date(d.exportedAt).toLocaleDateString('ar-EG') : 'غير معروف'}). نزّل نسخة من الحالي الأول لو محتاجها. متأكد؟`, () => {
          save({
            stands: d.stands, archive: d.archive, changes: d.passChanges, pending: d.pending,
            weight: w >= 0.1 && w <= 5 ? w : undefined,
            label: 'استعادة نسخة احتياطية'
          });
        });
      } catch (err) {
        showAlert('ملف غير صالح', 'الملف ده مش نسخة احتياطية من الموقع.');
      }
    };
    reader.readAsText(file);
  };
  const handleClearActivity = () => {
    showConfirm('مسح سجل النشاط', 'هتمسح كل السجل الظاهر. متأكد؟', async () => {
      try {
        for (let i = 0; i < activityList.length; i += 400) {
          const b = writeBatch(db);
          activityList.slice(i, i + 400).forEach(a => b.delete(doc(db, 'factory', appId, 'activity', String(a.id))));
          await b.commit();
        }
      } catch (err) {
        console.error(err);
        showAlert('تعذر المسح', 'حصلت مشكلة. جرب تاني.');
      }
    });
  };

  /* ---------- إنتاج الوردية ---------- */
  const currentDateStr = currentProdDate.toLocaleDateString('en-GB');
  const existingShiftLog = productionArchive.find(l => l.date === currentDateStr && l.shift === selectedShift);

  const handleAddShiftProduction = () => {
    const n = Number(shiftBillets);
    if (n <= 0 || isNaN(n)) return;
    if (existingShiftLog) { setDupModal(true); return; }
    commitShift('add');
  };

  const commitShift = async (mode) => {
    setDupModal(false);
    const n = Number(shiftBillets);
    if (n <= 0 || isNaN(n)) return;
    const newTons = n * billetWeight;
    const existing = productionArchive.find(l => l.date === currentDateStr && l.shift === selectedShift);

    const shiftKey = `${currentDateStr}__${selectedShift}`;
    const now = new Date();
    const saveTime = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const dayName = currentProdDate.toLocaleDateString('ar-EG', { weekday: 'long' });

    const newStands = stands.map(s => {
      if (!s.isActive) return s;
      const preCountedMap = { ...(s.preCountedShifts || {}) };
      const preCountedBillets = Number(preCountedMap[shiftKey] || 0);

      let deltaTons = 0;
      if (!existing) {
        const netBilletsForNewPass = Math.max(0, n - preCountedBillets);
        deltaTons = netBilletsForNewPass * billetWeight;
        if (preCountedBillets > 0) {
          delete preCountedMap[shiftKey];
        }
      } else if (mode === 'replace') {
        deltaTons = newTons - existing.tons;
      } else {
        deltaTons = newTons;
      }

      const tons = Math.max(0, s.accumulatedTons + deltaTons);
      return {
        ...s,
        accumulatedTons: tons,
        preCountedShifts: preCountedMap,
        passes: s.passes.map(p => p.passNumber === s.activePass ? { ...p, status: 'active', tons, order: p.order || 1 } : p)
      };
    });

    let archive;
    if (existing) {
      archive = productionArchive.map(l => l === existing ? {
        ...l,
        billets: mode === 'replace' ? n : l.billets + n,
        tons: mode === 'replace' ? newTons : l.tons + newTons,
        time: saveTime, productSize: selectedProductSize, recordedBy: roleLabel, timestamp: now.getTime()
      } : l);
    } else {
      archive = [{ id: Date.now(), date: currentDateStr, dayName, time: saveTime, shift: selectedShift,
        billets: n, tons: newTons, productSize: selectedProductSize, recordedBy: roleLabel, timestamp: now.getTime() }, ...productionArchive];
    }
    const ok = await save({ stands: newStands, archive });
    if (!ok) return;

    const dayShifts = shiftsFor(currentProdDate.getDay() === 5);
    const i = dayShifts.indexOf(selectedShift);
    if (i === dayShifts.length - 1) {
      const nd = new Date(currentProdDate); nd.setDate(nd.getDate() + 1);
      setCurrentProdDate(nd);
      setSelectedShift(shiftsFor(nd.getDay() === 5)[0]);
      showAlert('تم الإقفال', `تم إقفال يوم ${dayName} وتسجيل إنتاج ${selectedShift} باسم (${roleLabel}) بنجاح!\n\nتم فتح يوم جديد تلقائياً.`);
    } else setSelectedShift(dayShifts[i >= 0 ? i + 1 : 0]);
    setShiftBillets('');
  };

  /* ---------- الدخول بالأكواد الشخصية أو العامة ---------- */
  const openLoginModal = (role) => setLoginPrompt({ isOpen: true, role, codeInput: '', error: '' });
  const closeLogin = () => setLoginPrompt({ isOpen: false, role: '', codeInput: '', error: '' });

  const loginBusyRef = useRef(false);
  const doLogin = async (role, rawCode, setErr) => {
    if (loginBusyRef.current) return;
    const code = rawCode.trim();
    if (!code) return;

    const guard = readGuard();
    if (Date.now() < guard.until) {
      setErr(`محاولات خاطئة كتير. استنى ${Math.ceil((guard.until - Date.now()) / 1000)} ثانية وجرب تاني.`);
      return;
    }
    if (!auth || !db) { setErr('مفيش اتصال بقاعدة البيانات.'); return; }

    const recordFail = () => {
      const fails = readGuard().fails + 1;
      writeGuard({ fails, until: fails >= 5 ? Date.now() + Math.min(30000 * 2 ** (fails - 5), 900000) : 0 });
    };

    loginBusyRef.current = true;
    try {
      // التحقق بيتم على سيرفر Firebase (مش في المتصفح)، وفيه حماية ضد التخمين
      const emails = role === 'admin' ? [ADMIN_EMAIL] : [await staffEmailFor(code), ADMIN_EMAIL];
      let cred = null;
      for (const email of emails) {
        try { cred = await signInWithEmailAndPassword(auth, email, code); break; }
        catch (err) { if (err.code === 'auth/too-many-requests') throw err; }
      }
      if (!cred) { recordFail(); setErr('الكود غير صحيح! تأكد من الكود الخاص بك.'); return; }

      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      if (!snap.exists()) { await signOut(auth); setErr('هذا الحساب غير مفعّل.'); return; }
      const u = snap.data();

      if (role === 'admin' && u.role !== 'admin') { await signOut(auth); recordFail(); setErr('الكود غير صحيح! تأكد من الكود الخاص بك.'); return; }
      if (role === 'manager' && u.role === 'tech') { await signOut(auth); setErr('هذا الكود خاص بفني إنتاج وليس للإدارة!'); return; }
      if (adminState.isMaintenance && u.role !== 'admin') { await signOut(auth); setErr('الموقع في وضع الصيانة والتحديث حالياً!'); return; }

      writeGuard({ fails: 0, until: 0 });
      logActivity('تسجيل دخول', '', u.role === 'admin' ? 'مسؤول النظام' : (u.name || ''), u.role);
      saveSession(cred.user.uid);
      const isAdminUser = u.role === 'admin';
      setIsSuperAdmin(isAdminUser);
      setLoggedUserInfo({
        name: isAdminUser ? 'مسؤول النظام' : (u.name || ''),
        roleTitle: isAdminUser ? 'أدمن' : (u.roleTitle || ROLE_TITLES[u.role] || 'فني'),
        code: ''
      });
      // الكود هو اللي بيحدد الصفحة: الأدمن للوحة التحكم، وباقي الأدوار لصفحتها
      const toAdminPanel = isAdminUser && (role === 'admin' || role === 'any');
      setCurrentUser(isAdminUser ? (toAdminPanel ? 'admin' : role) : u.role);
      setActiveTab(toAdminPanel ? 'admin' : 'dashboard');
      setQuickCode('');
      closeLogin();
    } catch (err) {
      console.error(err);
      setErr(err && err.code === 'auth/too-many-requests'
        ? 'محاولات كتير. استنى شوية وجرب تاني.'
        : 'تعذر تسجيل الدخول. اتأكد من الإنترنت وجرب تاني.');
    } finally {
      loginBusyRef.current = false;
    }
  };

  const handleVerifyAccessCode = (e) => {
    e.preventDefault();
    return doLogin(loginPrompt.role, loginPrompt.codeInput, (msg) => setLoginPrompt(p => ({ ...p, error: msg })));
  };
  const handleQuickLogin = async (e) => {
    e.preventDefault();
    setQuickBusy(true);
    setQuickError('');
    await doLogin('any', quickCode, setQuickError);
    setQuickBusy(false);
  };

  const handleSuperAdminSwitchRole = (role) => {
    if (!isSuperAdmin) return;
    setCurrentUser(role);
    if (role === 'admin') setActiveTab('admin'); else if (activeTab === 'admin') setActiveTab('dashboard');
  };
  const handleLogout = () => {
    clearSession();
    if (auth) signOut(auth).catch(e => console.error(e));
    setCurrentUser('none');
    setLoggedUserInfo({ name: '', roleTitle: '', code: '' });
    setIsSuperAdmin(false);
    setActiveTab('dashboard');
    setStaffAccounts([]);
    setVisitLogged(false);
  };
  const handleSaveAdminSettings = (updated) => {
    setAdminState(updated); save({ admin: updated });
    showAlert("تم الحفظ", "تم تحديث إعدادات الموقع بنجاح.");
  };
  const [newAdminPw, setNewAdminPw] = useState('');
  const handleChangeAdminPassword = async () => {
    if (newAdminPw.length < 8) { showAlert('كلمة مرور ضعيفة', 'اكتب 8 حروف أو أرقام على الأقل.'); return; }
    try {
      await updatePassword(auth.currentUser, newAdminPw);
      setNewAdminPw('');
      showAlert('تم التغيير', 'تم تغيير كلمة مرور الأدمن بنجاح.');
    } catch (err) {
      console.error(err);
      showAlert('تعذر التغيير', err && err.code === 'auth/requires-recent-login'
        ? 'اعمل تسجيل خروج وادخل تاني، وبعدها غيّر كلمة المرور.'
        : 'حصلت مشكلة. جرب تاني.');
    }
  };

  /* ---------- الأرشيف ---------- */
  const groupedArchive = productionArchive.reduce((acc, log) => {
    if (!acc[log.date]) acc[log.date] = { dayName: log.dayName, totalBillets: 0, totalTons: 0, shiftsList: [], timestamp: log.timestamp };
    acc[log.date].totalBillets += log.billets;
    acc[log.date].totalTons += log.tons;
    acc[log.date].shiftsList.push(log);
    return acc;
  }, {});
  const shiftOrder = { 'الوردية الأولى': 1, 'الوردية الأولى (12 ساعة)': 1, 'الوردية الثانية': 2, 'الوردية الثانية (12 ساعة)': 2, 'الوردية الثالثة': 3 };
  Object.keys(groupedArchive).forEach(k => groupedArchive[k].shiftsList.sort((a, b) => shiftOrder[a.shift] - shiftOrder[b.shift]));
  const sortedDates = Object.keys(groupedArchive).sort((a, b) => groupedArchive[b].timestamp - groupedArchive[a].timestamp);
  const aggregatedLogs = Object.values(groupedArchive).flatMap(d => d.shiftsList).sort((a, b) => b.timestamp - a.timestamp);

  const reportData = { stands, archive: productionArchive, changes: passChanges, billetWeight, logo: customLogo, productSize: selectedProductSize };
  const onPrintBlocked = () => showAlert('تعذر الفتح', 'المتصفح منع النافذة. اسمح بالنوافذ المنبثقة لهذا الموقع وجرّب تاني.');
  const reportBtn = (label, kind) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-black text-slate-500 whitespace-nowrap">{label}:</span>
      <button onClick={() => downloadExcel(reportData, kind)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded text-[10px] flex items-center gap-1 shadow active:scale-95 transition-colors">
        <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
      </button>
      <button onClick={() => printPDF(reportData, onPrintBlocked, kind)} className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-1.5 px-3 rounded text-[10px] flex items-center gap-1 shadow active:scale-95 transition-colors">
        <FileText className="w-3.5 h-3.5" /> طباعة
      </button>
    </div>
  );
  const exportButtons = isManagerLike && (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {reportBtn('تقرير الممرات', 'pass')}
      {reportBtn('التقرير اليومي', 'daily')}
    </div>
  );

  const pendingCount = pendingList.filter(r => r.status === 'pending').length + passChanges.filter(c => c.needsReview).length;

  /* ======================================================
    نافذة بطاقة فريق تطوير وإشراف النظام
    ====================================================== */
  const developerCardModalJSX = devModalOpen && (
    <Overlay z={110}>
      <div className="bg-slate-900 border-2 border-amber-400/80 rounded-2xl max-w-md w-full p-5 sm:p-6 text-white shadow-[0_0_40px_rgba(245,158,11,0.25)] relative overflow-hidden text-center">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

        <button
          onClick={() => setDevModalOpen(false)}
          className="absolute top-3 left-3 text-slate-400 hover:text-white bg-slate-800 p-1.5 rounded-lg"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-14 h-14 mx-auto mb-2.5 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg text-slate-950">
          <Award className="w-8 h-8" />
        </div>

        <h3 className="text-base sm:text-lg font-black text-slate-100 mb-4">
          فريق العمل
        </h3>

        <div className="flex flex-col gap-3 text-right">
          {/* إشراف هندسي */}
          <div className="bg-slate-800/90 border border-blue-500/40 rounded-xl p-3.5 shadow-md">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-400/30 mb-1.5">
              <Settings2 className="w-3 h-3" /> إشراف هندسي
            </span>
            <h4 className="text-lg font-black text-white">الباشمهندس حسين</h4>
          </div>

          {/* تصميم وتطوير */}
          <div className="bg-slate-800/90 border border-amber-500/40 rounded-xl p-3.5 shadow-md">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400/15 text-amber-300 border border-amber-400/30 mb-1.5">
              <Sparkles className="w-3 h-3" /> تصميم وتطوير
            </span>
            <h4 className="text-lg font-black text-amber-300">بسام وليد</h4>
          </div>
        </div>

        <button
          onClick={() => setDevModalOpen(false)}
          className="mt-5 w-full bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black py-2 rounded-xl text-xs shadow-md transition-all"
        >
          إغلاق
        </button>
      </div>
    </Overlay>
  );

  /* ======================================================
    الواجهة: صيانة + دخول
    ====================================================== */
  if (adminState.isMaintenance && !isSuperAdmin && currentUser !== 'none') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4 text-center" dir="rtl">
        <div className="bg-slate-800 p-8 rounded-2xl max-w-md w-full border-2 border-amber-500 shadow-2xl flex flex-col items-center gap-4">
          <div className="bg-amber-500/20 p-4 rounded-full border border-amber-500/40 animate-pulse"><Wrench className="w-14 h-14 text-amber-400" /></div>
          <h1 className="text-2xl font-black text-amber-400">جاري التعديل والتحديث</h1>
          <p className="text-sm text-slate-300 leading-relaxed font-bold">{adminState.maintenanceMessage}</p>
          <button onClick={handleLogout} className="mt-4 bg-slate-700 hover:bg-slate-600 text-white font-bold px-6 py-2.5 rounded-lg text-xs transition-colors">العودة لشاشة الدخول</button>
        </div>
      </div>
    );
  }

  const loginModalJSX = loginPrompt.isOpen && (
    <Overlay z={90}>
      <form onSubmit={handleVerifyAccessCode} className="bg-slate-800 border border-slate-600 rounded-xl max-w-xs w-full p-5 shadow-2xl flex flex-col gap-3 text-white">
        <div className="flex justify-between items-center border-b border-slate-700 pb-2">
          <h3 className="font-bold text-sm flex items-center gap-1.5">
            <Key className="w-4 h-4 text-blue-400" />
            {loginPrompt.role === 'tech' && 'كود الدخول (فني / مهندس)'}
            {loginPrompt.role === 'manager' && 'كود دخول الإدارة / المهندسين'}
            {loginPrompt.role === 'admin' && 'بوابة مسؤول النظام (Admin)'}
          </h3>
          <button type="button" onClick={closeLogin} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <input type="password" autoFocus value={loginPrompt.codeInput}
          onChange={(e) => setLoginPrompt(p => ({ ...p, codeInput: e.target.value, error: '' }))}
          placeholder="أدخل الكود الشخصي..."
          className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2.5 text-center font-mono text-lg tracking-widest text-white focus:border-blue-500 outline-none" />
        {loginPrompt.error && <p className="text-red-400 text-xs font-bold text-center bg-red-950/50 border border-red-800 p-1.5 rounded">{loginPrompt.error}</p>}
        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg transition-colors shadow-lg text-sm">تأكيد الدخول</button>
      </form>
    </Overlay>
  );

  if (currentUser === 'none') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4 select-none" dir="rtl">
        {loginModalJSX}
        {developerCardModalJSX}
        <div className="bg-slate-800 p-8 rounded-2xl max-w-sm w-full text-center border border-slate-700 shadow-2xl relative">
          <div onClick={handleSecretAdminTrigger} className="cursor-pointer inline-block w-full">
            {customLogo ? (
              <div className="w-full flex justify-center mb-6 bg-white p-2 rounded-lg shadow-sm">
                <img src={customLogo} alt="Factory Logo" className="h-16 object-contain drop-shadow-md" />
              </div>
            ) : <Settings2 className="w-16 h-16 mx-auto text-blue-500 mb-4 active:scale-95 transition-transform" />}
          </div>
          <h1 onClick={handleSecretAdminTrigger} className="text-2xl font-black mb-1 text-slate-100 cursor-pointer">تتبع درافيل وممرات الإنتاج</h1>
          <p className="text-xs text-slate-400 mb-3 font-bold">شركة الجيوشي للصلب - ALGIOSHY STEEL</p>
          {adminState.isMaintenance ? (
            <div className="bg-amber-500/20 border border-amber-500 text-amber-300 p-3 rounded-lg mb-6 text-xs font-bold flex flex-col items-center gap-1.5">
              <Wrench className="w-5 h-5 text-amber-400 animate-bounce" /><span>{adminState.maintenanceMessage}</span>
            </div>
          ) : (
            online
              ? <p className="text-blue-400 mb-6 text-xs flex items-center justify-center gap-1 font-bold"><CheckCircle className="w-4 h-4" /> نظام متصل بالسحابة لحظياً</p>
              : <p className="text-amber-400 mb-6 text-xs flex items-center justify-center gap-1 font-bold"><AlertTriangle className="w-4 h-4" /> غير متصل بالإنترنت</p>
          )}
          {!isDataLoaded ? (
            <div className="text-slate-400 animate-pulse text-sm font-bold">جاري الاتصال بقاعدة البيانات...</div>
          ) : (
            <form onSubmit={handleQuickLogin} className="space-y-3 text-right">
              <input
                type="password" autoComplete="off" value={quickCode}
                onChange={(e) => { setQuickCode(e.target.value); setQuickError(''); }}
                disabled={adminState.isMaintenance || quickBusy}
                placeholder="أدخل الكود"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-center font-mono text-lg tracking-widest text-white focus:border-blue-500 outline-none disabled:opacity-50"
              />
              {quickError && <p className="text-red-400 text-xs font-bold text-center bg-red-950/50 border border-red-800 p-1.5 rounded">{quickError}</p>}
              <button type="submit" disabled={adminState.isMaintenance || quickBusy || !quickCode.trim()}
                className={`w-full flex items-center justify-center gap-2 p-3.5 rounded-lg font-bold transition-colors shadow-lg ${adminState.isMaintenance || !quickCode.trim() ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                <Key className="w-5 h-5" /> {quickBusy ? 'جاري التحقق...' : 'دخول'}
              </button>
              <InstallButton />
            </form>
          )}

          {/* توقيع الإشراف الهندسي ومصمم النظام في شاشة الدخول */}
          <div className="mt-6 pt-4 border-t border-slate-700/80">
            <Credits onClick={() => setDevModalOpen(true)} />
          </div>
        </div>
      </div>
    );
  }

  const isResetDateFriday = isISODateFriday(resetDateInput);
  const resetModalShifts = shiftsFor(isResetDateFriday);
  const selectedRollStand = rollModal.standIndex !== null ? stands[rollModal.standIndex] : null;
  const resetStandObj = resetModal.standIndex !== null ? stands[resetModal.standIndex] : null;
  const newRollStandObj = newRollModal.standIndex !== null ? stands[newRollModal.standIndex] : null;

  const resetPreview = resetStandObj
    ? computePassSplit(
        resetStandObj,
        formatDateToGB(resetDateInput) || currentDateStr,
        resetShiftInput,
        resetBillets,
        billetWeight,
        productionArchive
      )
    : null;

  const newRollIsFriday = isISODateFriday(newRollForm.entryDate);
  const newRollShifts = shiftsFor(newRollIsFriday);
  const newRollPreview = newRollStandObj
    ? computePassSplit(newRollStandObj, formatDateToGB(newRollForm.entryDate) || currentDateStr, newRollForm.shift, newRollForm.billets, billetWeight, productionArchive)
    : null;
  const newRollOldTotal = newRollStandObj && newRollPreview
    ? newRollStandObj.passes.reduce((a, p) => a + (p.passNumber === newRollStandObj.activePass ? 0 : (Number(p.tons) || 0)), 0) + newRollPreview.finalOldPassTons
    : 0;

  const greenCount = stands.filter(s => (s.accumulatedTons / s.maxLimit) < 0.8).length;
  const warnCount = stands.filter(s => (s.accumulatedTons / s.maxLimit) >= 0.8 && (s.accumulatedTons / s.maxLimit) < 1).length;
  const dangerCount = stands.filter(s => (s.accumulatedTons / s.maxLimit) >= 1).length;
  const alertStands = stands.filter(s => s.maxLimit > 0 && (s.accumulatedTons / s.maxLimit) * 100 >= alertPercent);

  /* ======================================================
    الواجهة الرئيسية
    ====================================================== */
  return (
    <div className="h-dvh bg-slate-200 text-slate-900 font-sans flex flex-col p-1 gap-1 overflow-hidden" dir="rtl">

      {!online && (
        <div className="flex-none bg-amber-500 text-slate-950 text-[11px] font-black text-center py-1 px-2 rounded-lg">
          غير متصل بالإنترنت — شغلك محفوظ على الجهاز وهيتبعت أول ما النت يرجع
        </div>
      )}

      {/* تنبيه / تأكيد */}
      {modal.isOpen && (
        <Overlay z={100}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="p-5">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                {modal.type === 'alert' ? <CheckCircle className="text-green-500 w-5 h-5" /> : <AlertTriangle className="text-orange-500 w-5 h-5" />}
                {modal.title}
              </h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-line">{modal.message}</p>
            </div>
            <div className="bg-slate-50 p-3 flex justify-end gap-2 border-t border-slate-100">
              {modal.type === 'confirm' && <button onClick={closeBox} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg font-bold text-slate-700 text-xs">إلغاء</button>}
              <button onClick={() => { const cb = modal.onConfirm; closeBox(); if (cb) cb(); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shadow">موافق</button>
            </div>
          </div>
        </Overlay>
      )}

      {loginModalJSX}

      {/* ===== نافذة إضافة ستاند جديد (للمدير فقط) ===== */}
      {addStandModalOpen && canAddStand && (
        <Overlay z={85}>
          <form onSubmit={handleCreateNewStand} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-300 flex flex-col">
            <div className="bg-slate-900 p-3.5 flex justify-between items-center text-white">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                إضافة ستاند جديد للمصنع
              </h3>
              <button type="button" onClick={() => setAddStandModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">اسم الستاند:</label>
                  <input
                    type="text"
                    required
                    value={newStandForm.name}
                    onChange={e => setNewStandForm({ ...newStandForm, name: e.target.value })}
                    placeholder="مثال: ستاند 13"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">شكل الممر:</label>
                  <input
                    type="text"
                    value={newStandForm.type}
                    onChange={e => setNewStandForm({ ...newStandForm, type: e.target.value })}
                    placeholder="بيضاوي / مربع / مشرشر"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">قطر الدرفيل (مم):</label>
                  <input
                    type="text"
                    value={newStandForm.diameter}
                    onChange={e => setNewStandForm({ ...newStandForm, diameter: e.target.value })}
                    placeholder="مثال: 320"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono font-bold outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">عدد الممرات:</label>
                  <input
                    type="number"
                    min="1"
                    max="40"
                    required
                    value={newStandForm.totalPasses}
                    onChange={e => setNewStandForm({ ...newStandForm, totalPasses: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono font-bold outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">الصلابة (Hardness):</label>
                  <input
                    type="text"
                    value={newStandForm.hardness}
                    onChange={e => setNewStandForm({ ...newStandForm, hardness: e.target.value })}
                    placeholder="مثال: 50 HRC"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">الحد الأقصى للممر (طن):</label>
                  <input
                    type="number"
                    min="100"
                    required
                    value={newStandForm.maxLimit}
                    onChange={e => setNewStandForm({ ...newStandForm, maxLimit: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono font-bold outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-xs shadow mt-1">
                تأكيد إضافة الستاند
              </button>
            </div>
          </form>
        </Overlay>
      )}

      {/* ===== نافذة إدارة أكواد الفنيين والمهندسين (للمدير والأدمن) ===== */}
      {staffModalOpen && canManageUsers && (
        <Overlay z={85}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-300 flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 p-3.5 flex justify-between items-center text-white shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                إدارة أكواد وصلاحيات فريق العمل (فني / مهندس / مدير)
              </h3>
              <button onClick={() => setStaffModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4 bg-slate-50">
              <form onSubmit={handleAddStaffMember} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-blue-600" /> إضافة كود فرد جديد باسمه وصلاحيته:
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">اسم الفرد (فني / مهندس):</label>
                    <input
                      type="text"
                      value={newStaffForm.name}
                      onChange={e => setNewStaffForm({ ...newStaffForm, name: e.target.value })}
                      placeholder="مثال: م. أحمد / فني محمد"
                      className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">الكود السري الخاص به:</label>
                    <input
                      type="text"
                      value={newStaffForm.code}
                      onChange={e => setNewStaffForm({ ...newStaffForm, code: e.target.value })}
                      placeholder="6 حروف أو أرقام على الأقل"
                      className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-center outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">الصلاحية والوظيفة:</label>
                    <select
                      value={newStaffForm.role}
                      onChange={e => setNewStaffForm({ ...newStaffForm, role: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold bg-white outline-none focus:border-blue-500"
                    >
                      <option value="tech">فني إنتاج (يرسل طلبات للموافقة)</option>
                      <option value="engineer">مهندس إنتاج (اعتماد مباشر + تسجيل)</option>
                      <option value="manager">مدير مصنع (كامل الصلاحيات)</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-xs shadow transition-colors">
                  + إنشاء وحفظ الكود باسم الفرد
                </button>
              </form>

              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-black text-slate-700">الأفراد المسجلون حالياً ({staffAccounts.length}):</h4>
                {staffAccounts.length === 0 ? (
                  <div className="text-center py-6 bg-white rounded-xl border border-slate-200 text-slate-400 text-xs font-bold">
                    لم يتم إضافة أفراد بعد.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {staffAccounts.map(member => (
                      <div key={member.id} className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-xs text-slate-900">{member.name}</span>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                              member.role === 'manager' ? 'bg-emerald-100 text-emerald-800' :
                              member.role === 'engineer' ? 'bg-purple-100 text-purple-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {member.roleTitle || ROLE_TITLES[member.role]}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                            الكود: <strong className="text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">••••••</strong>
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteStaffMember(member.id)}
                          className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                          title="حذف الكود"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Overlay>
      )}

      {/* نافذة: الوردية مسجلة قبل كده */}
      {dupModal && existingShiftLog && (
        <Overlay z={95}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-amber-300">
            <div className="bg-amber-500 text-slate-950 p-3 font-black text-sm flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> الوردية دي مسجلة قبل كده</div>
            <div className="p-4 flex flex-col gap-3 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-2 gap-2 font-bold">
                <div className="text-slate-500">{existingShiftLog.date} - {existingShiftLog.shift}</div>
                <div className="text-slate-500 text-left" dir="ltr">{existingShiftLog.time}</div>
                <div>المسجل: <span className="font-mono text-blue-700">{existingShiftLog.billets} بليت</span></div>
                <div className="font-mono text-green-700">{existingShiftLog.tons.toFixed(1)} طن</div>
                <div className="col-span-2 border-t border-slate-200 pt-2">الجديد: <span className="font-mono text-amber-700">{Number(shiftBillets)} بليت</span> <span className="font-mono text-slate-500">({(Number(shiftBillets) * billetWeight).toFixed(1)} طن)</span></div>
              </div>
              <button onClick={() => commitShift('replace')} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg shadow">
                استبدال الرقم المسجل بالجديد ({Number(shiftBillets)} بليت)
              </button>
              <button onClick={() => commitShift('add')} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg shadow">
                إضافته على المسجل (المجموع {existingShiftLog.billets + Number(shiftBillets)} بليت)
              </button>
              <button onClick={() => setDupModal(false)} className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 rounded-lg">إلغاء</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ===== نافذة إدخال بيانات الدرفيل الجديد عند التغيير ===== */}
      {newRollModal.isOpen && newRollStandObj && (
        <Overlay z={65}>
          <form onSubmit={confirmInstallNewRoll} className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-300 flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 p-3.5 flex justify-between items-center text-white shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-emerald-400" />
                {canApplyDirect(newRollStandObj.id) ? 'تركيب درفيل جديد وإدخال بياناته' : 'طلب تركيب درفيل جديد'} ({newRollStandObj.name})
              </h3>
              <button type="button" onClick={() => setNewRollModal({ isOpen: false, standIndex: null })} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 flex flex-col gap-3 overflow-y-auto">
              {!canApplyDirect(newRollStandObj.id) && (
                <div className="bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-bold p-2 rounded-lg flex items-start gap-1.5">
                  <Hourglass className="w-4 h-4 shrink-0" /> سيتم إرسال مواصفات الدرفيل الجديد باسم ({roleLabel}) للمدير للمراجعة والاعتماد.
                </div>
              )}
              {!isManagerLike && canApplyDirect(newRollStandObj.id) && (
                <div className="bg-sky-50 border border-sky-300 text-sky-900 text-[11px] font-bold p-2 rounded-lg flex items-start gap-1.5">
                  <CheckCircle className="w-4 h-4 shrink-0" /> التغيير ده هيتنفذ فوراً باسم ({roleLabel}) وبيوصل للمدير للمراجعة والتأكيد.
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">قطر الدرفيل الجديد (مم):</label>
                  <input
                    type="text"
                    required
                    value={newRollForm.diameter}
                    onChange={e => setNewRollForm({ ...newRollForm, diameter: e.target.value })}
                    placeholder="مثال: 380"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono font-bold outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">عدد ممرات الدرفيل الجديد:</label>
                  <input
                    type="number"
                    min="1"
                    max="40"
                    required
                    value={newRollForm.totalPasses}
                    onChange={e => setNewRollForm({ ...newRollForm, totalPasses: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono font-bold outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">كود الدرفيل الجديد:</label>
                  <input
                    type="text"
                    value={newRollForm.rollCode}
                    onChange={e => setNewRollForm({ ...newRollForm, rollCode: e.target.value })}
                    placeholder="اختياري (مثال: 112)"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">الصلابة (Hardness):</label>
                  <input
                    type="text"
                    value={newRollForm.hardness}
                    onChange={e => setNewRollForm({ ...newRollForm, hardness: e.target.value })}
                    placeholder="مثال: 45 HRC"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">شكل الممر:</label>
                  <input
                    type="text"
                    value={newRollForm.type}
                    onChange={e => setNewRollForm({ ...newRollForm, type: e.target.value })}
                    placeholder="بيضاوي / مربع / دائري"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">تاريخ دخول الخدمة:</label>
                  <input
                    type="date"
                    value={newRollForm.entryDate}
                    onChange={e => {
                      const d = e.target.value;
                      const valid = shiftsFor(isISODateFriday(d));
                      setNewRollForm({ ...newRollForm, entryDate: d, shift: valid.includes(newRollForm.shift) ? newRollForm.shift : valid[0] });
                    }}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">الممر اللي هيشتغل عليه:</label>
                  <select
                    value={newRollForm.startPass}
                    onChange={e => setNewRollForm({ ...newRollForm, startPass: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono bg-white outline-none focus:border-blue-500"
                  >
                    {Array.from({ length: Math.max(1, Math.min(40, Number(newRollForm.totalPasses) || 1)) }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>ممر {n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">الوردية اللي تم فيها التغيير:</label>
                  <select
                    value={newRollForm.shift}
                    onChange={e => setNewRollForm({ ...newRollForm, shift: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold bg-white outline-none focus:border-blue-500"
                  >
                    {newRollShifts.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">الحد الأقصى للممر (طن):</label>
                  <input
                    type="number" min="100"
                    value={newRollForm.maxLimit}
                    onChange={e => setNewRollForm({ ...newRollForm, maxLimit: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono font-bold outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-700 block mb-1">
                  عدد البليت اللي اشتغله الدرفيل القديم (ممر {newRollStandObj.activePass}) في بداية ({newRollForm.shift}) قبل التغيير:
                </label>
                <input
                  type="number" min="0"
                  value={newRollForm.billets}
                  onChange={e => setNewRollForm({ ...newRollForm, billets: e.target.value })}
                  placeholder="مثال: 12 بليت (سيب فاضي لو التغيير بعد انتهاء الوردية)"
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono outline-none focus:border-blue-500"
                />
              </div>
              {newRollPreview && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[11px] flex flex-col gap-1.5">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-slate-600">إجمالي إنتاج الدرفيل القديم:</span>
                    <span className="font-mono font-black text-blue-700">{newRollOldTotal.toFixed(1)} طن</span>
                  </div>
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-slate-600">افتتاحية الممر {newRollForm.startPass} على الدرفيل الجديد:</span>
                    <span className="font-mono font-black text-emerald-700">{newRollPreview.newPassOpeningTons.toFixed(1)} طن</span>
                  </div>
                  {Number(newRollForm.billets) > 0 && (
                    <div className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded p-1.5 leading-relaxed">
                      {newRollPreview.isShiftAlreadyLogged
                        ? `✓ ${newRollForm.shift} مسجلة بالفعل: يتم إضافة ${Number(newRollForm.billets)} بليت للدرفيل القديم وتحويل باقي الوردية (${newRollPreview.transferredNowBillets} بليت) للدرفيل الجديد.`
                        : `⏳ ${newRollForm.shift} لم تسجل بعد: تتضاف ${Number(newRollForm.billets)} بليت للدرفيل القديم فوراً، وعند تسجيل الوردية بتتخصم تلقائياً ويتحسب الباقي للدرفيل الجديد.`}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-700 block mb-1">ملاحظات أو سبب تغيير الدرفيل:</label>
                <input
                  type="text"
                  value={newRollForm.notes}
                  onChange={e => setNewRollForm({ ...newRollForm, notes: e.target.value })}
                  placeholder="انتهاء عمر الممرات، خرط درفيل، تغيير مقاس..."
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500"
                />
              </div>

              <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg shadow text-xs sm:text-sm mt-1">
                {canApplyDirect(newRollStandObj.id) ? 'تأكيد تركيب الدرفيل الجديد وتصفير الممرات' : 'إرسال بيانات الدرفيل الجديد للمدير للاعتماد'}
              </button>
            </div>
          </form>
        </Overlay>
      )}

      {/* ===== صفحة الدرفيل ===== */}
      {rollModal.isOpen && selectedRollStand && (() => {
        const st = selectedRollStand;
        const stat = getStandStatus(st.accumulatedTons, st.maxLimit);
        const pct = Math.min(100, Math.max(0, (st.accumulatedTons / st.maxLimit) * 100));
        const rollTotal = st.passes.reduce((a, p) => a + (Number(p.tons) || 0), 0);
        const usedCount = st.passes.filter(p => p.status === 'used' || p.status === 'active').length;
        const ordered = st.passes.filter(p => p.order !== null && p.order !== undefined).sort((a, b) => a.order - b.order);
        const myPending = pendingList.filter(r => String(r.standId) === String(st.id));
        const kpi = (label, value, unit, cls = 'text-slate-900') => (
          <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-slate-500">{label}</span>
            <span className={`font-mono font-black text-xl leading-tight ${cls}`}>{value}<span className="text-[10px] font-bold text-slate-400 mr-1">{unit}</span></span>
          </div>
        );
        return (
          <Overlay z={50}>
            <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-300 flex flex-col max-h-[94vh]">
              {/* الهيدر */}
              <div className="bg-slate-900 text-white p-4 shrink-0">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-400 text-slate-950 font-black rounded-xl w-14 h-14 flex flex-col items-center justify-center leading-none shadow">
                      <span className="text-[9px] font-bold">ستاند</span>
                      <span className="text-2xl">{st.id}</span>
                    </div>
                    <div>
                      <h3 className="font-black text-lg leading-tight">{st.name}</h3>
                      <div className="flex flex-wrap gap-1.5 mt-1.5 text-[10px] font-bold">
                        {st.type && <span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">شكل الممر: {st.type}</span>}
                        {st.diameter && <span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">القطر: <span className="font-mono text-amber-300">{st.diameter}</span> مم</span>}
                        {st.hardness && <span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">الصلابة: <span className="font-mono">{st.hardness}</span></span>}
                        {st.rollCode && <span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">كود الدرفيل: <span className="font-mono">{st.rollCode}</span></span>}
                        <span className="bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">دخل الخدمة: <span className="font-mono text-green-400">{st.entryDate}</span></span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setRollModal({ isOpen: false, standIndex: null, isEditingInfo: false })} className="text-slate-300 hover:text-white bg-slate-800 p-1.5 rounded-lg shrink-0"><X className="w-5 h-5" /></button>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-[10px] font-bold text-slate-300 mb-1">
                    <span>إنتاج الممر الحالي مقابل الحد الأقصى</span>
                    <span className="font-mono">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: stat.hex }} />
                  </div>
                </div>
              </div>

              <div className="p-3 sm:p-4 overflow-y-auto flex-1 flex flex-col gap-3">
                {myPending.map(r => (
                  <div key={r.id} className={`rounded-xl border p-2.5 text-xs font-bold flex items-center justify-between gap-2 ${r.status === 'pending' ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-red-50 border-red-300 text-red-800'}`}>
                    <span className="flex items-center gap-1.5">
                      {r.status === 'pending' ? <Hourglass className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      {r.status === 'pending' ? `بانتظار موافقة المدير (طلب: ${r.requestedBy}): ` : 'المدير رفض الطلب: '}
                      {r.kind === 'newRoll' ? `تركيب درفيل جديد (قطر ${r.newDiameter || '-'})` : `نقل من ممر ${r.fromPass} إلى ممر ${r.targetPass}`}
                      {r.status === 'rejected' && r.rejectReason ? ` — السبب: ${r.rejectReason}` : ''}
                    </span>
                    {r.status === 'rejected' && <button onClick={() => dismissRequest(r.id)} className="bg-white border border-red-300 px-2 py-0.5 rounded text-[10px]">حسناً</button>}
                  </div>
                ))}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {kpi('الممر الشغال حالياً', `${st.activePass} / ${st.totalPasses}`, 'ممر', 'text-blue-700')}
                  {kpi('إنتاج الممر الحالي', st.accumulatedTons.toFixed(0), 'طن', stat.text)}
                  {kpi('إجمالي إنتاج الدرفيل', rollTotal.toFixed(0), 'طن', 'text-emerald-700')}
                  {kpi('ممرات استُهلكت', usedCount, `من ${st.totalPasses}`, 'text-purple-700')}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => initiateResetStand(rollModal.standIndex)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow">
                      <ArrowLeftRight className="w-3.5 h-3.5" /> {canApplyDirect(st.id) ? 'تغيير الممر' : 'طلب تغيير ممر'}
                    </button>
                    <button onClick={handleInstallNewRoll} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 border border-emerald-300">
                      <RefreshCw className="w-3.5 h-3.5" /> {canApplyDirect(st.id) ? 'تركيب درفيل جديد' : 'طلب تركيب درفيل جديد'}
                    </button>
                    <button onClick={() => setHistoryModal({ isOpen: true, standId: st.id })} className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 border border-slate-300">
                      <History className="w-3.5 h-3.5" /> السجل
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isManagerLike && (
                      <button onClick={() => setRollModal(prev => ({ ...prev, isEditingInfo: !prev.isEditingInfo }))} className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 border border-slate-300">
                        <Edit3 className="w-3.5 h-3.5 text-blue-600" /> {rollModal.isEditingInfo ? 'إخفاء التعديل' : 'تعديل بيانات الدرفيل'}
                      </button>
                    )}
                    {canAddStand && Number(st.id) > 12 && (
                      <button onClick={() => handleDeleteStand(rollModal.standIndex)} className="bg-red-50 hover:bg-red-100 text-red-700 font-bold px-2.5 py-2 rounded-lg text-xs flex items-center gap-1 border border-red-200" title="حذف الستاند">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {isManagerLike && rollModal.isEditingInfo && (
                  <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-6 gap-2.5 items-end">
                    {[['كود الدرفيل', 'rollCode', 'text'], ['القطر (مم)', 'diameter', 'text'], ['الصلابة', 'hardness', 'text'], ['شكل الممر', 'type', 'text'], ['تاريخ الدخول', 'entryDate', 'date'], ['عدد الممرات', 'totalPasses', 'number']].map(([label, key, type]) => (
                      <div key={key}>
                        <label className="text-[10px] font-bold text-slate-700 block mb-1">{label}:</label>
                        <input type={type} min={type === 'number' ? 1 : undefined} max={type === 'number' ? 40 : undefined} value={rollEditForm[key]}
                          onChange={e => setRollEditForm({ ...rollEditForm, [key]: e.target.value })}
                          className="w-full p-1.5 rounded border border-slate-300 text-xs font-mono bg-white" />
                      </div>
                    ))}
                    <div className="col-span-2 sm:col-span-6 flex justify-end">
                      <button onClick={handleSaveRollMetadata} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-1.5 rounded-lg text-xs flex items-center gap-1 shadow"><Save className="w-3.5 h-3.5" /> حفظ التعديلات</button>
                    </div>
                  </div>
                )}

                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5"><Sliders className="w-4 h-4 text-indigo-600" /> توزيع الممرات على المنتجات</h4>
                    {isAdminRole && (
                      <button
                        onClick={() => {
                          if (allocOpenFor === String(st.id)) { setAllocOpenFor(null); return; }
                          const segs = allocSegments(st);
                          setAllocRows(segs.length ? segs.map(a => ({ label: String(a.label), count: String(a.count) })) : [{ label: '', count: '' }]);
                          setAllocOpenFor(String(st.id));
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-1 rounded-lg text-[11px] border border-slate-300">
                        {allocOpenFor === String(st.id) ? 'إغلاق' : 'تعديل التوزيع'}
                      </button>
                    )}
                  </div>
                  {allocOpenFor !== String(st.id) && (
                    allocSegments(st).length === 0
                      ? <p className="text-[11px] text-slate-400 font-bold">لم يتم تخصيص ممرات لمنتجات.</p>
                      : (
                        <div className="flex flex-wrap gap-1.5">
                          {(() => {
                            let from = 1;
                            return allocSegments(st).map((a, i) => {
                              const f = from; from += Number(a.count);
                              return (
                                <span key={i} className="px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 text-[11px] font-black">
                                  {a.label} مم: ممر {f}{Number(a.count) > 1 ? ` إلى ${from - 1}` : ''}
                                </span>
                              );
                            });
                          })()}
                        </div>
                      )
                  )}
                  {allocOpenFor === String(st.id) && isAdminRole && (
                    <div className="flex flex-col gap-2">
                      {allocRows.map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input value={r.label} onChange={e => setAllocRows(allocRows.map((x, k) => k === i ? { ...x, label: e.target.value } : x))}
                            placeholder="المنتج: 10 أو 12-16-18" className="flex-1 min-w-0 p-1.5 rounded border border-slate-300 text-xs font-mono" />
                          <input type="number" min="1" max={st.totalPasses} value={r.count} onChange={e => setAllocRows(allocRows.map((x, k) => k === i ? { ...x, count: e.target.value } : x))}
                            placeholder="عدد الممرات" className="w-24 p-1.5 rounded border border-slate-300 text-xs font-mono text-center" />
                          <button onClick={() => setAllocRows(allocRows.filter((_, k) => k !== i))} className="text-red-600 hover:bg-red-50 rounded p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                      {(() => {
                        const sum = allocRows.reduce((a, r) => a + (Math.floor(Number(r.count)) || 0), 0);
                        return (
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className={`text-[11px] font-bold ${sum > st.totalPasses ? 'text-red-600' : 'text-slate-500'}`}>الموزّع: {sum} من {st.totalPasses} ممر</span>
                            <div className="flex gap-2">
                              <button onClick={() => setAllocRows([...allocRows, { label: '', count: '' }])} className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-1 rounded-lg text-[11px] border border-slate-300 flex items-center gap-1"><Plus className="w-3 h-3" /> منتج</button>
                              <button onClick={handleSaveAlloc} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-1 rounded-lg text-[11px] flex items-center gap-1 shadow"><Save className="w-3 h-3" /> حفظ التوزيع</button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <h4 className="text-xs font-black text-slate-800 mb-2 flex items-center gap-1.5"><Layers className="w-4 h-4 text-blue-600" /> تسلسل تشغيل الممرات</h4>
                  {ordered.length === 0 ? <p className="text-[11px] text-slate-400 font-bold">لم يبدأ التشغيل بعد.</p> : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ordered.map((p, i) => (
                        <div key={p.passNumber} className="flex items-center gap-1.5">
                          <div className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border ${p.status === 'active' ? 'bg-slate-900 text-amber-400 border-amber-500' : 'bg-blue-50 text-blue-900 border-blue-200'}`}>
                            <span className="bg-amber-400 text-slate-950 font-black px-1.5 rounded text-[10px]">{p.order}</span>
                            ممر {p.passNumber}
                            <span className="font-mono text-[10px] opacity-75">{Number(p.tons).toFixed(0)}ط</span>
                          </div>
                          {i < ordered.length - 1 && <span className="text-slate-300 text-xs">←</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] font-bold text-slate-600">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-900 border-2 border-amber-400" />شغال حالياً</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-400" />اشتغل وانتهى</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-white border border-slate-300" />لم يعمل بعد</span>
                  </div>
                  <span className="text-slate-400">اضغط على ممر للنقل إليه</span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
                  {st.passes.map(p => {
                    const isCurrent = p.status === 'active' || p.passNumber === st.activePass;
                    const isUsed = !isCurrent && p.status === 'used';
                    const pLabel = passLabelOf(st, p.passNumber);
                    const isMatch = pLabel && labelHasSize(pLabel, selectedProductSize);
                    return (
                      <div key={p.passNumber} onClick={() => { if (!isCurrent) initiateResetStand(rollModal.standIndex, p.passNumber); }}
                        className={`rounded-xl border-2 p-2 flex flex-col gap-1 transition-all relative ${isCurrent ? 'bg-slate-900 text-white border-amber-400 shadow-lg' : isUsed ? 'bg-blue-50 text-blue-950 border-blue-300 hover:bg-blue-100 cursor-pointer' : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400 cursor-pointer'}`}>
                        {pLabel && (
                          <div className={`text-center text-[9px] font-black py-0.5 px-1 rounded-md -mt-0.5 mb-0.5 border ${
                            isMatch
                              ? 'bg-indigo-600 text-white border-indigo-700'
                              : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                          }`}>
                            مقاس {pLabel} مم
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="font-black text-xs">ممر {p.passNumber}</span>
                          {p.order && <span className="bg-amber-400 text-slate-950 font-black text-[9px] px-1.5 rounded">#{p.order}</span>}
                        </div>
                        <div className="text-center">
                          <span className={`font-mono font-black text-xl leading-none ${isCurrent ? 'text-amber-400' : isUsed ? 'text-blue-900' : 'text-slate-300'}`}>{Number(p.tons || 0).toFixed(0)}</span>
                          <span className="text-[9px] font-bold opacity-70 mr-1">طن</span>
                        </div>
                        <span className={`text-center text-[9px] font-bold py-0.5 rounded ${isCurrent ? 'bg-amber-400 text-slate-950' : isUsed ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                          {isCurrent ? 'شغال حالياً' : isUsed ? 'منتهي' : 'جديد'}
                        </span>
                        {isCurrent && isAdminRole && (
                          <div className="flex gap-1 pt-1 border-t border-amber-400/30" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => openPassTonsModal(rollModal.standIndex, p.passNumber, st.accumulatedTons, true)}
                              className="text-[9px] bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-400/40 px-1.5 py-0.5 rounded font-bold flex-1"
                            >
                              تعديل الإنتاجية
                            </button>
                          </div>
                        )}
                        {isManagerLike && !isCurrent && (
                          <div className="flex gap-1 pt-1 border-t border-slate-300/60" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => openPassTonsModal(rollModal.standIndex, p.passNumber, p.tons || 0, false)}
                              className="text-[9px] bg-slate-200 hover:bg-slate-300 text-slate-800 px-1.5 py-0.5 rounded font-bold flex-1"
                            >
                              تعديل
                            </button>
                            {isUsed && <button onClick={() => handleDirectPassStatusChange(rollModal.standIndex, p.passNumber, 'unused', 0)} className="text-[9px] bg-red-100 hover:bg-red-200 text-red-700 px-1.5 py-0.5 rounded font-bold">تصفير</button>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Overlay>
        );
      })()}

      {/* ===== نافذة تغيير الممر ===== */}
      {resetModal.isOpen && resetStandObj && (
        <Overlay z={60}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-300 flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 p-3 flex justify-between items-center text-white shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2"><RotateCcw className="w-4 h-4 text-amber-400" /> {canApplyDirect(resetStandObj.id) ? 'تغيير ممر' : 'طلب تغيير ممر'} - {resetStandObj.name}</h3>
              <button onClick={() => setResetModal({ isOpen: false, standIndex: null })} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 flex flex-col gap-3 overflow-y-auto">
              {(() => {
                const lbl = passLabelOf(resetStandObj, Number(resetTargetPass));
                if (!lbl || labelHasSize(lbl, selectedProductSize)) return null;
                return (
                  <div className="bg-orange-50 border border-orange-300 text-orange-900 text-[11px] font-bold p-2 rounded-lg flex items-start gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> الممر {resetTargetPass} مخصص لمنتج ({lbl} مم) والمقاس الحالي {selectedProductSize} مم.
                  </div>
                );
              })()}
              {!canApplyDirect(resetStandObj.id) && (
                <div className="bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-bold p-2 rounded-lg flex items-start gap-1.5">
                  <Hourglass className="w-4 h-4 shrink-0" /> التغيير هيتبعت باسم ({roleLabel}) للمدير للموافقة، ومش هيتنفذ إلا بعد اعتماده.
                </div>
              )}
              {!isManagerLike && canApplyDirect(resetStandObj.id) && (
                <div className="bg-sky-50 border border-sky-300 text-sky-900 text-[11px] font-bold p-2 rounded-lg flex items-start gap-1.5">
                  <CheckCircle className="w-4 h-4 shrink-0" /> التغيير ده هيتنفذ فوراً باسم ({roleLabel}) وبيوصل للمدير للمراجعة والتأكيد.
                </div>
              )}
              <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-lg flex justify-between items-center text-xs font-bold text-blue-900">
                <span>الممر الشغال: <strong className="bg-slate-900 text-amber-400 px-2 py-0.5 rounded font-mono">ممر {resetStandObj.activePass}</strong></span>
                <span>الرصيد المسجل حالياً: <strong className="font-mono text-blue-700">{resetStandObj.accumulatedTons.toFixed(1)} طن</strong></span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-slate-800 flex items-center gap-1"><Layers className="w-4 h-4 text-blue-600" /> 1. اختر الممر الجديد:</label>
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 bg-slate-100 p-2 rounded-xl border border-slate-200 max-h-40 overflow-y-auto">
                  {resetStandObj.passes.map(p => {
                    const sel = Number(resetTargetPass) === p.passNumber;
                    const cur = p.passNumber === resetStandObj.activePass;
                    const used = p.status === 'used' && !cur;
                    const pLabel = passLabelOf(resetStandObj, p.passNumber);
                    return (
                      <button type="button" key={p.passNumber} onClick={() => setResetTargetPass(p.passNumber)}
                        className={`p-1 rounded-lg font-mono text-xs font-black border-2 flex flex-col items-center transition-all ${sel ? 'bg-emerald-600 text-white border-emerald-900 shadow-md scale-105' : cur ? 'bg-slate-900 text-amber-400 border-amber-400' : used ? 'bg-blue-100 text-blue-900 border-blue-300 opacity-80' : 'bg-white text-slate-800 border-slate-300 hover:border-blue-500'}`}>
                        {pLabel && (
                          <span className={`text-[7px] font-sans font-black px-1 rounded mb-0.5 leading-tight ${sel ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-800'}`}>
                            {pLabel}مم
                          </span>
                        )}
                        <span>{p.passNumber}</span>
                        <span className="text-[8px] font-normal opacity-80">{cur ? 'الحالي' : used ? `${Number(p.tons).toFixed(0)}ط` : 'جديد'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-700">تاريخ التغيير:</label>
                  <input type="date" value={resetDateInput} onChange={handleResetDateChange} className="w-full border border-slate-300 rounded p-1.5 font-mono text-xs focus:border-blue-500 outline-none" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-700">الوردية التي تم فيها التغيير:</label>
                  <select value={resetShiftInput} onChange={(e) => setResetShiftInput(e.target.value)} className="w-full bg-white border border-slate-300 text-[10px] font-bold p-1.5 rounded outline-none focus:border-blue-500">
                    {resetModalShifts.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-700">
                  عدد البليت الذي اشتغله الممر القديم (ممر {resetStandObj.activePass}) في بداية ({resetShiftInput}):
                </label>
                <input type="number" value={resetBillets} onChange={e => setResetBillets(e.target.value)} className="w-full border border-slate-300 rounded p-2 font-mono text-xs focus:border-blue-500 outline-none" placeholder="مثال: 12 بليت (أو اتركه فارغاً لو الممر اتغير مع بداية الوردية بالظبط)" />
              </div>

              {resetPreview && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[11px] flex flex-col gap-1.5">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-slate-600">إجمالي قفل الممر القديم (ممر {resetStandObj.activePass}):</span>
                    <span className="font-mono font-black text-blue-700">{resetPreview.finalOldPassTons.toFixed(1)} طن</span>
                  </div>
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-slate-600">افتتاحية الممر الجديد (ممر {resetTargetPass}):</span>
                    <span className="font-mono font-black text-emerald-700">{resetPreview.newPassOpeningTons.toFixed(1)} طن</span>
                  </div>
                  {Number(resetBillets) > 0 && (
                    <div className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded p-1.5 mt-0.5 leading-relaxed">
                      {resetPreview.isShiftAlreadyLogged
                        ? `✓ ${resetShiftInput} مسجلة بالفعل: تم إضافة الـ ${Number(resetBillets)} بليت على رصيد الممر القديم، وتحويل باقي الوردية (${resetPreview.transferredNowBillets} بليت) للممر الجديد.`
                        : `⏳ ${resetShiftInput} لم تسجل بعد: سيتم إضافة الـ ${Number(resetBillets)} بليت على رصيد الممر القديم فوراً، وعند تسجيل إنتاج ${resetShiftInput} سيتم خصم الـ ${Number(resetBillets)} بليت تلقائياً وحساب الباقي للممر الجديد.`}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-700">ملاحظات أو سبب التغيير:</label>
                <textarea rows="2" value={resetNotes} onChange={e => setResetNotes(e.target.value)} className="w-full border border-slate-300 rounded p-2 text-xs focus:border-blue-500 outline-none resize-none" placeholder="تآكل ممر، خشونة، كسر، تغيير مقاس..."></textarea>
              </div>
              <button onClick={confirmResetStand} className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 active:scale-95 transition-all shadow text-xs sm:text-sm">
                {canApplyDirect(resetStandObj.id) ? `تأكيد قفل ممر ${resetStandObj.activePass} وتشغيل ممر ${resetTargetPass}` : `إرسال الطلب للمدير (ممر ${resetStandObj.activePass} ← ممر ${resetTargetPass})`}
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ===== نافذة موافقات المدير ===== */}
      {approvalsOpen && isManagerLike && (
        <Overlay z={70}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-300 flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 p-3 flex justify-between items-center text-white shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2"><Inbox className="w-4 h-4 text-amber-400" /> الطلبات والتغييرات للمراجعة ({pendingCount})</h3>
              <button onClick={() => setApprovalsOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-3 overflow-y-auto flex flex-col gap-3 bg-slate-50">
              {pendingCount === 0 && <div className="text-center py-10 text-slate-400 font-bold text-sm">مفيش طلبات معلّقة.</div>}
              {pendingList.filter(r => r.status === 'pending').map(r => {
                const st = stands.find(s => String(s.id) === String(r.standId));
                const ed = getEdit(r);
                const preview = st
                  ? computePassSplit(st, ed.date || r.date, ed.shift || r.shift, ed.billets, billetWeight, productionArchive)
                  : null;
                const rollOldTotal = st && preview && r.kind === 'newRoll'
                  ? st.passes.reduce((a, p) => a + (p.passNumber === st.activePass ? 0 : (Number(p.tons) || 0)), 0) + preview.finalOldPassTons
                  : 0;
                return (
                  <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2 shadow-sm">
                    <div className="flex justify-between items-center flex-wrap gap-1">
                      <span className="font-black text-sm text-slate-900">{r.standName}</span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded ${r.kind === 'newRoll' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>{r.kind === 'newRoll' ? 'تركيب درفيل جديد' : 'تغيير ممر'}</span>
                    </div>
                    <div className="text-[10px] text-slate-600 font-bold bg-slate-100 px-2 py-1 rounded">
                      مقدم الطلب: <strong className="text-blue-700">{r.requestedBy}</strong> | {r.createdAt} | {r.date} - {r.shift} | مقاس {r.productSize}
                    </div>
                    {r.kind === 'pass' ? (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] font-bold">
                          <div><label className="block text-slate-600 mb-0.5">من ممر {r.fromPass} إلى ممر:</label>
                            <select value={ed.targetPass} onChange={e => setEdit(r.id, { targetPass: Number(e.target.value) })} className="w-full border border-slate-300 rounded p-1.5 font-mono bg-white">
                              {st && st.passes.map(p => <option key={p.passNumber} value={p.passNumber}>ممر {p.passNumber}</option>)}
                            </select></div>
                          <div><label className="block text-slate-600 mb-0.5">بليت الممر القديم:</label>
                            <input type="number" min="0" value={ed.billets} onChange={e => setEdit(r.id, { billets: e.target.value })} className="w-full border border-slate-300 rounded p-1.5 font-mono" /></div>
                          <div><label className="block text-slate-600 mb-0.5">التاريخ:</label>
                            <input type="date" value={convertGBToISO(ed.date || r.date)} onChange={e => {
                              const iso = e.target.value;
                              const valid = shiftsFor(isISODateFriday(iso));
                              setEdit(r.id, { date: formatDateToGB(iso), shift: valid.includes(ed.shift) ? ed.shift : valid[0] });
                            }} className="w-full border border-slate-300 rounded p-1.5 font-mono bg-white" /></div>
                          <div><label className="block text-slate-600 mb-0.5">الوردية:</label>
                            <select value={ed.shift || r.shift} onChange={e => setEdit(r.id, { shift: e.target.value })} className="w-full border border-slate-300 rounded p-1.5 bg-white">
                              {shiftsFor(isISODateFriday(convertGBToISO(ed.date || r.date))).map(s => <option key={s} value={s}>{s}</option>)}
                            </select></div>
                          <div className="col-span-2"><label className="block text-slate-600 mb-0.5">ملاحظات:</label>
                            <input type="text" value={ed.notes || ''} onChange={e => setEdit(r.id, { notes: e.target.value })} className="w-full border border-slate-300 rounded p-1.5" /></div>
                        </div>
                        {preview && (
                          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-[10px] font-bold text-blue-900 flex flex-wrap justify-between gap-2">
                            <span>قفل ممر {r.fromPass}: <strong className="font-mono">{preview.finalOldPassTons.toFixed(1)} طن</strong></span>
                            <span>افتتاحية ممر {ed.targetPass}: <strong className="font-mono">{preview.newPassOpeningTons.toFixed(1)} طن</strong></span>
                            {!preview.isShiftAlreadyLogged && Number(ed.billets) > 0 && (
                              <span className="text-amber-800 w-full">سيتم خصم {Number(ed.billets)} بليت تلقائياً عند تسجيل {r.shift}</span>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-bold bg-emerald-50/60 border border-emerald-200 rounded-lg p-2.5">
                        <div>
                          <label className="block text-slate-600 mb-0.5">القطر الجديد (مم):</label>
                          <input type="text" value={ed.newDiameter} onChange={e => setEdit(r.id, { newDiameter: e.target.value })} className="w-full border border-slate-300 rounded p-1 font-mono bg-white" />
                        </div>
                        <div>
                          <label className="block text-slate-600 mb-0.5">عدد الممرات:</label>
                          <input type="number" value={ed.newTotalPasses} onChange={e => setEdit(r.id, { newTotalPasses: e.target.value })} className="w-full border border-slate-300 rounded p-1 font-mono bg-white" />
                        </div>
                        <div>
                          <label className="block text-slate-600 mb-0.5">الصلابة:</label>
                          <input type="text" value={ed.newHardness} onChange={e => setEdit(r.id, { newHardness: e.target.value })} className="w-full border border-slate-300 rounded p-1 font-mono bg-white" />
                        </div>
                        <div>
                          <label className="block text-slate-600 mb-0.5">كود الدرفيل:</label>
                          <input type="text" value={ed.newRollCode} onChange={e => setEdit(r.id, { newRollCode: e.target.value })} className="w-full border border-slate-300 rounded p-1 font-mono bg-white" />
                        </div>
                        <div>
                          <label className="block text-slate-600 mb-0.5">يبدأ من ممر:</label>
                          <select value={ed.startPass} onChange={e => setEdit(r.id, { startPass: Number(e.target.value) })} className="w-full border border-slate-300 rounded p-1 font-mono bg-white">
                            {Array.from({ length: Math.max(1, Math.min(40, Number(ed.newTotalPasses) || 1)) }, (_, i) => i + 1).map(n => <option key={n} value={n}>ممر {n}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-slate-600 mb-0.5">بليت القديم في {r.shift}:</label>
                          <input type="number" min="0" value={ed.billets ?? ''} onChange={e => setEdit(r.id, { billets: e.target.value })} className="w-full border border-slate-300 rounded p-1 font-mono bg-white" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-slate-600 mb-0.5">ملاحظات:</label>
                          <input type="text" value={ed.notes || ''} onChange={e => setEdit(r.id, { notes: e.target.value })} className="w-full border border-slate-300 rounded p-1 bg-white" />
                        </div>
                      </div>
                    )}
                    {r.kind === 'newRoll' && preview && (
                      <div className="bg-blue-50 border border-blue-200 rounded p-2 text-[10px] font-bold text-blue-900 flex flex-wrap justify-between gap-2">
                        <span>إجمالي إنتاج الدرفيل القديم: <strong className="font-mono">{rollOldTotal.toFixed(1)} طن</strong></span>
                        <span>افتتاحية ممر {ed.startPass}: <strong className="font-mono">{preview.newPassOpeningTons.toFixed(1)} طن</strong></span>
                        {!preview.isShiftAlreadyLogged && Number(ed.billets) > 0 && (
                          <span className="text-amber-800 w-full">سيتم خصم {Number(ed.billets)} بليت تلقائياً عند تسجيل {r.shift}</span>
                        )}
                      </div>
                    )}
                    <input type="text" value={ed.rejectReason || ''} onChange={e => setEdit(r.id, { rejectReason: e.target.value })} placeholder="سبب الرفض (اختياري، بيظهر لصاحب الطلب)" className="w-full border border-slate-200 rounded p-1.5 text-[10px] bg-slate-50" />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => rejectRequest(r)} className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 font-bold px-4 py-1.5 rounded-lg text-xs flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> رفض</button>
                      <button onClick={() => approveRequest(r)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-1.5 rounded-lg text-xs flex items-center gap-1 shadow"><Check className="w-3.5 h-3.5" /> اعتماد التنفيذ</button>
                    </div>
                  </div>
                );
              })}

              {passChanges.some(c => c.needsReview) && (
                <div className="text-[11px] font-black text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1.5">
                  تغييرات اتنفذت مباشرة (ستاندات 8 إلى 12) - راجعها وأكدها أو عدّلها
                </div>
              )}
              {passChanges.filter(c => c.needsReview).map(c => (
                <div key={c.id} className="bg-white border-2 border-sky-200 rounded-xl p-3 flex flex-col gap-2 shadow-sm">
                  <div className="flex justify-between items-center flex-wrap gap-1">
                    <span className="font-black text-sm text-slate-900">{c.standName}</span>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-sky-100 text-sky-800">تم التنفيذ - للمراجعة</span>
                  </div>
                  <div className="text-[10px] text-slate-600 font-bold bg-slate-100 px-2 py-1 rounded">
                    نفّذه: <strong className="text-blue-700">{c.requestedBy}</strong> | {c.date} - {c.shift} | {c.time} | مقاس {c.productSize}
                  </div>
                  <div className="text-[11px] font-bold text-slate-800 flex flex-wrap justify-between gap-2">
                    <span>{c.kind === 'newRoll' ? 'تركيب درفيل جديد' : `من ممر ${c.fromPass} ← ممر ${c.toPass}`}</span>
                    <span>إنتاج الممر المقفول: <strong className="font-mono">{Number(c.tons).toFixed(1)} طن</strong></span>
                    <span>بليت إضافي: {c.billetsAtChange || 0}</span>
                  </div>
                  {c.notes && <div className="text-[10px] text-slate-600 font-bold">{c.notes}</div>}
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button onClick={() => handleDeletePassChange(c, true)} className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> رفض وحذف</button>
                    <button onClick={() => openEditPassChange(c, true)} className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1"><Edit3 className="w-3.5 h-3.5" /> تعديل التغيير</button>
                    <button onClick={() => confirmReviewedChange(c)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-1.5 rounded-lg text-xs flex items-center gap-1 shadow"><Check className="w-3.5 h-3.5" /> تأكيد</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Overlay>
      )}

      {passReportOpen && (
        <Overlay z={90}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden border border-slate-300 flex flex-col max-h-[92vh]">
            <div className="bg-slate-900 p-3 flex justify-between items-center text-white shrink-0 gap-2 flex-wrap">
              <h3 className="font-bold text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-amber-400" /> تقرير الممرات</h3>
              <div className="flex items-center gap-2">
                {isManagerLike && (
                  <>
                    <button onClick={() => downloadExcel(reportData, 'pass')} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1 rounded text-[10px] flex items-center gap-1"><FileSpreadsheet className="w-3.5 h-3.5" /> Excel</button>
                    <button onClick={() => printPDF(reportData, onPrintBlocked, 'pass')} className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1 rounded text-[10px] flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> طباعة</button>
                  </>
                )}
                <button onClick={() => setPassReportOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="overflow-auto bg-slate-200 p-2">
              <iframe
                title="تقرير الممرات"
                srcDoc={buildPassReportHTML(reportData)}
                style={{ width: 1180, height: Math.max(660, 400 + stands.length * 36), border: 0, background: '#fff', display: 'block' }}
              />
            </div>
          </div>
        </Overlay>
      )}

      {activityOpen && isAdminRole && (
        <Overlay z={90}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-300 flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 p-3 flex justify-between items-center text-white shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2"><History className="w-4 h-4 text-amber-400" /> سجل النشاط (آخر {activityList.length})</h3>
              <div className="flex items-center gap-2">
                <button onClick={handleClearActivity} className="text-[10px] bg-red-600 hover:bg-red-700 px-2 py-1 rounded font-bold">مسح السجل</button>
                <button onClick={() => setActivityOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="p-3 overflow-y-auto flex flex-col gap-1.5 bg-slate-50">
              {activityList.length === 0 && <div className="text-center py-10 text-slate-400 font-bold text-sm">مفيش نشاط مسجل لسه.</div>}
              {activityList.map(a => (
                <div key={a.id} className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px]">
                  <div className="flex justify-between gap-2 flex-wrap">
                    <span className="font-black text-slate-900">{a.action}</span>
                    <span className="text-[10px] text-slate-500 font-bold">{a.at}</span>
                  </div>
                  <div className="text-slate-600 font-bold">
                    <span className="text-blue-700">{a.user}</span>{' '}
                    <span className="text-[10px] text-slate-400">({ROLE_TITLES[a.role] || a.role})</span>
                    {a.details ? <span> — {a.details}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Overlay>
      )}

      {/* ===== نافذة تعديل إنتاجية الممر (الشغال للأدمن / المنتهي للمدير والأدمن) ===== */}
      {passTonsModal.isOpen && (
        <Overlay z={95}>
          <form onSubmit={handleSavePassTons} className="bg-white rounded-xl shadow-2xl w-full max-w-xs overflow-hidden border border-slate-300">
            <div className="bg-slate-900 p-3 flex justify-between items-center text-white">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-400" />
                {passTonsModal.isCurrent ? `تعديل إنتاجية الممر الشغال (${passTonsModal.passNumber})` : `تعديل إنتاجية ممر ${passTonsModal.passNumber}`}
              </h3>
              <button type="button" onClick={() => setPassTonsModal({ isOpen: false, standIndex: null, passNumber: null, isCurrent: false, tonsInput: '' })} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">الإنتاجية التراكمية (بالطن):</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  autoFocus
                  required
                  value={passTonsModal.tonsInput}
                  onChange={e => setPassTonsModal(prev => ({ ...prev, tonsInput: e.target.value }))}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-center font-mono text-lg font-black outline-none focus:border-blue-500"
                />
                {billetWeight > 0 && Number(passTonsModal.tonsInput) > 0 && (
                  <p className="text-[10px] text-slate-500 font-bold text-center mt-1">
                    يعادل تقريباً {Math.round(Number(passTonsModal.tonsInput) / billetWeight)} بليت (وزن البليت {billetWeight} طن)
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPassTonsModal({ isOpen: false, standIndex: null, passNumber: null, isCurrent: false, tonsInput: '' })} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 rounded-lg text-xs">إلغاء</button>
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-xs shadow">حفظ الإنتاجية</button>
              </div>
            </div>
          </form>
        </Overlay>
      )}

      {/* ===== نافذة تعديل سجل تغييرة ممر (للأدمن / المدير) ===== */}
      {editChangeModal.isOpen && (
        <Overlay z={96}>
          <form onSubmit={handleSavePassChange} className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-300 flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 p-3 flex justify-between items-center text-white shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-400" />
                تعديل سجل التغيير ({editChangeForm.standName})
              </h3>
              <button type="button" onClick={() => setEditChangeModal({ isOpen: false, changeId: null, fromReview: false })} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 flex flex-col gap-3 overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">التاريخ:</label>
                  <input
                    type="date"
                    value={editChangeForm.date}
                    onChange={e => {
                      const d = e.target.value;
                      const valid = shiftsFor(isISODateFriday(d));
                      setEditChangeForm(prev => ({ ...prev, date: d, shift: valid.includes(prev.shift) ? prev.shift : valid[0] }));
                    }}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono text-xs outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">الوردية:</label>
                  <select
                    value={editChangeForm.shift}
                    onChange={e => setEditChangeForm(prev => ({ ...prev, shift: e.target.value }))}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold bg-white outline-none focus:border-blue-500"
                  >
                    {shiftsFor(isISODateFriday(editChangeForm.date)).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">من ممر:</label>
                  <input
                    type="number" min="1" max="40"
                    value={editChangeForm.fromPass}
                    onChange={e => setEditChangeForm(prev => ({ ...prev, fromPass: e.target.value }))}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono text-xs outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">إلى ممر:</label>
                  <input
                    type="number" min="1" max="40"
                    value={editChangeForm.toPass}
                    onChange={e => setEditChangeForm(prev => ({ ...prev, toPass: e.target.value }))}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono text-xs outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">إنتاج الممر/الدرفيل (طن):</label>
                  <input
                    type="number" step="0.1" min="0"
                    value={editChangeForm.tons}
                    onChange={e => setEditChangeForm(prev => ({ ...prev, tons: e.target.value }))}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono text-xs font-bold outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">بليت إضافي وقت التغيير:</label>
                  <input
                    type="number" min="0"
                    value={editChangeForm.billetsAtChange}
                    onChange={e => setEditChangeForm(prev => ({ ...prev, billetsAtChange: e.target.value }))}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono text-xs outline-none focus:border-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">مقاس المنتج (مم):</label>
                  <select
                    value={editChangeForm.productSize}
                    onChange={e => setEditChangeForm(prev => ({ ...prev, productSize: e.target.value }))}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold bg-white outline-none focus:border-blue-500"
                  >
                    {['10', '12', '16', '18', '22'].map(s => <option key={s} value={s}>{s} مم</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">ملاحظات:</label>
                  <textarea
                    rows="2"
                    value={editChangeForm.notes}
                    onChange={e => setEditChangeForm(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500 resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-1">
                <button type="button" onClick={() => setEditChangeModal({ isOpen: false, changeId: null, fromReview: false })} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2.5 rounded-lg text-xs">إلغاء</button>
                <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-xs shadow">حفظ التعديلات</button>
              </div>
            </div>
          </form>
        </Overlay>
      )}

      {/* ===== سجل الستاند ===== */}
      {historyModal.isOpen && (
        <Overlay z={80}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-300 flex flex-col max-h-[80vh]">
            <div className="bg-slate-800 p-3 flex justify-between items-center text-white shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2"><History className="w-4 h-4" /> سجل تغييرات ستاند {historyModal.standId}</h3>
              <button onClick={() => setHistoryModal({ isOpen: false, standId: null })} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-3 overflow-y-auto flex-1 flex flex-col gap-2 bg-slate-50">
              {passChanges.filter(c => String(c.standId) === String(historyModal.standId)).length === 0 ? (
                <div className="text-center py-8 text-slate-400 font-bold text-xs">لا يوجد سجل تغييرات لهذا الستاند.</div>
              ) : passChanges.filter(c => String(c.standId) === String(historyModal.standId)).map(c => (
                <div key={c.id} className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-1.5">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                    <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{c.date} | <span className="text-blue-700">{c.shift}</span></span>
                    <span className="text-[11px] font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">إنتاج: {Number(c.tons).toFixed(1)} طن</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-600 font-bold">
                    <span>مقاس: {c.productSize} مم</span>
                    <span>{c.kind === 'newRoll' ? `تركيب درفيل جديد ${c.newDiameter ? `(قطر ${c.newDiameter})` : ''}` : `من ممر ${c.fromPass} ← ممر ${c.toPass}`}</span>
                    <span>بليت إضافي: {c.billetsAtChange || 0}</span>
                  </div>
                  {(c.requestedBy || c.approvedBy) && <div className="text-[9px] text-slate-500 font-bold">بواسطة: <span className="text-blue-700">{c.requestedBy || '-'}</span> | اعتماد: <span className="text-emerald-700">{c.approvedBy || '-'}</span></div>}
                  <p className="text-[10px] text-slate-700 bg-orange-50 p-1.5 rounded border border-orange-100"><span className="font-bold text-orange-700">ملاحظات:</span> {c.notes}</p>
                  {isAdminRole && (
                    <div className="flex justify-end gap-1.5 pt-1 border-t border-slate-100">
                      <button onClick={() => openEditPassChange(c, false)} className="text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-bold flex items-center gap-1"><Edit3 className="w-3 h-3" /> تعديل</button>
                      <button onClick={() => handleDeletePassChange(c, false)} className="text-[10px] bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded font-bold flex items-center gap-1"><Trash2 className="w-3 h-3" /> حذف</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Overlay>
      )}

      {/* إعدادات الشعار */}
      {isSettingsOpen && (
        <Overlay z={50}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-300">
            <div className="bg-slate-800 p-3 flex justify-between items-center text-white">
              <h3 className="font-bold text-sm flex items-center gap-2"><Settings className="w-4 h-4" /> إعدادات الشعار</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1"><UploadCloud className="w-4 h-4 text-blue-600" /> رفع لوجو المصنع (من الجهاز):</label>
                <input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleLogoUpload}
                  className="w-full border border-slate-300 rounded p-1.5 text-xs file:mr-2 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 cursor-pointer" />
              </div>
              {tempLogoUrl && (
                <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 flex flex-col items-center gap-2">
                  <span className="text-[9px] font-bold text-slate-400">معاينة الشعار:</span>
                  <div className="bg-white p-2 rounded shadow-sm"><img src={tempLogoUrl} alt="Preview" className="h-16 object-contain" /></div>
                </div>
              )}
              <button onClick={handleSaveSettings} className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 flex justify-center items-center gap-2 shadow-md"><Save className="w-4 h-4" /> تطبيق الشعار</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* شريط الأدمن */}
      {isSuperAdmin && (
        <div className="bg-amber-500 text-slate-950 px-3 py-1 rounded flex flex-wrap justify-between items-center gap-2 shadow-sm flex-none">
          <div className="flex items-center gap-1.5 text-xs font-black">
            <ShieldAlert className="w-4 h-4" /><span>وضع الأدمن الشامل:</span>
            {adminState.isMaintenance && <span className="bg-red-700 text-white text-[9px] px-1.5 py-0.5 rounded">الموقع مغلق للزوار</span>}
          </div>
          <div className="flex items-center gap-1">
            {[['tech', 'عرض كـ فني', Edit3], ['manager', 'عرض كـ مدير', UserCog]].map(([r, label, Icon]) => (
              <button key={r} onClick={() => handleSuperAdminSwitchRole(r)} className={`px-2.5 py-1 rounded text-[10px] font-black flex items-center gap-1 ${currentUser === r ? 'bg-slate-900 text-amber-400 shadow' : 'bg-amber-400/60 hover:bg-amber-400 text-slate-900'}`}><Icon className="w-3 h-3" /> {label}</button>
            ))}
            <button onClick={() => handleSuperAdminSwitchRole('admin')} className={`px-2.5 py-1 rounded text-[10px] font-black flex items-center gap-1 ${currentUser === 'admin' && activeTab === 'admin' ? 'bg-slate-900 text-amber-400 shadow' : 'bg-amber-400/60 hover:bg-amber-400 text-slate-900'}`}><Settings2 className="w-3 h-3" /> إعدادات الأدمن</button>
          </div>
        </div>
      )}

      {/* ===== الشريط العلوي المنسق ===== */}
      <nav className="bg-slate-900 text-white p-2 rounded-lg flex flex-col gap-2 flex-none shadow-sm select-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          
          <div className="flex items-center gap-2 shrink-0">
            <div onClick={handleSecretAdminTrigger} className="flex items-center gap-2 cursor-pointer">
              {customLogo ? (
                <div className="bg-white p-1 rounded shadow-sm flex shrink-0">
                  <img src={customLogo} alt="Logo" className="h-5 sm:h-6 w-auto max-w-[65px] sm:max-w-[100px] object-contain" />
                </div>
              ) : (
                <div className="bg-blue-600/20 border border-blue-500/40 p-1.5 rounded-lg">
                  <Settings2 className="w-4 h-4 text-blue-400" />
                </div>
              )}
              <span className="font-black text-xs sm:text-sm text-slate-100 hidden sm:inline">الجيوشي للصلب</span>
            </div>
            <LiveClock />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {isManagerLike && (
              <button
                onClick={() => setApprovalsOpen(true)}
                className="relative bg-amber-500 hover:bg-amber-400 text-slate-950 px-2 py-1 rounded-md text-[10px] font-black flex items-center gap-1 shadow-sm transition-colors"
                title="طلبات الموافقة"
              >
                <Inbox className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">الطلبات</span>
                {pendingCount > 0 && (
                  <span className="bg-red-600 text-white text-[9px] font-black rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </button>
            )}

            {canAddStand && (
              <button
                onClick={openAddStandModal}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 shadow-sm transition-colors"
                title="إضافة ستاند جديد"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">إضافة ستاند</span>
              </button>
            )}

            {canManageUsers && (
              <button
                onClick={() => setStaffModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 shadow-sm transition-colors"
                title="إدارة أكواد الفنيين والمهندسين"
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">أكواد الأفراد</span>
              </button>
            )}

            {isAdminRole && (
              <button
                onClick={openSettingsModal}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-1.5 rounded-md shadow-sm transition-colors"
                title="رفع شعار المصنع"
              >
                <Settings className="w-3.5 h-3.5 text-blue-300" />
              </button>
            )}

            <span className="bg-slate-800 px-2 py-1 rounded-md text-[10px] font-bold text-blue-300 flex items-center gap-1.5 border border-slate-700 max-w-[135px] sm:max-w-[200px]">
              <span className={`w-2 h-2 rounded-full shrink-0 ${auth ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-slate-400'}`}></span>
              <span className="truncate">{roleLabel}</span>
            </span>

            <button
              onClick={handleLogout}
              className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 px-2 py-1 rounded-md text-[10px] font-bold transition-colors"
            >
              خروج
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 bg-slate-800 p-1.5 rounded-lg justify-between items-center">
          <div className="flex gap-1.5 w-full sm:w-auto overflow-x-auto">
            {[['dashboard', 'التشغيل والممرات', TrendingUp], ['analytics', 'الإحصائيات', BarChart3], ['archive', 'الأرشيف', Archive]].map(([k, label, Icon]) => (
              <button key={k} onClick={() => setActiveTab(k)} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded flex justify-center items-center gap-1 transition-all whitespace-nowrap ${activeTab === k ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'}`}><Icon className="w-3 h-3" /> {label}</button>
            ))}
            {isSuperAdmin && (
              <button onClick={() => { setCurrentUser('admin'); setActiveTab('admin'); }} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded flex justify-center items-center gap-1 whitespace-nowrap ${activeTab === 'admin' ? 'bg-amber-500 text-slate-950 shadow' : 'text-amber-400 hover:bg-slate-700'}`}><ShieldAlert className="w-3.5 h-3.5" /> لوحة الأدمن</button>
            )}
          </div>
          {activeTab === 'dashboard' && (
            <div className="flex items-center gap-2 w-full sm:w-auto bg-slate-700 px-2 py-1 rounded border border-slate-600">
              <span className="text-white text-xs font-bold whitespace-nowrap">مقاس المنتج:</span>
              <select value={selectedProductSize} onChange={(e) => handleProductSizeChange(e.target.value)} className="bg-white text-slate-900 text-xs font-bold px-2 py-1 rounded outline-none w-full sm:w-auto cursor-pointer">
                {['10', '12', '16', '18', '22'].map(s => <option key={s} value={s}>{s} مم</option>)}
              </select>
            </div>
          )}
        </div>
      </nav>

      {/* لوحة الأدمن */}
      {activeTab === 'admin' && isSuperAdmin && (
        <div className="flex-1 bg-white rounded-lg shadow border border-slate-300 p-4 overflow-y-auto flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between border-b pb-3 gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-amber-500" />
              <div>
                <h2 className="font-black text-base text-slate-800">لوحة تحكم المسؤول (Admin Panel)</h2>
                <p className="text-xs text-slate-500 font-bold">إدارة حالة الموقع، أكواد الدخول، واختبار النظام</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={openAddStandModal} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> إضافة ستاند جديد</button>
              <button onClick={() => setStaffModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow flex items-center gap-1"><Users className="w-3.5 h-3.5" /> إدارة أكواد الأفراد</button>
              <button onClick={() => { setCurrentUser('tech'); setActiveTab('dashboard'); }} className="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow flex items-center gap-1"><Edit3 className="w-3.5 h-3.5" /> اختبار كـ فني</button>
              <button onClick={() => { setCurrentUser('manager'); setActiveTab('dashboard'); }} className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow flex items-center gap-1"><UserCog className="w-3.5 h-3.5" /> اختبار كـ مدير</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-center justify-between">
              <div><span className="text-xs font-bold text-blue-800 block">إجمالي زيارات الموقع</span><span className="font-mono font-black text-3xl text-blue-900">{adminState.visitsCount || 1}</span><span className="text-[10px] text-blue-600 block mt-1">آخر تواجد: {adminState.lastVisit || 'الآن'}</span></div>
              <Eye className="w-10 h-10 text-blue-400 opacity-70" />
            </div>
            <div className={`border p-4 rounded-xl flex items-center justify-between ${adminState.isMaintenance ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-200'}`}>
              <div><span className="text-xs font-bold text-slate-700 block">حالة الموقع</span><span className={`font-black text-lg ${adminState.isMaintenance ? 'text-amber-700' : 'text-emerald-700'}`}>{adminState.isMaintenance ? 'مغلق للصيانة' : 'يعمل (متاح)'}</span></div>
              <Power className={`w-9 h-9 ${adminState.isMaintenance ? 'text-amber-500' : 'text-emerald-500'}`} />
            </div>
            <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl flex items-center justify-between">
              <div><span className="text-xs font-bold text-purple-800 block">الأفراد المسجلون بأكواد</span><span className="font-mono font-black text-3xl text-purple-900">{staffAccounts.length}</span><span className="text-[10px] text-purple-600 block mt-1">فني / مهندس / مدير</span></div>
              <Users className="w-10 h-10 text-purple-400 opacity-70" />
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5"><Wrench className="w-4 h-4 text-amber-600" /> وضع الصيانة والتحديث</h3>
                <p className="text-xs text-slate-500 mt-0.5">عند التفعيل تظهر للمستخدمين رسالة الصيانة، وأنت كأدمن تقدر تتصفح عادي.</p>
              </div>
              <button onClick={() => handleSaveAdminSettings({ ...adminState, isMaintenance: !adminState.isMaintenance })} className={`px-4 py-2 rounded-lg font-bold text-xs shadow text-white ${adminState.isMaintenance ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
                {adminState.isMaintenance ? 'فتح الموقع الآن' : 'قفل الموقع للصيانة'}
              </button>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">رسالة الإغلاق:</label>
              <input type="text" value={adminState.maintenanceMessage} onChange={(e) => setAdminState({ ...adminState, maintenanceMessage: e.target.value })} className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5"><Archive className="w-4 h-4 text-emerald-600" /> النسخ الاحتياطي وسجل النشاط</h3>
            <p className="text-xs text-slate-500">نزّل نسخة كاملة من البيانات على جهازك بشكل دوري. الاستعادة بتبدّل كل البيانات الحالية بمحتوى الملف.</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={handleBackupDownload} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg text-xs shadow">تنزيل نسخة كاملة</button>
              <button onClick={() => backupInputRef.current && backupInputRef.current.click()} className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs shadow">استعادة من ملف</button>
              <button onClick={() => setActivityOpen(true)} className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-4 py-2 rounded-lg text-xs shadow">سجل النشاط</button>
              <input ref={backupInputRef} type="file" accept="application/json,.json" onChange={handleBackupFile} className="hidden" />
            </div>
            <div className="flex items-center gap-2 border-t border-slate-200 pt-3 flex-wrap">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-bold text-slate-700">نسبة تنبيه الممرات (%):</span>
              <PercentControl value={alertPercent} onCommit={handleAlertPercentChange} />
              <span className="text-[10px] text-slate-500 font-bold">بيظهر تنبيه لكل الأدوار لما أي ستاند يوصل النسبة دي (من 50 إلى 100).</span>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5"><Key className="w-4 h-4 text-blue-600" /> تغيير كلمة مرور الأدمن</h3>
            <p className="text-xs text-slate-500">أكواد الفنيين والمهندسين والمدراء بتتعمل من قسم الأفراد، وبتتخزن مشفّرة ومش بتظهر لحد.</p>
            <div className="flex gap-2">
              <input type="password" value={newAdminPw} onChange={(e) => setNewAdminPw(e.target.value)} placeholder="كلمة المرور الجديدة (8 على الأقل)" className="flex-1 p-2 border border-slate-300 rounded font-mono text-sm" />
              <button onClick={handleChangeAdminPassword} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2 rounded-lg text-xs shadow">تغيير</button>
            </div>
          </div>
        </div>
      )}

      {/* لوحة التشغيل */}
      {activeTab === 'dashboard' && (
        <div className="flex flex-col gap-2 flex-1 overflow-hidden p-1">

          <div className="flex-none flex items-center justify-between gap-2 bg-white rounded-lg border border-slate-300 shadow-sm px-2.5 py-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Sliders className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-xs font-bold text-slate-700">متوسط وزن البليت (طن):</span>
              <WeightControl value={billetWeight} onCommit={handleWeightChange} />
            </div>
            <button onClick={() => setPassReportOpen(true)} title="تقرير الممرات"
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-2.5 py-1.5 rounded-lg text-[11px] flex items-center gap-1.5 shadow active:scale-95 transition-colors">
              <FileText className="w-4 h-4 text-amber-300" /> تقرير الممرات
            </button>
          </div>

          {alertStands.length > 0 && (() => {
            const pctOf = (s) => (s.accumulatedTons / s.maxLimit) * 100;
            const dangerN = alertStands.filter(s => pctOf(s) >= 100).length;
            const warnN = alertStands.length - dangerN;
            const sorted = [...alertStands].sort((x, y) => pctOf(y) - pctOf(x));
            return (
              <div className="flex-none bg-amber-50 border border-amber-300 rounded-lg text-amber-900">
                <button type="button" onClick={() => setAlertExpanded(v => !v)}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] font-black">
                  <span className="flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" /> تنبيه ممرات</span>
                  <span className="flex items-center gap-1.5">
                    {dangerN > 0 && <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">خطر {dangerN}</span>}
                    {warnN > 0 && <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 border border-yellow-300">إنذار {warnN}</span>}
                    {alertExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </span>
                </button>
                {alertExpanded && (
                  <div className="px-2.5 pb-2 pt-1.5 border-t border-amber-200 flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                    {sorted.map(s => {
                      const p = pctOf(s);
                      return (
                        <span key={s.id} className={`px-1.5 py-0.5 rounded border text-[10px] font-black ${p >= 100 ? 'bg-red-100 text-red-800 border-red-300' : 'bg-yellow-100 text-yellow-800 border-yellow-300'}`}>
                          {s.name} {p.toFixed(0)}%
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {isManagerLike && (
            <div className="flex flex-col flex-none bg-white rounded-lg border border-slate-300 shadow-sm overflow-hidden">
              <div
                onClick={() => setIsManagerToolbarOpen(!isManagerToolbarOpen)}
                className="p-2 flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-slate-50 transition-colors select-none"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <span className="bg-green-100 text-green-800 border border-green-300 px-2 py-0.5 rounded-md text-[10px] font-black">
                    سليم (&lt;80%): {greenCount}
                  </span>
                  <span className="bg-yellow-100 text-yellow-800 border border-yellow-400 px-2 py-0.5 rounded-md text-[10px] font-black">
                    إنذار (+80%): {warnCount}
                  </span>
                  <span className="bg-red-100 text-red-800 border border-red-400 px-2 py-0.5 rounded-md text-[10px] font-black">
                    خطر (+100%): {dangerCount}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 hidden sm:inline">
                    | إجمالي الستاندات: {stands.length}
                  </span>
                </div>

                <button
                  type="button"
                  className="bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1 shadow-sm"
                >
                  <Sliders className="w-3 h-3 text-blue-400" />
                  <span>{isManagerToolbarOpen ? 'إخفاء الأدوات والتقارير' : 'أدوات المدير والتقارير'}</span>
                  {isManagerToolbarOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {isManagerToolbarOpen && (
                <div className="px-2.5 pb-2.5 pt-2 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {canAddStand && (
                      <button onClick={openAddStandModal} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded text-[10px] flex items-center gap-1 shadow active:scale-95">
                        <Plus className="w-3.5 h-3.5" /> إضافة ستاند جديد
                      </button>
                    )}
                    {canManageUsers && (
                      <button onClick={() => setStaffModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded text-[10px] flex items-center gap-1 shadow active:scale-95">
                        <Users className="w-3.5 h-3.5" /> أكواد الفنيين والمهندسين
                      </button>
                    )}
                    {exportButtons}
                    {canAddStand && (
                      <>
                    <button onClick={handleResetAllStands} className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-1.5 px-3 rounded text-[10px] flex items-center gap-1 shadow active:scale-95"><RefreshCw className="w-3 h-3" /> تصفير كل الستاندات</button>
                    <button onClick={handleClearArchive} className="bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-3 rounded text-[10px] flex items-center gap-1 shadow active:scale-95"><Trash2 className="w-3 h-3" /> مسح الأرشيف</button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {canRecordShift && (
            <div className="bg-white p-2 rounded-lg shadow-sm flex flex-col flex-none border border-slate-300 gap-2">
              <div className="bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-bold p-1.5 rounded flex justify-between items-center">
                <button onClick={() => handleDateChange(-1)} className="px-3 py-1 bg-blue-200 hover:bg-blue-300 rounded active:scale-95 text-blue-900">يوم سابق</button>
                <div className="flex items-center gap-2">
                  <button onClick={handleGoToToday} className="px-2 py-1 bg-green-500 hover:bg-green-600 rounded active:scale-95 text-white shadow-sm text-[9px] font-bold flex gap-1 items-center" title="تحديث للآن">الآن <RotateCcw className="w-3 h-3" /></button>
                  <div className="flex flex-col items-center">
                    <span>تسجيل لـ: {currentProdDate.toLocaleDateString('ar-EG', { weekday: 'long' })} (الوزن: {billetWeight} طن)</span>
                    <span className="font-mono text-[11px] text-blue-600">{currentDateStr}</span>
                  </div>
                </div>
                <button onClick={() => handleDateChange(1)} className="px-3 py-1 bg-blue-200 hover:bg-blue-300 rounded active:scale-95 text-blue-900">يوم تالي</button>
              </div>

              {existingShiftLog && (
                <div className="bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-bold p-2 rounded flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  الوردية دي متسجلة قبل كده: <span className="font-mono">{existingShiftLog.billets} بليت / {existingShiftLog.tons.toFixed(1)} طن</span>
                  <span className="text-amber-700 font-normal">(بواسطة {existingShiftLog.recordedBy || 'فني'} الساعة {existingShiftLog.time})</span>
                </div>
              )}

              <div className="flex flex-row gap-1 items-stretch w-full">
                <input type="number" value={shiftBillets} onChange={(e) => setShiftBillets(e.target.value)} className="flex-1 min-w-0 p-2 border border-slate-400 rounded text-center text-sm font-bold outline-none focus:border-blue-500 bg-slate-50" placeholder="عدد البليت" />
                <select value={selectedShift} onChange={(e) => setSelectedShift(e.target.value)} className="flex-1 min-w-0 bg-slate-100 border border-slate-400 text-xs font-bold p-1 rounded outline-none focus:border-blue-500 cursor-pointer">
                  {availableShifts.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={handleAddShiftProduction} className="flex-1 min-w-0 bg-blue-600 hover:bg-blue-700 text-white font-bold p-1 rounded active:scale-95 flex justify-center items-center gap-1 shadow-sm text-[11px] sm:text-sm"><Save className="w-3 h-3 sm:w-4 sm:h-4" /> حفظ وإغلاق</button>
              </div>
            </div>
          )}

          {/* شبكة الستاندات */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 overflow-y-auto pr-1 pb-1 content-start">
            {stands.map((stand, idx) => {
              const percentage = Math.max(0, Math.min((stand.accumulatedTons / stand.maxLimit) * 100, 100));
              const status = getStandStatus(stand.accumulatedTons, stand.maxLimit);
              const usedCount = stand.passes ? stand.passes.filter(p => p.status === 'used' || p.status === 'active').length : 1;
              const sp = pendingList.filter(r => String(r.standId) === String(stand.id));
              const hasPending = sp.some(r => r.status === 'pending');
              const hasRejected = sp.some(r => r.status === 'rejected');
              const currentShiftKey = `${currentDateStr}__${selectedShift}`;
              const preDeductedBillets = Number((stand.preCountedShifts || {})[currentShiftKey] || 0);

              return (
                <div key={stand.id} onClick={() => openStandRollPage(idx)}
                  className={`min-h-[155px] sm:min-h-[168px] rounded-xl flex flex-col justify-between border-2 cursor-pointer ${stand.isActive ? status.bg : 'bg-slate-300 opacity-60'} ${status.border} p-2 relative overflow-hidden shadow-sm hover:shadow-md hover:scale-[1.01] transition-all`}>
                  <div className="absolute bottom-0 left-0 w-full h-1.5 bg-slate-300/50">
                    <div className={`h-full ${status.bar}`} style={{ width: `${percentage}%`, transition: 'width 0.5s ease-in-out' }}></div>
                  </div>

                  <div className="flex justify-between items-start z-10">
                    <div className="flex flex-col">
                      <span className="font-black text-sm sm:text-base text-slate-900">{stand.name}</span>
                      <span className="text-[9px] text-slate-500 font-bold">{[stand.type, stand.diameter && `قطر ${stand.diameter}`].filter(Boolean).join(' | ')}</span>
                    </div>
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setHistoryModal({ isOpen: true, standId: stand.id })} className="p-1 text-blue-600 bg-blue-100 hover:bg-blue-200 rounded" title="سجل الممر"><History className="w-3.5 h-3.5" /></button>
                      {canRecordShift ? (
                        <button onClick={(e) => handleToggleActive(idx, e)} className={`p-1 rounded ${stand.isActive ? 'text-green-600 bg-white/80 hover:bg-white' : 'text-slate-500 bg-black/10'}`}><Power className="w-3.5 h-3.5" /></button>
                      ) : (status.color === 'danger' && <AlertTriangle className="w-4 h-4 text-red-500 animate-ping" />)}
                    </div>
                  </div>

                  {(hasPending || hasRejected) && (
                    <span className={`z-10 self-start text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 ${hasPending ? 'bg-amber-400 text-slate-950' : 'bg-red-600 text-white'}`}>
                      {hasPending ? <><Hourglass className="w-3 h-3" /> بانتظار المدير</> : <><XCircle className="w-3 h-3" /> طلب مرفوض</>}
                    </span>
                  )}

                  {preDeductedBillets > 0 && (
                    <span className="z-10 self-start text-[8px] font-bold bg-blue-100 text-blue-800 border border-blue-300 px-1.5 py-0.5 rounded">
                      يُخصم {preDeductedBillets} بليت عند تقفيل الوردية
                    </span>
                  )}

                  <div className="flex flex-col items-center justify-center flex-1 z-10 py-1">
                    <span className={`font-mono font-black text-3xl sm:text-4xl leading-none tracking-tighter ${status.text}`}>{stand.accumulatedTons.toFixed(0)}</span>
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className="bg-slate-900 text-amber-400 text-[10px] font-black px-2 py-0.5 rounded shadow-sm">ممر {stand.activePass} / {stand.totalPasses}</span>
                      <span className="text-[9px] font-bold text-slate-600 bg-white/80 px-1.5 py-0.5 rounded border border-slate-200">استُهلك {usedCount}</span>
                    </div>
                    <span className="text-[9px] font-bold opacity-75 mt-1 text-slate-600">الهدف: {stand.maxLimit} طن</span>
                  </div>

                  {currentUser === 'tech' ? (
                    <div className="grid grid-cols-2 gap-1 z-10 mt-auto" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openStandRollPage(idx)} className="py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-md shadow">الممرات ({stand.totalPasses})</button>
                      <button onClick={(e) => initiateResetStand(idx, null, e)} className="py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold rounded-md shadow">طلب نقل ممر</button>
                    </div>
                  ) : (
                    <div className="mt-auto pt-1.5 border-t border-black/10 flex items-center justify-between gap-1 z-10 w-full" onClick={e => e.stopPropagation()}>
                      <button onClick={(e) => initiateResetStand(idx, null, e)} className="bg-red-500 hover:bg-red-600 text-white text-[9px] sm:text-[10px] px-2 py-0.5 rounded font-bold shadow-sm shrink-0">تغيير ممر</button>
                      <button onClick={() => openStandRollPage(idx)} className="bg-blue-600 hover:bg-blue-700 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">الممرات</button>
                      <input type="number" value={stand.maxLimit} onChange={(e) => handleLimitChange(idx, e.target.value)} className="w-12 text-[10px] text-center border border-slate-300 rounded font-mono font-bold bg-white outline-none focus:border-blue-500 p-0.5 shadow-inner" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* الإحصائيات */}
      {activeTab === 'analytics' && (
        <div className="flex-1 bg-white rounded-lg shadow border border-slate-300 p-3 overflow-y-auto flex flex-col gap-4">
          <div className="flex items-center justify-between border-b pb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-600" /><h2 className="font-black text-sm text-slate-800">لوحة الإحصائيات وتحليل الإنتاجية</h2></div>
            {exportButtons}
          </div>
          {aggregatedLogs.length === 0 && passChanges.length === 0 ? (
            <div className="text-center py-12 text-slate-400 flex flex-col items-center gap-2"><BarChart3 className="w-10 h-10 opacity-30" /><p className="text-sm font-bold">لا توجد بيانات إنتاجية مسجلة بعد.</p></div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-200 text-center"><p className="text-[10px] font-bold text-blue-800">إجمالي الأطنان</p><p className="font-mono font-black text-lg sm:text-xl text-blue-900">{aggregatedLogs.reduce((a, c) => a + c.tons, 0).toFixed(1)} <span className="text-xs font-normal">طن</span></p></div>
                <div className="bg-green-50 p-2.5 rounded-lg border border-green-200 text-center"><p className="text-[10px] font-bold text-green-800">إجمالي البليت</p><p className="font-mono font-black text-lg sm:text-xl text-green-900">{aggregatedLogs.reduce((a, c) => a + c.billets, 0)} <span className="text-xs font-normal">بليت</span></p></div>
                <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-200 text-center"><p className="text-[10px] font-bold text-purple-800">الورديات المسجلة</p><p className="font-mono font-black text-lg sm:text-xl text-purple-900">{aggregatedLogs.length}</p></div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2"><RotateCcw className="w-4 h-4 text-orange-500" /><h3 className="font-bold text-xs text-slate-700">سجل تغيير الممرات والدرافيل</h3></div>
                {passChanges.length === 0 ? <p className="text-[10px] text-slate-500 text-center py-4 font-bold">لم يتم تسجيل أي تغيير بعد.</p> : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 max-h-60 overflow-y-auto pr-1">
                    {passChanges.map(c => (
                      <div key={c.id} className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-1.5">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                          <span className="font-bold text-xs text-slate-800 flex items-center gap-1"><Settings2 className="w-3.5 h-3.5 text-blue-500" /> {c.standName || `ستاند ${c.standId}`}</span>
                          <span className="text-[10px] font-black text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{Number(c.tons).toFixed(1)} طن</span>
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-600 font-bold"><span>{c.productSize} مم</span><span className="text-blue-700">{c.kind === 'newRoll' ? `درفيل جديد ${c.newDiameter ? `(${c.newDiameter})` : ''}` : `ممر ${c.fromPass} ← ${c.toPass}`}</span></div>
                        {c.requestedBy && <div className="text-[8px] text-slate-500 font-bold">بواسطة: {c.requestedBy}</div>}
                        <div className="flex justify-between text-[8px] text-slate-400 font-mono"><span dir="ltr">{c.date}</span><span dir="ltr">{c.shift}</span></div>
                        <p className="text-[10px] text-slate-700 bg-slate-50 p-1.5 rounded border border-slate-100 line-clamp-2" title={c.notes}><span className="font-bold text-blue-600">ملاحظات:</span> {c.notes}</p>
                        {isAdminRole && (
                          <div className="flex justify-end gap-1 pt-1 border-t border-slate-100">
                            <button onClick={() => openEditPassChange(c, false)} className="text-[9px] bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-bold flex items-center gap-0.5"><Edit3 className="w-2.5 h-2.5" /> تعديل</button>
                            <button onClick={() => handleDeletePassChange(c, false)} className="text-[9px] bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded font-bold flex items-center gap-0.5"><Trash2 className="w-2.5 h-2.5" /> حذف</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {aggregatedLogs.length > 0 && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2">
                  <div className="flex justify-between items-center"><h3 className="font-bold text-xs text-slate-700">مؤشر اتجاه الإنتاج</h3><span className="text-[9px] text-slate-400 font-mono">آخر 10 ورديات</span></div>
                  <div className="w-full h-40 bg-white rounded-lg border border-slate-200 p-2 relative flex items-end">
                    <svg className="absolute inset-0 w-full h-full p-4 overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                      <defs><linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" /><stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" /></linearGradient></defs>
                      {(() => {
                        const maxVal = Math.max(...aggregatedLogs.map(l => l.tons), 1);
                        const pts = [...aggregatedLogs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10).reverse().map((log, i, arr) => {
                          const x = arr.length === 1 ? 50 : (i / (arr.length - 1)) * 90 + 5;
                          return [x, 90 - (log.tons / maxVal) * 80];
                        });
                        const pathD = `M ${pts.map(p => p.join(',')).join(' L ')}`;
                        return (<>
                          <path d={`${pathD} L 95,95 L 5,95 Z`} fill="url(#grad)" />
                          <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                          {pts.map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="4" className="fill-blue-600 stroke-white stroke-2" />)}
                        </>);
                      })()}
                    </svg>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* الأرشيف */}
      {activeTab === 'archive' && (
        <div className="flex-1 bg-slate-100 rounded-lg shadow border border-slate-300 p-2 overflow-y-auto">
          {isManagerLike && <div className="flex justify-end mb-2">{exportButtons}</div>}
          {sortedDates.length === 0 ? (
            <div className="text-center py-10 text-slate-400 flex flex-col items-center gap-2"><List className="w-8 h-8 opacity-50" /><p className="text-sm font-bold">لا يوجد إنتاج بعد.</p></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pb-4">
              {sortedDates.map((date) => {
                const day = groupedArchive[date];
                return (
                  <div key={date} className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-all">
                    <div className="bg-slate-800 text-white p-2 flex justify-between items-center flex-wrap gap-1">
                      <div className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-blue-400" /><span className="font-bold text-xs">يوم {day.dayName}</span></div>
                      <span className="text-[9px] sm:text-[10px] font-mono text-slate-300 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">{date}</span>
                    </div>
                    <div className="bg-blue-50 p-2 flex flex-col sm:flex-row justify-between sm:items-center border-b border-blue-100 gap-1">
                      <span className="text-[10px] font-bold text-blue-900 hidden sm:inline">إجمالي الإنتاج:</span>
                      <div className="flex gap-1.5 justify-between w-full sm:w-auto">
                        <span className="bg-white text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border border-blue-200 text-center flex-1 sm:flex-none">{day.totalBillets} <span className="font-normal opacity-70">ب</span></span>
                        <span className="bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm text-center flex-1 sm:flex-none">{day.totalTons.toFixed(1)} <span className="font-normal opacity-90">ط</span></span>
                      </div>
                    </div>
                    <div className="p-1.5 flex-1 flex flex-col gap-1.5 bg-white">
                      {day.shiftsList.map((log, i) => (
                        <div key={i} className="flex flex-col sm:flex-row justify-between sm:items-center p-1.5 bg-slate-50 hover:bg-slate-100 rounded border border-slate-100">
                          <div className="flex justify-between sm:justify-start items-center sm:flex-col sm:items-start w-full sm:w-auto">
                            <span className="font-bold text-[10px] text-slate-800">{log.shift.replace('الوردية ', '').replace(' (12 ساعة)', '')} (مقاس {log.productSize || '10'} مم)</span>
                            <span className="text-[8px] text-slate-500 font-bold mt-0.5">{log.recordedBy ? `${log.recordedBy} • ` : ''}<span className="font-mono text-slate-400">{log.time}</span></span>
                          </div>
                          <div className="flex justify-between items-center text-left font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 mt-1 sm:mt-0 w-full sm:w-auto shadow-sm">
                            <div className="text-[10px]"><span className="font-bold text-slate-700">{log.billets}</span><span className="text-[7px] text-slate-400 mr-0.5">بليت</span></div>
                            <span className="mx-1.5 text-[10px] text-slate-300">|</span>
                            <div className="text-[10px]"><span className="font-bold text-green-600">{log.tons.toFixed(1)}</span><span className="text-[7px] text-green-700 mr-0.5">طن</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Root() {
  useEffect(() => {
    // تسجيل الـ service worker (في النسخة المنشورة بس)
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
    const register = () => navigator.serviceWorker.register('/sw.js').catch(e => console.error('SW register failed:', e));
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
