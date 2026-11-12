import React, { useState, useEffect } from 'react';
import { 
  Users, UserCog, Edit3, TrendingUp, AlertTriangle, CheckCircle, RotateCcw, 
  Save, Power, Settings2, Archive, CalendarDays, List, BarChart3, RefreshCw, 
  Sliders, Trash2, Clock, Settings, X, UploadCloud, FileText, History, 
  ShieldAlert, Lock, Eye, Key, Layers, Wrench, Check, ArrowLeftRight
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

/* ======================================================
  1. منطقة إعدادات قاعدة البيانات (Firebase)
  ======================================================
*/
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
    db = getFirestore(app);
  }
} catch (error) {
  console.error("Firebase init error:", error);
}

// الإعدادات القياسية للستاندات والممرات بناءً على شيت المصنع (GS-PLD/F-001)
const DEFAULT_STANDS_CONFIG = [
  { id: 'R.St', name: 'R.St', type: 'مربع', rollCode: 'R.S 10', diameter: '517/514', hardness: 'HRC', totalPasses: 3, maxLimit: 15000 },
  { id: '1', name: 'St. 1', type: 'بيضاوي', rollCode: '111', diameter: '380', hardness: '42 HRC', totalPasses: 6, maxLimit: 2500 },
  { id: '2', name: 'St. 2', type: 'مربع', rollCode: '207', diameter: '374', hardness: '45 HRC', totalPasses: 9, maxLimit: 2500 },
  { id: '3', name: 'St. 3', type: 'بيضاوي', rollCode: '307', diameter: '356', hardness: '46 HRC', totalPasses: 10, maxLimit: 2000 },
  { id: '4', name: 'St. 4', type: 'مربع', rollCode: '404', diameter: '400', hardness: '47 HRC', totalPasses: 15, maxLimit: 2000 },
  { id: '5', name: 'St. 5', type: 'بيضاوي', rollCode: '505', diameter: '371', hardness: '46 HRC', totalPasses: 14, maxLimit: 2000 },
  { id: '6', name: 'St. 6', type: 'مربع', rollCode: '604', diameter: '394', hardness: '47 HRC', totalPasses: 18, maxLimit: 2000 },
  { id: '7', name: 'St. 7', type: 'بيضاوي', rollCode: '70/ov', diameter: '340', hardness: '48 HRC', totalPasses: 15, maxLimit: 1500 },
  { id: '8', name: 'St. 8', type: 'دائري', rollCode: '804', diameter: '315', hardness: '45 HRC', totalPasses: 20, maxLimit: 1500 },
  { id: '9', name: 'St. 9', type: 'بيضاوي', rollCode: '90/ov', diameter: '345', hardness: '48 HRC', totalPasses: 19, maxLimit: 1000 },
  { id: '10', name: 'St. 10', type: '16 mm', rollCode: 'F16/15', diameter: '332', hardness: '51 HRC', totalPasses: 24, maxLimit: 1000 }
];

const createPassesArray = (count, activePassNum = 1, initialTons = 0) => {
  return Array.from({ length: count }, (_, idx) => {
    const pNum = idx + 1;
    const isCurrent = pNum === activePassNum;
    return {
      passNumber: pNum,
      status: isCurrent ? 'active' : 'unused', // 'unused' | 'active' | 'used'
      tons: isCurrent ? initialTons : 0,
      order: isCurrent ? 1 : null,
      sizeLabel: ''
    };
  });
};

const buildInitialStands = () => {
  const todayGB = new Date().toLocaleDateString('en-GB');
  return DEFAULT_STANDS_CONFIG.map((cfg) => ({
    id: cfg.id,
    name: cfg.name,
    type: cfg.type,
    rollCode: cfg.rollCode,
    diameter: cfg.diameter,
    hardness: cfg.hardness,
    entryDate: todayGB,
    totalPasses: cfg.totalPasses,
    activePass: 1,
    passes: createPassesArray(cfg.totalPasses, 1, 0),
    isActive: true,
    accumulatedTons: 0,
    maxLimit: cfg.maxLimit,
    lastResetDate: todayGB
  }));
};

// تطبيع بيانات الستاند لضمان توافق أي بيانات قديمة في Firebase مع النظام الجديد
const normalizeStand = (stand, idx) => {
  const cfg = DEFAULT_STANDS_CONFIG[idx] || DEFAULT_STANDS_CONFIG[0];
  const totalPasses = stand.totalPasses || cfg.totalPasses || 10;
  const activePass = stand.activePass || 1;
  const currentTons = stand.accumulatedTons || 0;

  let passes = stand.passes;
  if (!Array.isArray(passes) || passes.length !== totalPasses) {
    passes = createPassesArray(totalPasses, activePass, currentTons);
  } else {
    passes = passes.map(p => 
      p.passNumber === activePass 
        ? { ...p, status: 'active', tons: currentTons, order: p.order || 1 } 
        : p
    );
  }

  return {
    ...stand,
    id: stand.id ?? cfg.id,
    name: stand.name || cfg.name || `St. ${stand.id}`,
    type: stand.type || cfg.type || '',
    rollCode: stand.rollCode || cfg.rollCode || '',
    diameter: stand.diameter || cfg.diameter || '',
    hardness: stand.hardness || cfg.hardness || '',
    entryDate: stand.entryDate || stand.lastResetDate || new Date().toLocaleDateString('en-GB'),
    totalPasses,
    activePass,
    passes
  };
};

// مكون فرعي للساعة الحية
const LiveClock = () => {
  const [time, setTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex bg-slate-800 border border-slate-700 rounded px-2 py-0.5 items-center gap-1.5 shadow-inner">
      <Clock className="w-3 h-3 text-blue-400" />
      <div className="flex flex-col items-center leading-none mt-0.5">
        <span className="text-[10px] font-mono font-bold text-slate-100" dir="ltr">
          {time.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <span className="text-[7px] text-slate-400 mt-0.5">
          {time.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </div>
    </div>
  );
};

// دوال مساعدة للتاريخ
const formatDateToISO = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDateToGB = (yyyy_mm_dd) => {
  if (!yyyy_mm_dd) return '';
  const [y, m, d] = yyyy_mm_dd.split('-');
  return `${d}/${m}/${y}`;
};

const convertGBToISO = (gbDate) => {
  if (!gbDate || !gbDate.includes('/')) return formatDateToISO(new Date());
  const parts = gbDate.split('/');
  if (parts.length !== 3) return formatDateToISO(new Date());
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
};

// ======================================================
// بداية التطبيق الفعلي
// ======================================================
export default function App() {
  /* 2. المتغيرات الحية (State) */
  const [currentUser, setCurrentUser] = useState('none'); // 'none' | 'tech' | 'manager' | 'admin'
  const [activeTab, setActiveTab] = useState('dashboard'); 
  const [userAuth, setUserAuth] = useState(null); 
  
  const appId = 'al-gioshy-steel-rolls'; 

  const [stands, setStands] = useState(buildInitialStands);
  const [shiftBillets, setShiftBillets] = useState(''); 
  const [productionArchive, setProductionArchive] = useState([]); 
  const [passChanges, setPassChanges] = useState([]); 
  const [isDataLoaded, setIsDataLoaded] = useState(false); 
  
  const [billetWeight, setBilletWeight] = useState(0.75); 
  const [selectedProductSize, setSelectedProductSize] = useState('16'); 
  const [customLogo, setCustomLogo] = useState(""); 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempLogoUrl, setTempLogoUrl] = useState('');

  // متغيرات الأدمن، الصيانة، الأكواد، والزيارات
  const [adminState, setAdminState] = useState({
    isMaintenance: false,
    maintenanceMessage: 'الموقع مغلق حالياً لإجراء تحديثات وصيانة للنظام.. يرجى المحاولة لاحقاً.',
    techCode: '1111',
    managerCode: '2222',
    adminCode: '9999',
    visitsCount: 0,
    lastVisit: ''
  });
  const [loginPrompt, setLoginPrompt] = useState({ isOpen: false, role: '', codeInput: '', error: '' });
  const [visitLogged, setVisitLogged] = useState(false);

  // نافذة تفاصيل الدرفيل والممرات (عند الضغط على القائم)
  const [rollModal, setRollModal] = useState({ isOpen: false, standIndex: null, isEditingInfo: false });
  const [rollEditForm, setRollEditForm] = useState({
    rollCode: '',
    diameter: '',
    hardness: '',
    type: '',
    entryDate: '',
    totalPasses: 6
  });

  // نوافذ إضافية للريست الذكي واختيار الممر الجديد
  const [resetModal, setResetModal] = useState({ isOpen: false, standIndex: null });
  const [resetBillets, setResetBillets] = useState('');
  const [resetNotes, setResetNotes] = useState('');
  const [resetDateInput, setResetDateInput] = useState('');
  const [resetShiftInput, setResetShiftInput] = useState('');
  const [resetTargetPass, setResetTargetPass] = useState(null);
  
  const [historyModal, setHistoryModal] = useState({ isOpen: false, standId: null });

  // النوافذ الأساسية
  const [modal, setModal] = useState({ isOpen: false, type: '', title: '', message: '', onConfirm: null });
  const closeBox = () => setModal({ ...modal, isOpen: false });
  const showAlert = (title, message) => setModal({ isOpen: true, type: 'alert', title, message, onConfirm: closeBox });
  const showConfirm = (title, message, onConfirm) => setModal({ isOpen: true, type: 'confirm', title, message, onConfirm });

  /* ======================================================
    3. الاتصال وجلب البيانات (useEffect)
    ======================================================
  */
  useEffect(() => {
    if (!auth) { setIsDataLoaded(true); return; }
    signInAnonymously(auth).catch(e => console.error(e));
    const unsubscribeAuth = onAuthStateChanged(auth, setUserAuth);
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!userAuth || !db) return;
    const standsRef = doc(db, 'factory', appId, 'data', 'standsState');
    const archiveRef = doc(db, 'factory', appId, 'data', 'archiveState');
    const passChangesRef = doc(db, 'factory', appId, 'data', 'passChangesState'); 
    const settingsRef = doc(db, 'factory', appId, 'data', 'settingsState'); 
    const adminRef = doc(db, 'factory', appId, 'data', 'adminState');

    const unsubStands = onSnapshot(standsRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().standsList) {
        const rawList = docSnap.data().standsList;
        const normalized = rawList.map((st, idx) => normalizeStand(st, idx));
        setStands(normalized);
      } else {
        const initial = buildInitialStands();
        setDoc(standsRef, { standsList: initial });
        setStands(initial);
      }
      setIsDataLoaded(true);
    });

    const unsubArchive = onSnapshot(archiveRef, (docSnap) => {
      if (docSnap.exists()) setProductionArchive(docSnap.data().archiveList || []);
      else setDoc(archiveRef, { archiveList: [] });
    });

    const unsubPassChanges = onSnapshot(passChangesRef, (docSnap) => {
      if (docSnap.exists()) setPassChanges(docSnap.data().passChangesList || []);
      else setDoc(passChangesRef, { passChangesList: [] });
    });

    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.billetWeight) setBilletWeight(data.billetWeight);
        if (data.logoUrl) setCustomLogo(data.logoUrl);
        if (data.selectedProductSize) setSelectedProductSize(data.selectedProductSize);
      } else {
        setDoc(settingsRef, { billetWeight: 0.75, logoUrl: "", selectedProductSize: '16' }, { merge: true });
      }
    });

    const unsubAdmin = onSnapshot(adminRef, (docSnap) => {
      if (docSnap.exists()) {
        setAdminState(prev => ({ ...prev, ...docSnap.data() }));
      } else {
        const defaultAdmin = {
          isMaintenance: false,
          maintenanceMessage: 'الموقع مغلق حالياً لإجراء تحديثات وصيانة للنظام.. يرجى المحاولة لاحقاً.',
          techCode: '1111',
          managerCode: '2222',
          adminCode: '9999',
          visitsCount: 1,
          lastVisit: new Date().toLocaleString('ar-EG')
        };
        setDoc(adminRef, defaultAdmin);
        setAdminState(defaultAdmin);
      }
    });

    return () => { unsubStands(); unsubArchive(); unsubPassChanges(); unsubSettings(); unsubAdmin(); };
  }, [userAuth]);

  // تسجيل الزيارة مرة واحدة لكل جلسة فتح للموقع
  useEffect(() => {
    if (isDataLoaded && userAuth && db && !visitLogged) {
      setVisitLogged(true);
      const adminRef = doc(db, 'factory', appId, 'data', 'adminState');
      const newVisits = (adminState.visitsCount || 0) + 1;
      setDoc(adminRef, { 
        visitsCount: newVisits, 
        lastVisit: new Date().toLocaleString('ar-EG') 
      }, { merge: true }).catch(e => console.error(e));
    }
  }, [isDataLoaded, userAuth, db, visitLogged]);

  /* ======================================================
    4. منطق اليوم الإنتاجي ونظام الورديات
    ======================================================
  */
  const getInitialProductionState = () => {
    const now = new Date();
    const hour = now.getHours();
    const prodDate = new Date(now);
    
    if (hour < 8) prodDate.setDate(prodDate.getDate() - 1);
    
    const isFriday = prodDate.getDay() === 5; 
    let initialShift = '';
    
    if (isFriday) {
      initialShift = (hour >= 8 && hour < 20) ? 'الوردية الأولى (12 ساعة)' : 'الوردية الثانية (12 ساعة)';
    } else {
      if (hour >= 8 && hour < 16) initialShift = 'الوردية الأولى';
      else if (hour >= 16 && hour < 24) initialShift = 'الوردية الثانية';
      else initialShift = 'الوردية الثالثة';
    }
    return { prodDate, initialShift };
  };

  const initState = getInitialProductionState();
  const [currentProdDate, setCurrentProdDate] = useState(initState.prodDate);
  const [selectedShift, setSelectedShift] = useState(initState.initialShift);

  const isFriday = currentProdDate.getDay() === 5;
  const availableShifts = isFriday ? ['الوردية الأولى (12 ساعة)', 'الوردية الثانية (12 ساعة)'] : ['الوردية الأولى', 'الوردية الثانية', 'الوردية الثالثة'];

  useEffect(() => {
    if (!availableShifts.includes(selectedShift)) setSelectedShift(availableShifts[0]);
  }, [isFriday]);

  const handleDateChange = (direction) => {
    const newDate = new Date(currentProdDate);
    newDate.setDate(newDate.getDate() + direction);
    setCurrentProdDate(newDate);
    
    const isNewFriday = newDate.getDay() === 5;
    setSelectedShift(isNewFriday ? 'الوردية الأولى (12 ساعة)' : 'الوردية الأولى');
  };

  const handleGoToToday = () => {
    const state = getInitialProductionState();
    setCurrentProdDate(new Date(state.prodDate.getTime())); 
    setSelectedShift(state.initialShift);
  };

  /* ======================================================
    5. دوال التشغيل والحفظ السحابي
    ======================================================
  */
  const saveToCloud = async (newStands, newArchive, newWeight, newLogoUrl, newPassChanges, newProductSize, newAdminData) => {
    if (userAuth && db) {
      try {
        if (newStands) await setDoc(doc(db, 'factory', appId, 'data', 'standsState'), { standsList: newStands });
        if (newArchive) await setDoc(doc(db, 'factory', appId, 'data', 'archiveState'), { archiveList: newArchive });
        if (newPassChanges) await setDoc(doc(db, 'factory', appId, 'data', 'passChangesState'), { passChangesList: newPassChanges });
        if (newAdminData) await setDoc(doc(db, 'factory', appId, 'data', 'adminState'), newAdminData, { merge: true });
        
        const settingsUpdate = {};
        if (newWeight !== undefined && newWeight !== null) settingsUpdate.billetWeight = newWeight;
        if (newLogoUrl !== undefined && newLogoUrl !== null) settingsUpdate.logoUrl = newLogoUrl;
        if (newProductSize !== undefined && newProductSize !== null) settingsUpdate.selectedProductSize = newProductSize;
        
        if (Object.keys(settingsUpdate).length > 0) {
          await setDoc(doc(db, 'factory', appId, 'data', 'settingsState'), settingsUpdate, { merge: true });
        }
      } catch (error) { console.error("Save error:", error); }
    } else {
      if (newStands) setStands(newStands);
      if (newArchive) setProductionArchive(newArchive);
      if (newWeight !== undefined && newWeight !== null) setBilletWeight(newWeight);
      if (newLogoUrl !== undefined && newLogoUrl !== null) setCustomLogo(newLogoUrl);
      if (newPassChanges) setPassChanges(newPassChanges);
      if (newProductSize) setSelectedProductSize(newProductSize);
      if (newAdminData) setAdminState(prev => ({ ...prev, ...newAdminData }));
    }
  };

  const handleProductSizeChange = (size) => {
    setSelectedProductSize(size);
    const newStands = stands.map((stand, index) => {
      let active = true;
      if (['16', '18', '22'].includes(size)) {
        if (index > 10) active = false; 
      }
      return { ...stand, isActive: active };
    });
    saveToCloud(newStands, null, null, null, null, size, null);
  };

  const getStandStatus = (tons, limit) => {
    const percentage = Math.max(0, (tons / limit) * 100); 
    if (percentage >= 100) return { color: 'danger', bg: 'bg-red-100', border: 'border-red-500', bar: 'bg-red-600', text: 'text-red-700' };
    if (percentage >= 80) return { color: 'warning', bg: 'bg-yellow-100', border: 'border-yellow-400', bar: 'bg-yellow-500', text: 'text-yellow-700' };
    return { color: 'good', bg: 'bg-slate-50', border: 'border-slate-300', bar: 'bg-green-500', text: 'text-slate-700' };
  };

  const openSettingsModal = () => {
    setTempLogoUrl(customLogo);
    setIsSettingsOpen(true);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        showAlert("خطأ", "حجم الصورة كبير جداً. يرجى اختيار صورة أقل من 1 ميجابايت.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setTempLogoUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveSettings = () => {
    if (tempLogoUrl && tempLogoUrl.trim() !== '') {
      saveToCloud(null, null, null, tempLogoUrl.trim(), null, null, null);
    }
    setIsSettingsOpen(false);
  };

  const handleToggleActive = (index, e) => {
    if (e) e.stopPropagation();
    const newStands = [...stands];
    newStands[index].isActive = !newStands[index].isActive;
    saveToCloud(newStands, null, null, null, null, null, null);
  };

  // فتح صفحة الدرفيل والممرات عند الضغط على كارت الستاند
  const openStandRollPage = (index) => {
    const st = stands[index];
    setRollEditForm({
      rollCode: st.rollCode || '',
      diameter: st.diameter || '',
      hardness: st.hardness || '',
      type: st.type || '',
      entryDate: convertGBToISO(st.entryDate),
      totalPasses: st.totalPasses || 6
    });
    setRollModal({ isOpen: true, standIndex: index, isEditingInfo: false });
  };

  // حفظ تعديلات بيانات الدرفيل (القطر، تاريخ الدخول، عدد الممرات)
  const handleSaveRollMetadata = () => {
    const idx = rollModal.standIndex;
    if (idx === null) return;
    const newStands = [...stands];
    const st = { ...newStands[idx] };

    const newTotal = Math.max(1, Math.min(40, Number(rollEditForm.totalPasses) || st.totalPasses));
    st.rollCode = rollEditForm.rollCode;
    st.diameter = rollEditForm.diameter;
    st.hardness = rollEditForm.hardness;
    st.type = rollEditForm.type;
    st.entryDate = formatDateToGB(rollEditForm.entryDate) || st.entryDate;

    if (newTotal !== st.totalPasses) {
      const updatedPasses = Array.from({ length: newTotal }, (_, i) => {
        const pNum = i + 1;
        const existing = st.passes.find(p => p.passNumber === pNum);
        if (existing) return existing;
        return {
          passNumber: pNum,
          status: pNum === st.activePass ? 'active' : 'unused',
          tons: pNum === st.activePass ? st.accumulatedTons : 0,
          order: pNum === st.activePass ? 1 : null,
          sizeLabel: ''
        };
      });
      st.totalPasses = newTotal;
      if (st.activePass > newTotal) st.activePass = 1;
      st.passes = updatedPasses;
    }

    newStands[idx] = st;
    saveToCloud(newStands, null, null, null, null, null, null);
    setRollModal(prev => ({ ...prev, isEditingInfo: false }));
    showAlert("تم الحفظ", "تم تحديث بيانات الدرفيل والممرات بنجاح.");
  };

  // تركيب درفيل جديد بالكامل (تصفير كل الممرات على هذا القائم)
  const handleInstallNewRoll = () => {
    const idx = rollModal.standIndex;
    if (idx === null) return;
    showConfirm(
      "تركيب درفيل جديد",
      "هل تريد تركيب درفيل جديد لهذا الستاند؟ سيتم تصفير جميع الممرات والبدء من الممر رقم 1 بتاريخ اليوم.",
      () => {
        const newStands = [...stands];
        const st = { ...newStands[idx] };
        const todayGB = new Date().toLocaleDateString('en-GB');
        st.entryDate = todayGB;
        st.lastResetDate = todayGB;
        st.activePass = 1;
        st.accumulatedTons = 0;
        st.passes = createPassesArray(st.totalPasses, 1, 0);
        newStands[idx] = st;
        saveToCloud(newStands, null, null, null, null, null, null);
      }
    );
  };

  // تعديل يدوي لحالة أو إنتاج ممر معين من داخل صفحة الدرفيل (للمدير/الأدمن)
  const handleDirectPassStatusChange = (standIdx, passNum, newStatus, customTons) => {
    const newStands = [...stands];
    const st = { ...newStands[standIdx] };
    const maxOrder = Math.max(0, ...st.passes.map(p => p.order || 0));

    st.passes = st.passes.map(p => {
      if (p.passNumber === passNum) {
        if (newStatus === 'unused') {
          return { ...p, status: 'unused', tons: 0, order: null };
        }
        if (newStatus === 'used') {
          return { ...p, status: 'used', tons: customTons !== undefined ? Number(customTons) : p.tons, order: p.order || (maxOrder + 1) };
        }
      }
      return p;
    });

    newStands[standIdx] = st;
    saveToCloud(newStands, null, null, null, null, null, null);
  };

  // فتح نافذة التصفير وربطها باختيار الممر الجديد
  const initiateResetStand = (index, preselectedPassNum = null, e = null) => {
    if (e) e.stopPropagation();
    const st = stands[index];
    setResetBillets('');
    setResetNotes('');
    setResetDateInput(formatDateToISO(currentProdDate));
    setResetShiftInput(selectedShift);

    // اقتراح أول ممر أبيض (لم يعمل بعد) تلقائياً، أو اختيار ما ضغط عليه المستخدم
    if (preselectedPassNum) {
      setResetTargetPass(preselectedPassNum);
    } else {
      const nextUnused = st.passes.find(p => p.status === 'unused' && p.passNumber !== st.activePass);
      setResetTargetPass(nextUnused ? nextUnused.passNumber : st.activePass);
    }

    setResetModal({ isOpen: true, standIndex: index });
  };

  const handleResetDateChange = (e) => {
    const newD = e.target.value;
    setResetDateInput(newD);
    const isF = new Date(newD).getDay() === 5;
    const validShifts = isF ? ['الوردية الأولى (12 ساعة)', 'الوردية الثانية (12 ساعة)'] : ['الوردية الأولى', 'الوردية الثانية', 'الوردية الثالثة'];
    if (!validShifts.includes(resetShiftInput)) {
      setResetShiftInput(validShifts[0]);
    }
  };

  // تنفيذ الريست الذكي + نقل الشغل إلى الممر المختار وتحديث الألوان والترتيب
  const confirmResetStand = () => {
    const index = resetModal.standIndex;
    if (index === null) return;
    const newStands = [...stands];
    const st = { ...newStands[index] };

    const targetPass = Number(resetTargetPass) || st.activePass;
    const previousActivePass = st.activePass;

    const oldPassBillets = Number(resetBillets) || 0; 
    const oldPassTons = oldPassBillets * billetWeight;
    const totalCurrentTons = st.accumulatedTons;
    const finalOldPassTons = oldPassBillets > 0 ? oldPassTons : totalCurrentTons;
    const newPassOpeningTons = Math.max(0, totalCurrentTons - finalOldPassTons);

    const selectedDateGB = formatDateToGB(resetDateInput) || new Date().toLocaleDateString('en-GB');

    // حساب ترتيب الممرات (مين الأول ومين الثاني...)
    const currentMaxOrder = Math.max(0, ...st.passes.map(p => p.order || 0));

    const updatedPasses = st.passes.map(p => {
      // قفل الممر القديم بالانتاجية النهائية بتاعته
      if (p.passNumber === previousActivePass && previousActivePass !== targetPass) {
        return {
          ...p,
          status: 'used',
          tons: finalOldPassTons,
          order: p.order || Math.max(1, currentMaxOrder)
        };
      }
      // فتح الممر الجديد اللي اختاره الفني/المدير بالافتتاحية الجديدة
      if (p.passNumber === targetPass) {
        const nextOrder = previousActivePass === targetPass 
          ? (p.order || 1) 
          : (p.order ? p.order : currentMaxOrder + 1);
        return {
          ...p,
          status: 'active',
          tons: newPassOpeningTons,
          order: nextOrder
        };
      }
      return p;
    });

    const newChangeLog = {
      id: Date.now(),
      standId: st.id,
      standName: st.name,
      fromPass: previousActivePass,
      toPass: targetPass,
      tons: finalOldPassTons,
      date: selectedDateGB,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      shift: resetShiftInput, 
      notes: resetNotes || `نقل من ممر ${previousActivePass} إلى ممر ${targetPass}`,
      productSize: selectedProductSize,
      billetsAtChange: oldPassBillets
    };
    const updatedPassChanges = [newChangeLog, ...passChanges];

    st.passes = updatedPasses;
    st.activePass = targetPass;
    st.accumulatedTons = newPassOpeningTons;
    st.lastResetDate = selectedDateGB;

    newStands[index] = st;
    saveToCloud(newStands, null, null, null, updatedPassChanges, null, null);
    setResetModal({ isOpen: false, standIndex: null });
  };

  const handleResetAllStands = () => {
    showConfirm('تحذير شديد', 'هل أنت متأكد من تصفير كافة الستاندات والممرات بالكامل والبدء من ممر 1؟', () => {
      const todayGB = new Date().toLocaleDateString('en-GB');
      const newStands = stands.map(stand => ({
        ...stand,
        activePass: 1,
        accumulatedTons: 0,
        lastResetDate: todayGB,
        passes: createPassesArray(stand.totalPasses, 1, 0)
      }));
      saveToCloud(newStands, null, null, null, null, null, null);
    });
  };

  const handleClearArchive = () => {
    showConfirm('تحذير نهائي', 'هل أنت متأكد من مسح جميع بيانات الأرشيف القديمة وسجل الممرات بالكامل والبدء من جديد؟', () => {
      saveToCloud(stands, [], null, null, [], null, null);
      showAlert('تمت العملية', 'تم مسح الأرشيف وسجل الممرات بنجاح.');
    });
  };

  const handleLimitChange = (index, newValue) => {
    const val = Number(newValue);
    if (val > 0) {
      const newStands = [...stands];
      newStands[index].maxLimit = val;
      saveToCloud(newStands, null, null, null, null, null, null);
    }
  };

  const handleWeightChange = (newVal) => {
    const val = Number(newVal);
    if (val > 0) {
      saveToCloud(null, null, val, null, null, null, null);
    }
  };

  // إضافة إنتاج الوردية وتسميعه في الستاند وفي الممر الشغال حالياً
  const handleAddShiftProduction = () => {
    const billetsCount = Number(shiftBillets);
    if (billetsCount <= 0 || isNaN(billetsCount)) return; 

    const addedTons = billetsCount * billetWeight; 
    const exactNow = new Date();
    const saveTime = exactNow.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const exactTimestamp = exactNow.getTime(); 
    
    const dateStr = currentProdDate.toLocaleDateString('en-GB'); 
    const dayNameStr = currentProdDate.toLocaleDateString('ar-EG', { weekday: 'long' });
    
    const newStands = stands.map(stand => {
      if (!stand.isActive) return stand;
      const newTons = stand.accumulatedTons + addedTons;
      const updatedPasses = stand.passes.map(p => 
        p.passNumber === stand.activePass 
          ? { ...p, status: 'active', tons: newTons, order: p.order || 1 } 
          : p
      );
      return { 
        ...stand, 
        accumulatedTons: newTons,
        passes: updatedPasses
      };
    });
    
    let newArchive = [...productionArchive];
    const existingLogIndex = newArchive.findIndex(log => log.date === dateStr && log.shift === selectedShift);

    if (existingLogIndex !== -1) {
      newArchive[existingLogIndex].billets += billetsCount;
      newArchive[existingLogIndex].tons += addedTons;
      newArchive[existingLogIndex].time = saveTime; 
      newArchive[existingLogIndex].productSize = selectedProductSize; 
      newArchive[existingLogIndex].timestamp = exactTimestamp; 
    } else {
      const newArchiveLog = { 
        id: Date.now(), 
        date: dateStr, 
        dayName: dayNameStr, 
        time: saveTime, 
        shift: selectedShift, 
        billets: billetsCount, 
        tons: addedTons, 
        productSize: selectedProductSize, 
        timestamp: exactTimestamp 
      };
      newArchive = [newArchiveLog, ...newArchive];
    }

    saveToCloud(newStands, newArchive, null, null, null, null, null); 

    const currentDayShifts = currentProdDate.getDay() === 5 ? 
       ['الوردية الأولى (12 ساعة)', 'الوردية الثانية (12 ساعة)'] : 
       ['الوردية الأولى', 'الوردية الثانية', 'الوردية الثالثة'];

    const currentShiftIndex = currentDayShifts.indexOf(selectedShift);

    if (currentShiftIndex === currentDayShifts.length - 1) {
      const nextDate = new Date(currentProdDate);
      nextDate.setDate(nextDate.getDate() + 1);
      setCurrentProdDate(nextDate);
      
      const nextIsFriday = nextDate.getDay() === 5;
      setSelectedShift(nextIsFriday ? 'الوردية الأولى (12 ساعة)' : 'الوردية الأولى');
      showAlert('تم الإقفال', `تم إقفال يوم ${dayNameStr} وتسجيل إنتاج ${selectedShift} بنجاح!\n\nتم فتح يوم جديد تلقائياً.`);
    } else if (currentShiftIndex >= 0) {
      setSelectedShift(currentDayShifts[currentShiftIndex + 1]);
    } else {
      setSelectedShift(currentDayShifts[0]);
    }
    
    setShiftBillets(''); 
  };

  /* ======================================================
    6. دوال تسجيل الدخول بالكود ولوحة تحكم الأدمن
    ======================================================
  */
  const openLoginModal = (role) => {
    setLoginPrompt({ isOpen: true, role, codeInput: '', error: '' });
  };

  const handleVerifyAccessCode = (e) => {
    e.preventDefault();
    const { role, codeInput } = loginPrompt;
    const cleanCode = codeInput.trim();

    if (role === 'tech' && (cleanCode === adminState.techCode || cleanCode === adminState.adminCode)) {
      if (adminState.isMaintenance && cleanCode !== adminState.adminCode) {
        setLoginPrompt(prev => ({ ...prev, error: 'الموقع في وضع الصيانة والتحديث حالياً!' }));
        return;
      }
      setCurrentUser('tech');
      setActiveTab('dashboard');
      setLoginPrompt({ isOpen: false, role: '', codeInput: '', error: '' });
    } else if (role === 'manager' && (cleanCode === adminState.managerCode || cleanCode === adminState.adminCode)) {
      if (adminState.isMaintenance && cleanCode !== adminState.adminCode) {
        setLoginPrompt(prev => ({ ...prev, error: 'الموقع في وضع الصيانة والتحديث حالياً!' }));
        return;
      }
      setCurrentUser('manager');
      setActiveTab('dashboard');
      setLoginPrompt({ isOpen: false, role: '', codeInput: '', error: '' });
    } else if (role === 'admin' && cleanCode === adminState.adminCode) {
      setCurrentUser('admin');
      setActiveTab('admin');
      setLoginPrompt({ isOpen: false, role: '', codeInput: '', error: '' });
    } else {
      setLoginPrompt(prev => ({ ...prev, error: 'الكود غير صحيح! حاول مرة أخرى.' }));
    }
  };

  const handleSaveAdminSettings = (updatedAdmin) => {
    setAdminState(updatedAdmin);
    saveToCloud(null, null, null, null, null, null, updatedAdmin);
    showAlert("تم الحفظ", "تم تحديث إعدادات الأدمن والأكواد بنجاح.");
  };

  /* ======================================================
    7. ترتيب وتجميع الأرشيف
    ======================================================
  */
  const groupedArchive = productionArchive.reduce((acc, log) => {
    if (!acc[log.date]) {
      acc[log.date] = { dayName: log.dayName, totalBillets: 0, totalTons: 0, shiftsList: [], timestamp: log.timestamp };
    }
    acc[log.date].totalBillets += log.billets;
    acc[log.date].totalTons += log.tons;
    acc[log.date].shiftsList.push(log);
    return acc;
  }, {});

  const shiftOrder = { 'الوردية الأولى': 1, 'الوردية الأولى (12 ساعة)': 1, 'الوردية الثانية': 2, 'الوردية الثانية (12 ساعة)': 2, 'الوردية الثالثة': 3 };
  
  Object.keys(groupedArchive).forEach(dateKey => {
    groupedArchive[dateKey].shiftsList.sort((a, b) => shiftOrder[a.shift] - shiftOrder[b.shift]);
  });
  
  const sortedDates = Object.keys(groupedArchive).sort((a, b) => groupedArchive[b].timestamp - groupedArchive[a].timestamp);

  const aggregatedLogs = Object.values(groupedArchive)
    .flatMap(day => day.shiftsList)
    .sort((a, b) => b.timestamp - a.timestamp);

  /* ======================================================
    8. واجهة المستخدم (شاشة الصيانة & شاشة الدخول)
    ======================================================
  */
  // إذا كان الموقع مقفول للصيانة والمستخدم ليس أدمن
  if (adminState.isMaintenance && currentUser !== 'admin' && currentUser !== 'none') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4 text-center" dir="rtl">
        <div className="bg-slate-800 p-8 rounded-2xl max-w-md w-full border-2 border-amber-500 shadow-2xl flex flex-col items-center gap-4">
          <div className="bg-amber-500/20 p-4 rounded-full border border-amber-500/40 animate-pulse">
            <Wrench className="w-14 h-14 text-amber-400" />
          </div>
          <h1 className="text-2xl font-black text-amber-400">جاري التعديل والتحديث</h1>
          <p className="text-sm text-slate-300 leading-relaxed font-bold">
            {adminState.maintenanceMessage}
          </p>
          <button 
            onClick={() => setCurrentUser('none')} 
            className="mt-4 bg-slate-700 hover:bg-slate-600 text-white font-bold px-6 py-2.5 rounded-lg text-xs transition-colors"
          >
            العودة لشاشة الدخول
          </button>
        </div>
      </div>
    );
  }

  if (currentUser === 'none') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4" dir="rtl">
        
        {/* نافذة إدخال الكود السري */}
        {loginPrompt.isOpen && (
          <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <form onSubmit={handleVerifyAccessCode} className="bg-slate-800 border border-slate-600 rounded-xl max-w-xs w-full p-5 shadow-2xl flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                <h3 className="font-bold text-sm flex items-center gap-1.5 text-white">
                  <Key className="w-4 h-4 text-blue-400" />
                  {loginPrompt.role === 'tech' && 'كود دخول فني الإنتاج'}
                  {loginPrompt.role === 'manager' && 'كود دخول إدارة المصنع'}
                  {loginPrompt.role === 'admin' && 'كود مسؤول النظام (Admin)'}
                </h3>
                <button type="button" onClick={() => setLoginPrompt({ isOpen: false, role: '', codeInput: '', error: '' })} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <input
                type="password"
                autoFocus
                value={loginPrompt.codeInput}
                onChange={(e) => setLoginPrompt(prev => ({ ...prev, codeInput: e.target.value, error: '' }))}
                placeholder="أدخل الكود السري..."
                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2.5 text-center font-mono text-lg tracking-widest text-white focus:border-blue-500 outline-none"
              />

              {loginPrompt.error && (
                <p className="text-red-400 text-xs font-bold text-center bg-red-950/50 border border-red-800 p-1.5 rounded">
                  {loginPrompt.error}
                </p>
              )}

              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg transition-colors shadow-lg text-sm">
                تأكيد الدخول
              </button>
            </form>
          </div>
        )}

        <div className="bg-slate-800 p-8 rounded-xl max-w-sm w-full text-center border border-slate-700 shadow-2xl relative">
          
          {customLogo ? (
            <div className="w-full flex justify-center mb-6 bg-white p-2 rounded-lg shadow-sm">
              <img src={customLogo} alt="Factory Logo" className="h-16 object-contain drop-shadow-md" />
            </div>
          ) : (
            <Settings2 className="w-16 h-16 mx-auto text-blue-500 mb-4" />
          )}
          
          <h1 className="text-2xl font-black mb-1 text-slate-100">تتبع درافيل وممرات الإنتاج</h1>
          <p className="text-xs text-slate-400 mb-3 font-bold">شركة الجيوشي للصلب - ALGIOSHY STEEL</p>
          
          {adminState.isMaintenance ? (
            <div className="bg-amber-500/20 border border-amber-500 text-amber-300 p-3 rounded-lg mb-6 text-xs font-bold flex flex-col items-center gap-1.5">
              <Wrench className="w-5 h-5 text-amber-400 animate-bounce" />
              <span>{adminState.maintenanceMessage}</span>
            </div>
          ) : (
            <p className="text-blue-400 mb-6 text-xs flex items-center justify-center gap-1 font-bold">
              <CheckCircle className="w-4 h-4" /> نظام متصل بالسحابة لحظياً
            </p>
          )}

          {!isDataLoaded ? (
            <div className="text-slate-400 animate-pulse text-sm font-bold">جاري الاتصال بقاعدة البيانات...</div>
          ) : (
            <div className="space-y-3">
              <button 
                onClick={() => openLoginModal('tech')} 
                disabled={adminState.isMaintenance}
                className={`w-full flex items-center justify-center gap-2 p-3.5 rounded-lg font-bold transition-colors shadow-lg ${adminState.isMaintenance ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
              >
                <Edit3 className="w-5 h-5" /> دخول فني الإنتاج
              </button>
              <button 
                onClick={() => openLoginModal('manager')} 
                disabled={adminState.isMaintenance}
                className={`w-full flex items-center justify-center gap-2 p-3.5 rounded-lg font-bold transition-colors shadow-lg ${adminState.isMaintenance ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
              >
                <TrendingUp className="w-5 h-5" /> دخول إدارة المصنع
              </button>
              <button 
                onClick={() => openLoginModal('admin')} 
                className="w-full flex items-center justify-center gap-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 p-2.5 rounded-lg font-bold text-xs transition-colors mt-2"
              >
                <ShieldAlert className="w-4 h-4" /> لوحة تحكم الأدمن (Admin)
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isResetDateFriday = resetDateInput ? new Date(resetDateInput).getDay() === 5 : false;
  const resetModalShifts = isResetDateFriday ? ['الوردية الأولى (12 ساعة)', 'الوردية الثانية (12 ساعة)'] : ['الوردية الأولى', 'الوردية الثانية', 'الوردية الثالثة'];

  // بيانات الستاند المفتوح حالياً في صفحة الدرفيل
  const selectedRollStand = rollModal.standIndex !== null ? stands[rollModal.standIndex] : null;
  const resetStandObj = resetModal.standIndex !== null ? stands[resetModal.standIndex] : null;

  return (
    <div className="h-dvh bg-slate-200 text-slate-900 font-sans flex flex-col p-1 gap-1 overflow-hidden" dir="rtl">
      
      {/* ----------------- النوافذ المنبثقة الأساسية (Alert & Confirm) ----------------- */}
      {modal.isOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="p-5">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                {modal.type === 'alert' ? <CheckCircle className="text-green-500 w-5 h-5"/> : <AlertTriangle className="text-orange-500 w-5 h-5"/>}
                {modal.title}
              </h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-line">{modal.message}</p>
            </div>
            <div className="bg-slate-50 p-3 flex justify-end gap-2 border-t border-slate-100">
              {modal.type === 'confirm' && (
                <button onClick={closeBox} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg font-bold text-slate-700 text-xs transition-colors">إلغاء</button>
              )}
              <button onClick={() => { if(modal.onConfirm) modal.onConfirm(); closeBox(); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shadow transition-colors">موافق</button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- صفحة الدرفيل وتفاصيل الممرات (تفتح عند الضغط على أي ستاند) ----------------- */}
      {rollModal.isOpen && selectedRollStand && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-300 flex flex-col max-h-[92vh]">
            
            {/* هيدر صفحة الدرفيل */}
            <div className="bg-slate-900 p-3 sm:p-4 flex justify-between items-center text-white shrink-0 border-b border-slate-700">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="bg-blue-600 text-white font-black px-3 py-1.5 rounded-lg text-sm sm:text-base shadow">
                  {selectedRollStand.name}
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base flex items-center gap-2">
                    صفحة الدرفيل والممرات 
                    <span className="text-[11px] bg-slate-800 text-amber-400 px-2 py-0.5 rounded border border-slate-700">
                      {selectedRollStand.type}
                    </span>
                  </h3>
                  <p className="text-[10px] sm:text-xs text-slate-400 font-bold mt-0.5">
                    كود الدرفيل: <span className="text-white font-mono">{selectedRollStand.rollCode}</span> | القطر: <span className="text-amber-300 font-mono">{selectedRollStand.diameter} مم</span> | تاريخ الدخول: <span className="text-green-400 font-mono">{selectedRollStand.entryDate}</span>
                  </p>
                </div>
              </div>
              <button onClick={() => setRollModal({ isOpen: false, standIndex: null, isEditingInfo: false })} className="text-slate-400 hover:text-white bg-slate-800 p-1.5 rounded-lg">
                <X className="w-5 h-5"/>
              </button>
            </div>

            {/* محتوى صفحة الدرفيل */}
            <div className="p-3 sm:p-4 overflow-y-auto flex-1 flex flex-col gap-4 bg-slate-50">
              
              {/* بطاقات معلومات الدرفيل السريعة */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm text-center">
                  <span className="text-[10px] text-slate-500 font-bold block">كود الدرفيل (CODE)</span>
                  <span className="font-mono font-black text-sm sm:text-base text-slate-800">{selectedRollStand.rollCode}</span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm text-center">
                  <span className="text-[10px] text-slate-500 font-bold block">القطر (Dia.)</span>
                  <span className="font-mono font-black text-sm sm:text-base text-blue-700">{selectedRollStand.diameter}</span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm text-center">
                  <span className="text-[10px] text-slate-500 font-bold block">تاريخ دخول الدرفيل</span>
                  <span className="font-mono font-black text-sm sm:text-base text-emerald-700">{selectedRollStand.entryDate}</span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm text-center">
                  <span className="text-[10px] text-slate-500 font-bold block">إجمالي الممرات</span>
                  <span className="font-mono font-black text-sm sm:text-base text-purple-700">{selectedRollStand.totalPasses} ممر</span>
                </div>
                <div className="bg-slate-900 text-white p-2.5 rounded-xl shadow-sm text-center col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-slate-300 font-bold block">إجمالي إنتاج الدرفيل</span>
                  <span className="font-mono font-black text-sm sm:text-base text-amber-400">
                    {selectedRollStand.passes.reduce((sum, p) => sum + (Number(p.tons) || 0), 0).toFixed(0)} طن
                  </span>
                </div>
              </div>

              {/* أزرار تعديل بيانات الدرفيل أو تركيب درفيل جديد */}
              <div className="flex flex-wrap justify-between items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setRollModal(prev => ({ ...prev, isEditingInfo: !prev.isEditingInfo }))}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 border border-slate-300 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                    {rollModal.isEditingInfo ? 'إخفاء تعديل البيانات' : 'تعديل بيانات الدرفيل (القطر / التاريخ / الممرات)'}
                  </button>
                  <button 
                    onClick={handleInstallNewRoll}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 border border-emerald-300 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                    تركيب درفيل جديد (تصفير الكل)
                  </button>
                </div>

                <button 
                  onClick={() => initiateResetStand(rollModal.standIndex)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shadow transition-colors"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  تصفير ونقل على ممر جديد
                </button>
              </div>

              {/* فورم تعديل بيانات الدرفيل */}
              {rollModal.isEditingInfo && (
                <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-6 gap-2.5 items-end">
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 block mb-1">كود الدرفيل:</label>
                    <input type="text" value={rollEditForm.rollCode} onChange={e => setRollEditForm({...rollEditForm, rollCode: e.target.value})} className="w-full p-1.5 rounded border border-slate-300 text-xs font-mono bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 block mb-1">القطر (مم):</label>
                    <input type="text" value={rollEditForm.diameter} onChange={e => setRollEditForm({...rollEditForm, diameter: e.target.value})} className="w-full p-1.5 rounded border border-slate-300 text-xs font-mono bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 block mb-1">الصلابة (Hardness):</label>
                    <input type="text" value={rollEditForm.hardness} onChange={e => setRollEditForm({...rollEditForm, hardness: e.target.value})} className="w-full p-1.5 rounded border border-slate-300 text-xs font-mono bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 block mb-1">شكل الممر:</label>
                    <input type="text" value={rollEditForm.type} onChange={e => setRollEditForm({...rollEditForm, type: e.target.value})} className="w-full p-1.5 rounded border border-slate-300 text-xs bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 block mb-1">تاريخ الدخول:</label>
                    <input type="date" value={rollEditForm.entryDate} onChange={e => setRollEditForm({...rollEditForm, entryDate: e.target.value})} className="w-full p-1.5 rounded border border-slate-300 text-xs font-mono bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 block mb-1">عدد الممرات:</label>
                    <input type="number" min="1" max="40" value={rollEditForm.totalPasses} onChange={e => setRollEditForm({...rollEditForm, totalPasses: e.target.value})} className="w-full p-1.5 rounded border border-slate-300 text-xs font-mono bg-white" />
                  </div>
                  <div className="col-span-2 sm:col-span-6 flex justify-end mt-1">
                    <button onClick={handleSaveRollMetadata} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-1.5 rounded-lg text-xs flex items-center gap-1 shadow">
                      <Save className="w-3.5 h-3.5" /> حفظ تعديلات الدرفيل
                    </button>
                  </div>
                </div>
              )}

              {/* شريط ترتيب الممرات (مين أول ممر اشتغل ومين الثاني...) */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                <h4 className="text-xs font-black text-slate-800 mb-2 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-600" />
                  تسلسل تشغيل الممرات (مين اشتغل الأول ومين الثاني):
                </h4>
                <div className="flex flex-wrap items-center gap-1.5">
                  {selectedRollStand.passes
                    .filter(p => p.order !== null && p.order !== undefined)
                    .sort((a, b) => a.order - b.order)
                    .map((p, idx) => (
                      <div key={p.passNumber} className="flex items-center gap-1">
                        <div className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${
                          p.status === 'active' 
                            ? 'bg-slate-900 text-amber-400 border-amber-500 shadow' 
                            : 'bg-blue-50 text-blue-900 border-blue-200'
                        }`}>
                          <span className="bg-amber-400 text-slate-950 font-black px-1.5 py-0.2 rounded text-[10px]">
                            #{p.order}
                          </span>
                          <span>ممر {p.passNumber}</span>
                          <span className="font-mono text-[10px] opacity-80">({Number(p.tons).toFixed(0)} طن)</span>
                          {p.status === 'active' && <span className="text-[9px] bg-green-500 text-white px-1 rounded">شغال حالياً</span>}
                        </div>
                        {idx < selectedRollStand.passes.filter(x => x.order).length - 1 && (
                          <span className="text-slate-400 font-bold text-xs">←</span>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* دليل الألوان */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] font-bold">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded bg-slate-900 border-2 border-amber-400 inline-block"></span>
                    الممر الشغال حالياً (الافتتاحية/الإنتاج الحالي)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded bg-blue-100 border border-blue-400 inline-block"></span>
                    ممر اشتغل وانتهى (عليه إنتاجيته)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded bg-white border border-slate-300 inline-block"></span>
                    ممر لم يعمل بعد (متصفر 0 - أبيض)
                  </span>
                </div>
                <span className="text-slate-500 text-[10px]">* اضغط على أي ممر أبيض للانتقال والتصفير عليه مباشرة</span>
              </div>

              {/* شبكة الممرات (بنفس روح جدول التقرير اليومي) */}
              <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {selectedRollStand.passes.map((passObj) => {
                  const isCurrent = passObj.status === 'active' || passObj.passNumber === selectedRollStand.activePass;
                  const isUsed = !isCurrent && passObj.status === 'used';
                  
                  return (
                    <div 
                      key={passObj.passNumber}
                      onClick={() => {
                        if (!isCurrent) {
                          initiateResetStand(rollModal.standIndex, passObj.passNumber);
                        }
                      }}
                      className={`rounded-xl border-2 p-2 flex flex-col justify-between transition-all cursor-pointer relative ${
                        isCurrent 
                          ? 'bg-slate-900 text-white border-amber-400 shadow-lg ring-2 ring-amber-400/50 scale-[1.02]' 
                          : isUsed 
                            ? 'bg-blue-100/90 text-blue-950 border-blue-400 hover:bg-blue-200/70' 
                            : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400'
                      }`}
                    >
                      {/* الهيدر العلوي للممر: رقم الممر وترتيب تشغيله */}
                      <div className="flex justify-between items-center border-b border-current/10 pb-1">
                        <span className="font-mono font-black text-xs">
                          ممر {passObj.passNumber}
                        </span>
                        {passObj.order && (
                          <span className="bg-amber-400 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded shadow-sm" title={`ترتيب التشغيل: رقم ${passObj.order}`}>
                            ترتيب {passObj.order}
                          </span>
                        )}
                      </div>

                      {/* المنتصف: الإنتاجية */}
                      <div className="my-2 text-center">
                        <span className={`font-mono font-black text-xl block leading-none ${
                          isCurrent ? 'text-amber-400' : isUsed ? 'text-blue-900' : 'text-slate-400'
                        }`}>
                          {Number(passObj.tons || 0).toFixed(0)}
                        </span>
                        <span className="text-[9px] font-bold opacity-75">طن</span>
                      </div>

                      {/* الفوتر: الحالة */}
                      <div className="text-center">
                        {isCurrent ? (
                          <span className="inline-block w-full bg-amber-400 text-slate-950 text-[9px] font-black py-0.5 rounded">
                            شغال حالياً
                          </span>
                        ) : isUsed ? (
                          <span className="inline-block w-full bg-blue-600 text-white text-[9px] font-bold py-0.5 rounded">
                            منتهي (اضغط للتشغيل)
                          </span>
                        ) : (
                          <span className="inline-block w-full bg-slate-100 text-slate-500 text-[9px] font-bold py-0.5 rounded border border-slate-200">
                            جديد (اضغط للتشغيل)
                          </span>
                        )}
                      </div>

                      {/* أزرار تحكم سريع للمدير أو الأدمن لتصحيح ممر قديم */}
                      {(currentUser === 'manager' || currentUser === 'admin') && !isCurrent && (
                        <div className="mt-1.5 pt-1 border-t border-slate-300/60 flex justify-between gap-1" onClick={e => e.stopPropagation()}>
                          <button 
                            onClick={() => {
                              const val = prompt(`أدخل الإنتاج التراكمي للممر رقم ${passObj.passNumber} (بالطن):`, passObj.tons || 0);
                              if (val !== null) handleDirectPassStatusChange(rollModal.standIndex, passObj.passNumber, Number(val) > 0 ? 'used' : 'unused', Number(val));
                            }}
                            className="text-[8px] bg-slate-200 hover:bg-slate-300 text-slate-800 px-1.5 py-0.5 rounded font-bold flex-1"
                          >
                            تعديل رقم
                          </button>
                          {isUsed && (
                            <button 
                              onClick={() => handleDirectPassStatusChange(rollModal.standIndex, passObj.passNumber, 'unused', 0)}
                              className="text-[8px] bg-red-100 hover:bg-red-200 text-red-700 px-1.5 py-0.5 rounded font-bold"
                            >
                              تصفير
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ----------------- نافذة الريست الذكي المربوطة باختيار رقم الممر ----------------- */}
      {resetModal.isOpen && resetStandObj && (
        <div className="fixed inset-0 bg-black/75 z-[60] flex items-center justify-center p-3 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-300 flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 p-3 flex justify-between items-center text-white shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-400"/> 
                تصفير ونقل ممر ({resetStandObj.name} - كود {resetStandObj.rollCode})
              </h3>
              <button onClick={() => setResetModal({ isOpen: false, standIndex: null })} className="text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="p-4 flex flex-col gap-3 overflow-y-auto">
              <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-lg flex justify-between items-center text-xs font-bold text-blue-900">
                <span>الممر الشغال حالياً: <strong className="bg-slate-900 text-amber-400 px-2 py-0.5 rounded font-mono">ممر {resetStandObj.activePass}</strong></span>
                <span>الإنتاج الحالي: <strong className="font-mono text-blue-700">{resetStandObj.accumulatedTons.toFixed(0)} طن</strong></span>
              </div>

              {/* اختيار رقم الممر الجديد الذي سيتم الشغل عليه */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-slate-800 flex items-center gap-1">
                  <Layers className="w-4 h-4 text-blue-600" />
                  1. اختر رقم الممر الجديد الذي ستشتغل عليه:
                </label>
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 bg-slate-100 p-2 rounded-xl border border-slate-200 max-h-40 overflow-y-auto">
                  {resetStandObj.passes.map(p => {
                    const isSelected = Number(resetTargetPass) === p.passNumber;
                    const isCurrent = p.passNumber === resetStandObj.activePass;
                    const isUsed = p.status === 'used' && !isCurrent;
                    return (
                      <button
                        type="button"
                        key={p.passNumber}
                        onClick={() => setResetTargetPass(p.passNumber)}
                        className={`p-1.5 rounded-lg font-mono text-xs font-black border-2 flex flex-col items-center transition-all ${
                          isSelected 
                            ? 'bg-emerald-600 text-white border-emerald-900 shadow-md scale-105' 
                            : isCurrent
                              ? 'bg-slate-900 text-amber-400 border-amber-400'
                              : isUsed
                                ? 'bg-blue-100 text-blue-900 border-blue-300 opacity-80'
                                : 'bg-white text-slate-800 border-slate-300 hover:border-blue-500'
                        }`}
                      >
                        <span>{p.passNumber}</span>
                        <span className="text-[8px] font-normal opacity-80">
                          {isCurrent ? 'الحالي' : isUsed ? `${Number(p.tons).toFixed(0)}ط` : 'جديد'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-700">تاريخ التغيير:</label>
                  <input 
                    type="date" 
                    value={resetDateInput} 
                    onChange={handleResetDateChange} 
                    className="w-full border border-slate-300 rounded p-1.5 font-mono text-xs focus:border-blue-500 outline-none cursor-pointer" 
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-700">الوردية:</label>
                  <select 
                    value={resetShiftInput} 
                    onChange={(e) => setResetShiftInput(e.target.value)} 
                    className="w-full bg-white border border-slate-300 text-[10px] font-bold p-1.5 rounded outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {resetModalShifts.map(shift => <option key={shift} value={shift}>{shift}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-700">
                  عدد بليت الممر القديم (ممر {resetStandObj.activePass}) قبل التغيير:
                </label>
                <input 
                  type="number" 
                  value={resetBillets} 
                  onChange={e => setResetBillets(e.target.value)} 
                  className="w-full border border-slate-300 rounded p-2 font-mono text-xs focus:border-blue-500 outline-none" 
                  placeholder="اتركه فارغاً لحساب كامل الإنتاج الحالي للممر القديم وتصفير الجديد بـ 0" 
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-700">ملاحظات أو سبب التغيير:</label>
                <textarea 
                  rows="2"
                  value={resetNotes} 
                  onChange={e => setResetNotes(e.target.value)} 
                  className="w-full border border-slate-300 rounded p-2 text-xs focus:border-blue-500 outline-none resize-none" 
                  placeholder="تآكل ممر، خشونة، كسر، تغيير مقاس..." 
                ></textarea>
              </div>

              <button onClick={confirmResetStand} className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 active:scale-95 transition-all shadow mt-1 text-xs sm:text-sm">
                تأكيد قفل ممر ({resetStandObj.activePass}) وتشغيل ممر ({resetTargetPass})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- سجل الممر المحدد ----------------- */}
      {historyModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-300 flex flex-col max-h-[80vh]">
            <div className="bg-slate-800 p-3 flex justify-between items-center text-white shrink-0">
              <h3 className="font-bold text-sm flex items-center gap-2"><History className="w-4 h-4"/> سجل تغييرات {historyModal.standId}</h3>
              <button onClick={() => setHistoryModal({ isOpen: false, standId: null })} className="text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-3 overflow-y-auto flex-1 flex flex-col gap-2 bg-slate-50">
              {passChanges.filter(c => String(c.standId) === String(historyModal.standId)).length === 0 ? (
                <div className="text-center py-8 text-slate-400 font-bold text-xs">لا يوجد سجل تغييرات لهذا الستاند.</div>
              ) : (
                passChanges.filter(c => String(c.standId) === String(historyModal.standId)).map(change => (
                  <div key={change.id} className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-1.5">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                      <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{change.date} | {change.shift && <span className="text-blue-700">{change.shift}</span>}</span>
                      <span className="text-[11px] font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">إنتاج: {Number(change.tons).toFixed(1)} طن</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-600 font-bold mt-1">
                      <span>مقاس: {change.productSize} مم</span>
                      {change.fromPass && <span>من ممر {change.fromPass} ← ممر {change.toPass}</span>}
                      <span>بليت: {change.billetsAtChange || 0}</span>
                    </div>
                    <p className="text-[10px] text-slate-700 bg-orange-50 p-1.5 rounded mt-1 border border-orange-100">
                      <span className="font-bold text-orange-700">ملاحظات:</span> {change.notes}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* نافذة إعدادات النظام (اللوجو) */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-300">
            <div className="bg-slate-800 p-3 flex justify-between items-center text-white">
              <h3 className="font-bold text-sm flex items-center gap-2"><Settings className="w-4 h-4"/> إعدادات الشعار</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <UploadCloud className="w-4 h-4 text-blue-600"/> رفع لوجو المصنع (من الجهاز):
                </label>
                <input 
                  type="file" 
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleLogoUpload} 
                  className="w-full border border-slate-300 rounded p-1.5 text-xs focus:border-blue-500 outline-none file:mr-2 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" 
                />
              </div>
              
              {tempLogoUrl && (
                <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 flex flex-col items-center gap-2">
                  <span className="text-[9px] font-bold text-slate-400">معاينة الشعار:</span>
                  <div className="bg-white p-2 rounded shadow-sm">
                     <img src={tempLogoUrl} alt="Preview" className="h-16 object-contain" />
                  </div>
                </div>
              )}

              <button onClick={handleSaveSettings} className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 active:scale-95 transition-all flex justify-center items-center gap-2 shadow-md mt-2">
                <Save className="w-4 h-4" /> تطبيق الشعار
              </button>
            </div>
          </div>
        </div>
      )}

      {/* الشريط العلوي */}
      <nav className="bg-slate-900 text-white p-2 rounded flex flex-col gap-2 flex-none shadow-sm">
        <div className="flex justify-between items-center relative h-10">
          
          <div className="flex items-center gap-2 z-10">
            {customLogo && (
              <div className="bg-white p-1 rounded shadow-sm flex shrink-0">
                 <img src={customLogo} alt="Logo" className="h-5 sm:h-7 w-auto max-w-[70px] sm:max-w-[120px] object-contain" />
              </div>
            )}
            <span className="font-bold text-xs sm:text-sm hidden md:inline text-slate-100">الجيوشي للصلب - Roll Tracker</span>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 z-0">
            <LiveClock />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 z-10">
            {(currentUser === 'manager' || currentUser === 'admin') && (
               <button onClick={openSettingsModal} className="bg-slate-700 p-1.5 rounded hover:bg-slate-600 transition-colors shadow-sm" title="رفع شعار المصنع">
                 <Settings className="w-3.5 h-3.5 text-blue-300" />
               </button>
            )}
            <span className="bg-slate-800 px-2 py-1 rounded text-[10px] font-bold text-blue-300 flex items-center gap-1 border border-slate-700">
              <span className={`w-2 h-2 rounded-full ${auth ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-slate-400'}`}></span> 
              {currentUser === 'tech' ? 'فني' : currentUser === 'manager' ? 'مدير' : 'أدمن'}
            </span>
            <button onClick={() => {setCurrentUser('none'); setActiveTab('dashboard');}} className="text-red-400 hover:text-red-300 text-xs font-bold transition-colors">خروج</button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 bg-slate-800 p-1.5 rounded-lg justify-between items-center z-10 relative">
          <div className="flex gap-1.5 w-full sm:w-auto overflow-x-auto">
             <button onClick={() => setActiveTab('dashboard')} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded flex justify-center items-center gap-1 transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'}`}><TrendingUp className="w-3 h-3" /> التشغيل والممرات</button>
             <button onClick={() => setActiveTab('analytics')} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded flex justify-center items-center gap-1 transition-all ${activeTab === 'analytics' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'}`}><BarChart3 className="w-3 h-3" /> الإحصائيات</button>
             <button onClick={() => setActiveTab('archive')} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded flex justify-center items-center gap-1 transition-all ${activeTab === 'archive' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'}`}><Archive className="w-3 h-3" /> الأرشيف</button>
             {currentUser === 'admin' && (
               <button onClick={() => setActiveTab('admin')} className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded flex justify-center items-center gap-1 transition-all ${activeTab === 'admin' ? 'bg-amber-500 text-slate-950 shadow' : 'text-amber-400 hover:bg-slate-700'}`}><ShieldAlert className="w-3.5 h-3.5" /> لوحة الأدمن</button>
             )}
          </div>

          {activeTab === 'dashboard' && (
             <div className="flex items-center gap-2 w-full sm:w-auto bg-slate-700 px-2 py-1 rounded border border-slate-600">
               <span className="text-white text-xs font-bold whitespace-nowrap">مقاس المنتج:</span>
               <select 
                 value={selectedProductSize} 
                 onChange={(e) => handleProductSizeChange(e.target.value)}
                 className="bg-white text-slate-900 text-xs font-bold px-2 py-1 rounded outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto cursor-pointer"
               >
                  <option value="10">10 مم</option>
                  <option value="12">12 مم</option>
                  <option value="16">16 مم</option>
                  <option value="18">18 مم</option>
                  <option value="22">22 مم</option>
               </select>
             </div>
          )}
        </div>
      </nav>

      {/* ----------------- تبويب لوحة تحكم الأدمن (Admin Panel) ----------------- */}
      {activeTab === 'admin' && currentUser === 'admin' && (
        <div className="flex-1 bg-white rounded-lg shadow border border-slate-300 p-4 overflow-y-auto flex flex-col gap-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-amber-500" />
              <div>
                <h2 className="font-black text-base text-slate-800">لوحة تحكم المسؤول (Admin Panel)</h2>
                <p className="text-xs text-slate-500 font-bold">إدارة حالة الموقع، أكواد الدخول للمدير والأفراد، وإحصائيات الزيارات</p>
              </div>
            </div>
          </div>

          {/* بطاقات الزيارات وحالة الموقع */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-blue-800 block">إجمالي زيارات الموقع</span>
                <span className="font-mono font-black text-3xl text-blue-900">{adminState.visitsCount || 1}</span>
                <span className="text-[10px] text-blue-600 block mt-1">آخر تواجد: {adminState.lastVisit || 'الآن'}</span>
              </div>
              <Eye className="w-10 h-10 text-blue-400 opacity-70" />
            </div>

            <div className={`border p-4 rounded-xl flex items-center justify-between ${adminState.isMaintenance ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-200'}`}>
              <div>
                <span className="text-xs font-bold text-slate-700 block">حالة الموقع الحالية</span>
                <span className={`font-black text-lg ${adminState.isMaintenance ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {adminState.isMaintenance ? 'مغلق للصيانة والتحديث' : 'يعمل بشكل طبيعي (متاح)'}
                </span>
              </div>
              <Power className={`w-9 h-9 ${adminState.isMaintenance ? 'text-amber-500' : 'text-emerald-500'}`} />
            </div>

            <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-purple-800 block">إجمالي تغييرات الممرات</span>
                <span className="font-mono font-black text-3xl text-purple-900">{passChanges.length}</span>
                <span className="text-[10px] text-purple-600 block mt-1">عملية تصفير ونقل مسجلة</span>
              </div>
              <Layers className="w-10 h-10 text-purple-400 opacity-70" />
            </div>
          </div>

          {/* قفل الموقع للصيانة والتعديل */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-amber-600" />
                  وضع الصيانة والتحديث (قفل الموقع مؤقتاً)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">عند التفعيل، يظهر للفنيين والمديرين رسالة "جاري التعديل أو التحديث" ولا يمكنهم الدخول.</p>
              </div>
              <button
                onClick={() => handleSaveAdminSettings({ ...adminState, isMaintenance: !adminState.isMaintenance })}
                className={`px-4 py-2 rounded-lg font-bold text-xs shadow transition-colors ${
                  adminState.isMaintenance 
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {adminState.isMaintenance ? 'إلغاء القفل وفتح الموقع الآن' : 'قفل الموقع للصيانة الآن'}
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">رسالة الإغلاق التي تظهر للمستخدمين:</label>
              <input
                type="text"
                value={adminState.maintenanceMessage}
                onChange={(e) => setAdminState({ ...adminState, maintenanceMessage: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {/* إدارة الأكواد السرية (المدير، الأفراد، الأدمن) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
              <Key className="w-4 h-4 text-blue-600" />
              إدارة أكواد الدخول (للمدير وللأفراد/الفنيين)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <label className="text-xs font-bold text-blue-700 block mb-1">كود الأفراد / فني الإنتاج:</label>
                <input
                  type="text"
                  value={adminState.techCode}
                  onChange={(e) => setAdminState({ ...adminState, techCode: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded font-mono text-sm font-bold text-center"
                />
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <label className="text-xs font-bold text-emerald-700 block mb-1">كود مدير المصنع:</label>
                <input
                  type="text"
                  value={adminState.managerCode}
                  onChange={(e) => setAdminState({ ...adminState, managerCode: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded font-mono text-sm font-bold text-center"
                />
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <label className="text-xs font-bold text-amber-700 block mb-1">كود الأدمن الرئيسي (Admin):</label>
                <input
                  type="text"
                  value={adminState.adminCode}
                  onChange={(e) => setAdminState({ ...adminState, adminCode: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded font-mono text-sm font-bold text-center"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => handleSaveAdminSettings(adminState)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow"
              >
                <Save className="w-4 h-4" /> حفظ الأكواد والإعدادات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- لوحة التشغيل والستاندات ----------------- */}
      {activeTab === 'dashboard' && (
        <div className="flex flex-col gap-2 flex-1 overflow-hidden p-1">
          
          {/* لوحة تحكم المدير أو الأدمن */}
          {(currentUser === 'manager' || currentUser === 'admin') && (
            <div className="flex flex-col gap-1.5 flex-none bg-white p-2 rounded-lg border border-slate-300 shadow-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                 <div className="bg-green-100 p-1.5 border border-green-300 rounded-lg"><p className="text-[10px] font-bold text-green-800">أقل من 80%</p><p className="font-black text-lg text-green-700">{stands.filter(s => (s.accumulatedTons / s.maxLimit) < 0.8).length}</p></div>
                 <div className="bg-yellow-100 p-1.5 border border-yellow-400 rounded-lg"><p className="text-[10px] font-bold text-yellow-800">إنذار (+80%)</p><p className="font-black text-lg text-yellow-700">{stands.filter(s => (s.accumulatedTons / s.maxLimit) >= 0.8 && (s.accumulatedTons / s.maxLimit) < 1).length}</p></div>
                 <div className="bg-red-100 p-1.5 border border-red-500 rounded-lg"><p className="text-[10px] font-bold text-red-800">خطر (+100%)</p><p className="font-black text-lg text-red-700">{stands.filter(s => (s.accumulatedTons / s.maxLimit) >= 1).length}</p></div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 mt-1">
                <div className="flex items-center gap-1.5 shrink-0">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-700">وزن البليت (طن):</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={billetWeight} 
                    onChange={(e) => handleWeightChange(e.target.value)} 
                    className="w-16 p-1 border border-slate-300 rounded text-center font-mono font-bold text-xs bg-slate-50 outline-none focus:border-blue-500" 
                  />
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={handleResetAllStands} className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-1.5 px-3 rounded text-[10px] flex items-center gap-1 shadow active:scale-95 transition-colors">
                    <RefreshCw className="w-3 h-3" /> تصفير كل الستاندات
                  </button>
                  <button onClick={handleClearArchive} className="bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-3 rounded text-[10px] flex items-center gap-1 shadow active:scale-95 transition-colors">
                    <Trash2 className="w-3 h-3" /> مسح الأرشيف
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* لوحة تسجيل الفني */}
          {currentUser === 'tech' && (
            <div className="bg-white p-2 rounded-lg shadow-sm flex flex-col flex-none border border-slate-300 gap-2">
              <div className="bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-bold p-1.5 rounded flex justify-between items-center">
                <button onClick={() => handleDateChange(-1)} className="px-3 py-1 bg-blue-200 hover:bg-blue-300 rounded active:scale-95 text-blue-900 transition-colors">يوم سابق</button>
                
                <div className="flex items-center gap-2">
                  <button onClick={handleGoToToday} className="px-2 py-1 bg-green-500 hover:bg-green-600 rounded active:scale-95 text-white shadow-sm transition-colors text-[9px] font-bold flex gap-1 items-center" title="تحديث للآن">
                    الآن <RotateCcw className="w-3 h-3"/>
                  </button>
                  <div className="flex flex-col items-center">
                     <span>تسجيل لـ: {currentProdDate.toLocaleDateString('ar-EG', { weekday: 'long' })} (الوزن: {billetWeight} طن)</span>
                     <span className="font-mono text-[11px] text-blue-600">{currentProdDate.toLocaleDateString('en-GB')}</span>
                  </div>
                </div>

                <button onClick={() => handleDateChange(1)} className="px-3 py-1 bg-blue-200 hover:bg-blue-300 rounded active:scale-95 text-blue-900 transition-colors">يوم تالي</button>
              </div>

              <div className="flex flex-row gap-1 items-stretch w-full">
                <input 
                  type="number" 
                  value={shiftBillets} 
                  onChange={(e) => setShiftBillets(e.target.value)} 
                  className="flex-1 min-w-0 p-2 border border-slate-400 rounded text-center text-sm font-bold outline-none focus:border-blue-500 bg-slate-50" 
                  placeholder="عدد البليت" 
                />
                <select 
                  value={selectedShift} 
                  onChange={(e) => setSelectedShift(e.target.value)} 
                  className="flex-1 min-w-0 bg-slate-100 border border-slate-400 text-xs font-bold p-1 rounded outline-none focus:border-blue-500 cursor-pointer"
                >
                  {availableShifts.map(shift => <option key={shift} value={shift}>{shift}</option>)}
                </select>
                <button 
                  onClick={handleAddShiftProduction} 
                  className="flex-1 min-w-0 bg-blue-600 hover:bg-blue-700 text-white font-bold p-1 rounded active:scale-95 transition-all flex justify-center items-center gap-1 shadow-sm text-[11px] sm:text-sm"
                >
                  <Save className="w-3 h-3 sm:w-4 sm:h-4" /> حفظ وإغلاق
                </button>
              </div>
            </div>
          )}

          {/* شبكة الستاندات - الضغط على أي ستاند يفتح صفحة الدرفيل والممرات */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 overflow-y-auto pr-1 pb-1">
            {stands.map((stand, idx) => {
              const displayTons = stand.accumulatedTons; 
              const percentage = Math.max(0, Math.min((stand.accumulatedTons / stand.maxLimit) * 100, 100));
              const status = getStandStatus(stand.accumulatedTons, stand.maxLimit);
              const usedPassesCount = stand.passes ? stand.passes.filter(p => p.status === 'used' || p.status === 'active').length : 1;

              return (
                <div 
                  key={idx} 
                  onClick={() => openStandRollPage(idx)}
                  className={`min-h-[155px] sm:min-h-[168px] rounded-xl flex flex-col justify-between border-2 cursor-pointer ${stand.isActive ? status.bg : 'bg-slate-300 opacity-60'} ${status.border} p-2 relative overflow-hidden shadow-sm hover:shadow-md hover:scale-[1.01] transition-all`}
                >
                  <div className="absolute bottom-0 left-0 w-full h-1.5 bg-slate-300/50">
                    <div className={`h-full ${status.bar}`} style={{width: `${percentage}%`, transition: 'width 0.5s ease-in-out'}}></div>
                  </div>
                  
                  {/* الصف العلوي لكارت الستاند */}
                  <div className="flex justify-between items-start z-10">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1">
                        <span className="font-black text-sm sm:text-base text-slate-900">{stand.name}</span>
                        <span className="text-[9px] bg-slate-800 text-white px-1.5 py-0.5 rounded font-mono">{stand.rollCode}</span>
                      </div>
                      <span className="text-[9px] text-slate-500 font-bold">
                        {stand.type} | قطر {stand.diameter}
                      </span>
                    </div>

                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setHistoryModal({ isOpen: true, standId: stand.id })} className="p-1 text-blue-600 bg-blue-100 hover:bg-blue-200 rounded transition-colors" title="سجل الممر">
                        <History className="w-3.5 h-3.5" />
                      </button>
                      {currentUser === 'tech' ? (
                        <button onClick={(e) => handleToggleActive(idx, e)} className={`p-1 rounded transition-colors ${stand.isActive ? 'text-green-600 bg-white/80 hover:bg-white' : 'text-slate-500 bg-black/10'}`}><Power className="w-3.5 h-3.5" /></button>
                      ) : (status.color === 'danger' && <AlertTriangle className="w-4 h-4 text-red-500 animate-ping" />)}
                    </div>
                  </div>
                  
                  {/* منتصف الكارت: الإنتاج الحالي ورقم الممر الشغال */}
                  <div className="flex flex-col items-center justify-center flex-1 z-10 py-1">
                    <span className={`font-mono font-black text-3xl sm:text-4xl leading-none tracking-tighter ${status.text}`}>
                      {displayTons.toFixed(0)}
                    </span>
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className="bg-slate-900 text-amber-400 text-[10px] font-black px-2 py-0.5 rounded shadow-sm">
                        ممر {stand.activePass} / {stand.totalPasses}
                      </span>
                      <span className="text-[9px] font-bold text-slate-600 bg-white/80 px-1.5 py-0.5 rounded border border-slate-200">
                        استُهلك {usedPassesCount}
                      </span>
                    </div>
                    <span className="text-[9px] font-bold opacity-75 mt-1 text-slate-600">الهدف: {stand.maxLimit} طن</span>
                  </div>
                  
                  {/* أسفل الكارت */}
                  {currentUser === 'tech' ? (
                    <div className="grid grid-cols-2 gap-1 z-10 mt-auto" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openStandRollPage(idx)} className="py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-md shadow">
                        الممرات ({stand.totalPasses})
                      </button>
                      <button onClick={(e) => initiateResetStand(idx, null, e)} className="py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold rounded-md shadow">
                        تصفير / نقل
                      </button>
                    </div>
                  ) : (
                    <div className="mt-auto pt-1.5 border-t border-black/10 flex items-center justify-between gap-1 z-10 w-full" onClick={e => e.stopPropagation()}>
                       <button onClick={(e) => initiateResetStand(idx, null, e)} className="bg-red-500 hover:bg-red-600 text-white text-[9px] sm:text-[10px] px-2 py-0.5 rounded font-bold transition-colors shadow-sm shrink-0">تصفير/ممر</button>
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

      {/* الإحصائيات والكيرف */}
      {activeTab === 'analytics' && (
        <div className="flex-1 bg-white rounded-lg shadow border border-slate-300 p-3 overflow-y-auto flex flex-col gap-4">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <h2 className="font-black text-sm text-slate-800">لوحة الإحصائيات وتحليل الإنتاجية</h2>
            </div>
          </div>
          
          {aggregatedLogs.length === 0 && passChanges.length === 0 ? (
            <div className="text-center py-12 text-slate-400 flex flex-col items-center gap-2">
              <BarChart3 className="w-10 h-10 opacity-30" />
              <p className="text-sm font-bold">لا توجد بيانات إنتاجية مسجلة لعرض الرسومات البيانية بعد.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-200 text-center shadow-sm">
                  <p className="text-[10px] font-bold text-blue-800">إجمالي الأطنان</p>
                  <p className="font-mono font-black text-lg sm:text-xl text-blue-900">
                    {aggregatedLogs.reduce((acc, curr) => acc + curr.tons, 0).toFixed(1)} <span className="text-xs font-normal">طن</span>
                  </p>
                </div>
                <div className="bg-green-50 p-2.5 rounded-lg border border-green-200 text-center shadow-sm">
                  <p className="text-[10px] font-bold text-green-800">إجمالي البليت</p>
                  <p className="font-mono font-black text-lg sm:text-xl text-green-900">
                    {aggregatedLogs.reduce((acc, curr) => acc + curr.billets, 0)} <span className="text-xs font-normal">بليت</span>
                  </p>
                </div>
                <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-200 text-center shadow-sm">
                  <p className="text-[10px] font-bold text-purple-800">الورديات المسجلة</p>
                  <p className="font-mono font-black text-lg sm:text-xl text-purple-900">
                    {aggregatedLogs.length}
                  </p>
                </div>
              </div>

              {/* سجل تغيير الممرات الشامل */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2 shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <RotateCcw className="w-4 h-4 text-orange-500" />
                  <h3 className="font-bold text-xs text-slate-700">سجل تغيير الممرات (تصفير الستاندات) الجماعي</h3>
                </div>
                {passChanges.length === 0 ? (
                  <p className="text-[10px] text-slate-500 text-center py-4 font-bold">لم يتم تسجيل أي تغيير للممرات حتى الآن.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 max-h-60 overflow-y-auto pr-1">
                    {passChanges.map(change => (
                      <div key={change.id} className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-1.5 hover:shadow transition-shadow">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                          <span className="font-bold text-xs text-slate-800 flex items-center gap-1">
                            <Settings2 className="w-3.5 h-3.5 text-blue-500" /> {change.standName || `ستاند ${change.standId}`}
                          </span>
                          <span className="text-[10px] font-black text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
                            إنتاج: {Number(change.tons).toFixed(1)} طن
                          </span>
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-600 mt-1 font-bold">
                          <span>{change.productSize} مم</span>
                          {change.fromPass && <span className="text-blue-700">ممر {change.fromPass} ← {change.toPass}</span>}
                        </div>
                        <div className="flex justify-between text-[8px] text-slate-400 font-mono mt-0.5">
                          <span dir="ltr">{change.date}</span>
                          <span dir="ltr">{change.shift}</span>
                        </div>
                        <p className="text-[10px] text-slate-700 bg-slate-50 p-1.5 rounded mt-1 border border-slate-100 line-clamp-2" title={change.notes}>
                          <span className="font-bold text-blue-600">ملاحظات:</span> {change.notes}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {aggregatedLogs.length > 0 && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2 shadow-sm">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-xs text-slate-700">مؤشر اتجاه الإنتاج (Production Trend)</h3>
                    <span className="text-[9px] text-slate-400 font-mono">آخر 10 ورديات مسجلة</span>
                  </div>
                  
                  <div className="w-full h-40 bg-white rounded-lg border border-slate-200 p-2 relative flex items-end">
                    <svg className="absolute inset-0 w-full h-full p-4 overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                      <defs>
                        <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      
                      {(() => {
                        const maxVal = Math.max(...aggregatedLogs.map(l => l.tons), 1);
                        const pointsData = [...aggregatedLogs].sort((a,b) => b.timestamp - a.timestamp).slice(0, 10).reverse();
                        
                        const points = pointsData.map((log, idx, arr) => {
                          const x = arr.length === 1 ? 50 : (idx / (arr.length - 1)) * 90 + 5;
                          const y = 90 - (log.tons / maxVal) * 80;
                          return `${x},${y}`;
                        });
                        
                        const pathD = `M ${points.join(' L ')}`;
                        const areaD = `${pathD} L 95,95 L 5,95 Z`;

                        return (
                          <>
                            <path d={areaD} fill="url(#grad)" />
                            <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                            {points.map((pt, i) => {
                              const [cx, cy] = pt.split(',');
                              return <circle key={i} cx={cx} cy={cy} r="4" className="fill-blue-600 stroke-white stroke-2" />;
                            })}
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* شاشة الأرشيف */}
      {activeTab === 'archive' && (
        <div className="flex-1 bg-slate-100 rounded-lg shadow border border-slate-300 p-2 overflow-y-auto">
          {sortedDates.length === 0 ? (
            <div className="text-center py-10 text-slate-400 flex flex-col items-center gap-2"><List className="w-8 h-8 opacity-50" /><p className="text-sm font-bold">لا يوجد إنتاج بعد.</p></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pb-4">
              {sortedDates.map((date) => {
                const dayData = groupedArchive[date];
                return (
                  <div key={date} className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col overflow-hidden transition-all hover:shadow-md">
                    <div className="bg-slate-800 text-white p-2 flex justify-between items-center flex-wrap gap-1">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-blue-400" />
                        <span className="font-bold text-xs">يوم {dayData.dayName}</span>
                      </div>
                      <span className="text-[9px] sm:text-[10px] font-mono text-slate-300 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">{date}</span>
                    </div>
                    <div className="bg-blue-50 p-2 flex flex-col sm:flex-row justify-between sm:items-center border-b border-blue-100 gap-1">
                      <span className="text-[10px] font-bold text-blue-900 hidden sm:inline">إجمالي الإنتاج:</span>
                      <div className="flex gap-1.5 justify-between w-full sm:w-auto">
                        <span className="bg-white text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border border-blue-200 text-center flex-1 sm:flex-none">{dayData.totalBillets} <span className="font-normal opacity-70">ب</span></span>
                        <span className="bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm text-center flex-1 sm:flex-none">{dayData.totalTons.toFixed(1)} <span className="font-normal opacity-90">ط</span></span>
                      </div>
                    </div>
                    <div className="p-1.5 flex-1 flex flex-col gap-1.5 bg-white">
                      {dayData.shiftsList.map((log, index) => (
                        <div key={index} className="flex flex-col sm:flex-row justify-between sm:items-center p-1.5 bg-slate-50 hover:bg-slate-100 rounded border border-slate-100 transition-colors">
                          <div className="flex justify-between sm:justify-start items-center sm:flex-col sm:items-start w-full sm:w-auto">
                            <span className="font-bold text-[10px] text-slate-800">{log.shift.replace('الوردية ', '').replace(' (12 ساعة)', '')} (مقاس {log.productSize || '10'} مم)</span>
                            <span className="text-[8px] text-slate-400 font-mono mt-0.5">{log.time}</span>
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
