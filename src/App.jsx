import React, { useState, useEffect } from 'react';
import { Users, UserCog, Edit3, TrendingUp, AlertTriangle, CheckCircle, RotateCcw, Save, Power, Settings2, Archive, CalendarDays, List, BarChart3, RefreshCw, Sliders, Trash2, Clock, Settings, X, Image as ImageIcon, UploadCloud } from 'lucide-react';
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

// ======================================================
// بداية التطبيق الفعلي (المكون الرئيسي App)
// ======================================================
export default function App() {
  /* 2. منطقة المتغيرات الحية (State) */
  const [currentUser, setCurrentUser] = useState('none'); 
  const [activeTab, setActiveTab] = useState('dashboard'); 
  const [userAuth, setUserAuth] = useState(null); 
  
  const appId = 'al-gioshy-steel-rolls'; 

  const initialStands = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1, 
    isActive: true, 
    accumulatedTons: 0, 
    maxLimit: 1000, 
    lastResetDate: new Date().toLocaleDateString('en-GB')
  }));

  const [stands, setStands] = useState(initialStands);
  const [shiftBillets, setShiftBillets] = useState(''); 
  const [productionArchive, setProductionArchive] = useState([]); 
  const [isDataLoaded, setIsDataLoaded] = useState(false); 
  
  // إعدادات التحكم
  const [billetWeight, setBilletWeight] = useState(0.75); 
  const [selectedProductSize, setSelectedProductSize] = useState('10'); 
  const [customLogo, setCustomLogo] = useState("https://placehold.co/400x150/1e293b/ffffff?text=Al-Gioshy+Steel&font=Montserrat");

  // للتحكم في نافذة الإعدادات
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempLogoUrl, setTempLogoUrl] = useState('');

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
    const settingsRef = doc(db, 'factory', appId, 'data', 'settingsState'); 

    const unsubStands = onSnapshot(standsRef, (docSnap) => {
      if (docSnap.exists()) setStands(docSnap.data().standsList);
      else setDoc(standsRef, { standsList: initialStands });
      setIsDataLoaded(true);
    });

    const unsubArchive = onSnapshot(archiveRef, (docSnap) => {
      if (docSnap.exists()) setProductionArchive(docSnap.data().archiveList);
      else setDoc(archiveRef, { archiveList: [] });
    });

    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.billetWeight) setBilletWeight(data.billetWeight);
        if (data.logoUrl) setCustomLogo(data.logoUrl);
      } else {
        setDoc(settingsRef, { billetWeight: 0.75, logoUrl: customLogo }, { merge: true });
      }
    });

    return () => { unsubStands(); unsubArchive(); unsubSettings(); };
  }, [userAuth]);

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

  // دالة العودة لتاريخ ووردية (الآن)
  const handleGoToToday = () => {
    const currentState = getInitialProductionState();
    setCurrentProdDate(currentState.prodDate);
    setSelectedShift(currentState.initialShift);
  };

  /* ======================================================
    5. دوال التشغيل والحفظ السحابي
    ======================================================
  */
  const handleProductSizeChange = (size) => {
    setSelectedProductSize(size);
    const newStands = stands.map((stand, index) => {
      let active = true;
      if (['16', '18', '22'].includes(size)) {
        if (index >= 10) active = false; 
      }
      return { ...stand, isActive: active };
    });
    saveToCloud(newStands, null, billetWeight, null);
  };

  const getStandStatus = (tons, limit) => {
    const percentage = (tons / limit) * 100;
    if (percentage >= 100) return { color: 'danger', bg: 'bg-red-100', border: 'border-red-500', bar: 'bg-red-600', text: 'text-red-700' };
    if (percentage >= 80) return { color: 'warning', bg: 'bg-yellow-100', border: 'border-yellow-400', bar: 'bg-yellow-500', text: 'text-yellow-700' };
    return { color: 'good', bg: 'bg-slate-50', border: 'border-slate-300', bar: 'bg-green-500', text: 'text-slate-700' };
  };

  // دالة الحفظ السحابي (تشمل اللوجو كـ Base64)
  const saveToCloud = async (newStands, newArchive, newWeight, newLogoUrl) => {
    if (userAuth && db) {
      try {
        if (newStands) await setDoc(doc(db, 'factory', appId, 'data', 'standsState'), { standsList: newStands });
        if (newArchive) await setDoc(doc(db, 'factory', appId, 'data', 'archiveState'), { archiveList: newArchive });
        
        const settingsUpdate = {};
        if (newWeight !== undefined && newWeight !== null) settingsUpdate.billetWeight = newWeight;
        if (newLogoUrl !== undefined && newLogoUrl !== null) settingsUpdate.logoUrl = newLogoUrl;
        
        if (Object.keys(settingsUpdate).length > 0) {
          await setDoc(doc(db, 'factory', appId, 'data', 'settingsState'), settingsUpdate, { merge: true });
        }
      } catch (error) { console.error("Save error:", error); }
    } else {
      if (newStands) setStands(newStands);
      if (newArchive) setProductionArchive(newArchive);
      if (newWeight !== undefined && newWeight !== null) setBilletWeight(newWeight);
      if (newLogoUrl !== undefined && newLogoUrl !== null) setCustomLogo(newLogoUrl);
    }
  };

  // --- دوال اللوجو المرفوع (الصورة) ---
  const openSettingsModal = () => {
    setTempLogoUrl(customLogo);
    setIsSettingsOpen(true);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        // تحويل الصورة لنص (Base64) وحفظها في الـ State المؤقت
        setTempLogoUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveSettings = () => {
    if (tempLogoUrl && tempLogoUrl.trim() !== '') {
      saveToCloud(null, null, null, tempLogoUrl.trim());
    }
    setIsSettingsOpen(false);
  };

  const handleToggleActive = (index) => {
    const newStands = [...stands];
    newStands[index].isActive = !newStands[index].isActive;
    saveToCloud(newStands, null, null, null);
  };

  const handleResetStand = (index) => {
    if(window.confirm(`هل أنت متأكد من تصفير وتغيير درافيل ستاند رقم ${stands[index].id}؟`)) {
      const newStands = [...stands];
      newStands[index].accumulatedTons = 0;
      newStands[index].lastResetDate = new Date().toLocaleDateString('en-GB');
      saveToCloud(newStands, null, null, null);
    }
  };

  const handleResetAllStands = () => {
    if(window.confirm('تحذير شديد: هل أنت متأكد من تصفير كافة عدادات الستاندات بالكامل؟ (هذا الإجراء لا يمكن التراجع عنه)')) {
      const newStands = stands.map(stand => ({
        ...stand,
        accumulatedTons: 0,
        lastResetDate: new Date().toLocaleDateString('en-GB')
      }));
      saveToCloud(newStands, null, null, null);
    }
  };

  const handleClearArchive = () => {
    if(window.confirm('تحذير نهائي: هل أنت متأكد من مسح جميع بيانات الأرشيف والإحصائيات القديمة بشكل كامل والبدء من جديد؟')) {
      saveToCloud(stands, [], null, null);
      alert('تم مسح الأرشيف بنجاح.');
    }
  }

  const handleLimitChange = (index, newValue) => {
    const val = Number(newValue);
    if (val > 0) {
      const newStands = [...stands];
      newStands[index].maxLimit = val;
      saveToCloud(newStands, null, null, null);
    }
  };

  const handleWeightChange = (newVal) => {
    const val = Number(newVal);
    if (val > 0) {
      saveToCloud(null, null, val, null);
    }
  };

  const handleAddShiftProduction = () => {
    const billetsCount = Number(shiftBillets);
    if (billetsCount <= 0 || isNaN(billetsCount)) return; 

    const addedTons = billetsCount * billetWeight; 
    const saveTime = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const dateStr = currentProdDate.toLocaleDateString('en-GB'); 
    const dayNameStr = currentProdDate.toLocaleDateString('ar-EG', { weekday: 'long' });
    
    const newStands = stands.map(stand => stand.isActive ? { ...stand, accumulatedTons: stand.accumulatedTons + addedTons } : stand);
    
    let newArchive = [...productionArchive];
    const existingLogIndex = newArchive.findIndex(log => log.date === dateStr && log.shift === selectedShift);

    if (existingLogIndex !== -1) {
      newArchive[existingLogIndex].billets += billetsCount;
      newArchive[existingLogIndex].tons += addedTons;
      newArchive[existingLogIndex].time = saveTime; 
      newArchive[existingLogIndex].productSize = selectedProductSize; 
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
        timestamp: currentProdDate.getTime() 
      };
      newArchive = [newArchiveLog, ...newArchive];
    }

    saveToCloud(newStands, newArchive, null, null); 

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
      alert(`تم إقفال يوم ${dayNameStr} وتسجيل إنتاج ${selectedShift} بنجاح!\n\nتم فتح يوم جديد تلقائياً وتجهيز الوردية الأولى.`);
    } else if (currentShiftIndex >= 0) {
      setSelectedShift(currentDayShifts[currentShiftIndex + 1]);
    } else {
      setSelectedShift(currentDayShifts[0]);
    }
    
    setShiftBillets(''); 
  };

  /* ======================================================
    6. ترتيب وتجميع الأرشيف للعرض
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
    7. واجهة المستخدم
    ======================================================
  */
  
  if (currentUser === 'none') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4" dir="rtl">
        <div className="bg-slate-800 p-8 rounded-xl max-w-sm w-full text-center border border-slate-700 shadow-2xl relative">
          
          {/* عرض لوجو المصنع في شاشة الدخول */}
          <div className="w-full flex justify-center mb-6 bg-white/5 p-2 rounded-lg border border-white/10">
            <img src={customLogo} alt="Factory Logo" className="h-20 object-contain drop-shadow-md" onError={(e) => e.target.src="https://placehold.co/400x150/1e293b/ffffff?text=Logo+Error"} />
          </div>
          
          <h1 className="text-2xl font-black mb-2 text-slate-100">تتبع درافيل الإنتاج</h1>
          <p className="text-blue-400 mb-8 text-sm flex items-center justify-center gap-1 font-bold">
            <CheckCircle className="w-4 h-4" /> نظام متصل بالسحابة
          </p>
          {!isDataLoaded ? (
            <div className="text-slate-400 animate-pulse text-sm font-bold">جاري الاتصال بقاعدة البيانات...</div>
          ) : (
            <div className="space-y-4">
              <button onClick={() => setCurrentUser('tech')} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 p-4 rounded-lg font-bold transition-colors shadow-lg">
                <Edit3 className="w-5 h-5" /> دخول فني الإنتاج
              </button>
              <button onClick={() => setCurrentUser('manager')} className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 p-4 rounded-lg font-bold transition-colors shadow-lg">
                <TrendingUp className="w-5 h-5" /> دخول إدارة المصنع
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh bg-slate-200 text-slate-900 font-sans flex flex-col p-1 gap-1 overflow-hidden" dir="rtl">
      
      {/* نافذة إعدادات النظام (رفع اللوجو من الجهاز) */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-300">
            <div className="bg-slate-800 p-3 flex justify-between items-center text-white">
              <h3 className="font-bold text-sm flex items-center gap-2"><Settings className="w-4 h-4"/> إعدادات النظام المتقدمة</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <UploadCloud className="w-4 h-4 text-blue-600"/> رفع لوجو المصنع (من الجهاز):
                </label>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handleLogoUpload} 
                  className="w-full border border-slate-300 rounded p-1.5 text-xs focus:border-blue-500 outline-none file:mr-2 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" 
                />
                <p className="text-[9px] text-slate-500">اختر صورة المصنع (يفضل حجم صغير) وسيتم حفظها مباشرة في قاعدة البيانات.</p>
              </div>
              
              {tempLogoUrl && (
                <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 flex flex-col items-center gap-2">
                  <span className="text-[9px] font-bold text-slate-400">معاينة الشعار:</span>
                  <img src={tempLogoUrl} alt="Preview" className="h-16 object-contain" onError={(e) => e.target.src="https://placehold.co/400x150/f1f5f9/64748b?text=Invalid+Image"} />
                </div>
              )}

              <button onClick={handleSaveSettings} className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 active:scale-95 transition-all flex justify-center items-center gap-2 shadow-md mt-2">
                <Save className="w-4 h-4" /> حفظ الإعدادات
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="bg-slate-900 text-white p-2 rounded flex flex-col gap-2 flex-none shadow-sm">
        <div className="flex justify-between items-center">
          
          <div className="flex items-center gap-2">
            {/* اللوجو المصغر في شريط التنقل */}
            <div className="bg-white/10 p-0.5 rounded backdrop-blur-sm hidden sm:flex">
               <img src={customLogo} alt="Logo" className="h-7 w-auto max-w-[120px] object-contain" onError={(e) => e.target.src="https://placehold.co/100x30/1e293b/ffffff?text=Logo"} />
            </div>
            <span className="font-bold text-sm">Roll Tracker</span>
          </div>

          <LiveClock />

          <div className="flex items-center gap-2">
            {currentUser === 'manager' && (
               <button onClick={openSettingsModal} className="bg-slate-700 p-1.5 rounded hover:bg-slate-600 transition-colors shadow-sm" title="إعدادات النظام">
                 <Settings className="w-3.5 h-3.5 text-blue-300" />
               </button>
            )}
            <span className="bg-slate-800 px-2 py-1 rounded text-[10px] font-bold text-blue-300 flex items-center gap-1 border border-slate-700">
              <span className={`w-2 h-2 rounded-full ${auth ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-slate-400'}`}></span> 
              {currentUser === 'tech' ? 'فني' : 'مدير'}
            </span>
            <button onClick={() => {setCurrentUser('none'); setActiveTab('dashboard');}} className="text-red-400 hover:text-red-300 text-xs font-bold transition-colors">خروج</button>
          </div>
        </div>
        <div className="flex gap-2 bg-slate-800 p-1 rounded-lg">
          <button onClick={() => setActiveTab('dashboard')} className={`flex-1 py-1.5 text-xs font-bold rounded flex justify-center items-center gap-1 transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'}`}><TrendingUp className="w-3 h-3" /> التشغيل</button>
          <button onClick={() => setActiveTab('analytics')} className={`flex-1 py-1.5 text-xs font-bold rounded flex justify-center items-center gap-1 transition-all ${activeTab === 'analytics' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'}`}><BarChart3 className="w-3 h-3" /> الإحصائيات</button>
          <button onClick={() => setActiveTab('archive')} className={`flex-1 py-1.5 text-xs font-bold rounded flex justify-center items-center gap-1 transition-all ${activeTab === 'archive' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'}`}><Archive className="w-3 h-3" /> الأرشيف</button>
        </div>
      </nav>

      {activeTab === 'dashboard' && (
        <div className="flex flex-col gap-1 flex-1 overflow-hidden">
          
          <div className="bg-white p-1.5 rounded shadow flex items-center justify-between border border-slate-300 flex-none text-xs overflow-x-auto whitespace-nowrap">
            <span className="font-bold text-slate-700 ml-2">مقاس المنتج الحالي:</span>
            <div className="flex gap-1">
              {['10', '12', '16', '18', '22'].map((size) => (
                <button
                  key={size}
                  onClick={() => handleProductSizeChange(size)}
                  className={`px-2.5 py-1 rounded font-bold transition-all shrink-0 ${selectedProductSize === size ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200'}`}
                >
                  {size} مم
                </button>
              ))}
            </div>
          </div>

          {currentUser === 'tech' && (
            <div className="bg-white p-1.5 rounded shadow flex flex-col flex-none border border-slate-300 gap-1.5">
              <div className="bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-bold p-1 rounded flex justify-between items-center">
                <button onClick={() => handleDateChange(-1)} className="px-2 py-1 bg-blue-200 hover:bg-blue-300 rounded active:scale-95 text-blue-900 transition-colors">يوم سابق</button>
                
                {/* زرار "الآن" المضاف حديثاً للعودة للوقت الحالي فوراً */}
                <div className="flex items-center gap-2">
                  <button onClick={handleGoToToday} className="px-2 py-1 bg-green-500 hover:bg-green-600 rounded active:scale-95 text-white shadow-sm transition-colors text-[9px] font-bold flex gap-1 items-center">
                    الآن <RotateCcw className="w-3 h-3"/>
                  </button>
                  <div className="flex flex-col items-center">
                     <span>تسجيل لـ: {currentProdDate.toLocaleDateString('ar-EG', { weekday: 'long' })} (مقاس {selectedProductSize} مم | البليت: {billetWeight} طن)</span>
                     <span className="font-mono text-[11px] text-blue-600">{currentProdDate.toLocaleDateString('en-GB')}</span>
                  </div>
                </div>

                <button onClick={() => handleDateChange(1)} className="px-2 py-1 bg-blue-200 hover:bg-blue-300 rounded active:scale-95 text-blue-900 transition-colors">يوم تالي</button>
              </div>

              <div className="flex gap-1 items-center">
                <input type="number" value={shiftBillets} onChange={(e) => setShiftBillets(e.target.value)} className="flex-1 p-1.5 border border-slate-400 rounded font-mono text-center text-lg font-bold outline-none" placeholder="عدد البليت للوردية" />
                <select value={selectedShift} onChange={(e) => setSelectedShift(e.target.value)} className="w-1/2 bg-slate-100 border border-slate-400 text-[11px] font-bold p-2 rounded outline-none focus:border-blue-500">
                  {availableShifts.map(shift => <option key={shift} value={shift}>{shift}</option>)}
                </select>
              </div>
              <button onClick={handleAddShiftProduction} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded active:scale-95 flex justify-center items-center gap-2">
                <Save className="w-4 h-4" /> حفظ وإغلاق الوردية
              </button>
            </div>
          )}

          {currentUser === 'manager' && (
            <div className="flex flex-col gap-1.5 flex-none bg-white p-2 rounded border border-slate-300 shadow-sm">
              <div className="grid grid-cols-3 gap-1 text-center">
                 <div className="bg-green-100 p-1 border border-green-300 rounded"><p className="text-[9px] font-bold text-green-800">أقل من 80%</p><p className="font-black text-green-700">{stands.filter(s => (s.accumulatedTons / s.maxLimit) < 0.8).length}</p></div>
                 <div className="bg-yellow-100 p-1 border border-yellow-400 rounded"><p className="text-[9px] font-bold text-yellow-800">إنذار (+80%)</p><p className="font-black text-yellow-700">{stands.filter(s => (s.accumulatedTons / s.maxLimit) >= 0.8 && (s.accumulatedTons / s.maxLimit) < 1).length}</p></div>
                 <div className="bg-red-100 p-1 border border-red-500 rounded"><p className="text-[9px] font-bold text-red-800">خطر (+100%)</p><p className="font-black text-red-700">{stands.filter(s => (s.accumulatedTons / s.maxLimit) >= 1).length}</p></div>
              </div>
              <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-200">
                <div className="flex items-center gap-1">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  <span className="text-[10px] font-bold text-slate-700">الوزن (طن):</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={billetWeight} 
                    onChange={(e) => handleWeightChange(e.target.value)} 
                    className="w-14 p-1 border border-slate-300 rounded text-center font-mono font-bold text-xs bg-slate-50 outline-none focus:border-blue-500" 
                  />
                </div>
                <div className="flex gap-1">
                  <button onClick={handleResetAllStands} className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-1 px-2 rounded text-[10px] flex items-center gap-1 shadow active:scale-95 transition-colors">
                    <RefreshCw className="w-3 h-3" /> تصفير الستاندات
                  </button>
                  <button onClick={handleClearArchive} className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-[10px] flex items-center gap-1 shadow active:scale-95 transition-colors">
                    <Trash2 className="w-3 h-3" /> مسح الأرشيف
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 grid grid-cols-3 md:grid-cols-6 gap-1 overflow-hidden">
            {stands.map((stand, idx) => {
              const status = getStandStatus(stand.accumulatedTons, stand.maxLimit);
              const percentage = Math.min((stand.accumulatedTons / stand.maxLimit) * 100, 100);

              return (
                <div key={idx} className={`rounded flex flex-col justify-between border ${stand.isActive ? status.bg : 'bg-slate-300 opacity-60'} ${status.border} p-1 relative overflow-hidden`}>
                  <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-300/50"><div className={`h-full ${status.bar}`} style={{width: `${percentage}%`}}></div></div>
                  <div className="flex justify-between items-center z-10">
                    <span className="font-black text-xs">St. {stand.id}</span>
                    {currentUser === 'tech' ? (
                      <button onClick={() => handleToggleActive(idx)} className={`p-1 rounded ${stand.isActive ? 'text-green-600 bg-white/50' : 'text-slate-500 bg-black/10'}`}><Power className="w-3 h-3" /></button>
                    ) : (status.color === 'danger' && <AlertTriangle className="w-3 h-3 text-red-500 animate-ping" />)}
                  </div>
                  <div className="flex flex-col items-center justify-center flex-1 z-10">
                    <span className={`font-mono font-black text-xl md:text-3xl leading-none ${status.text}`}>{stand.accumulatedTons.toFixed(0)}</span>
                    <span className="text-[9px] font-bold opacity-70 mt-1">{currentUser === 'tech' ? `من ${stand.maxLimit} طن` : `النسبة: ${percentage.toFixed(1)}%`}</span>
                  </div>
                  
                  {currentUser === 'tech' ? (
                    <button onClick={() => handleResetStand(idx)} className="w-full mt-1 py-1 bg-slate-800 text-white text-[9px] font-bold rounded z-10 active:scale-95">تصفير الدرفيل</button>
                  ) : (
                    <div className="mt-1 pt-1 border-t border-black/10 flex items-center justify-between gap-1 z-10">
                       <button onClick={() => handleResetStand(idx)} className="bg-red-500 hover:bg-red-600 text-white text-[8px] px-1 py-0.5 rounded font-bold">ريست</button>
                       <input type="number" value={stand.maxLimit} onChange={(e) => handleLimitChange(idx, e.target.value)} className="w-10 text-[10px] text-center border border-slate-300 rounded font-mono font-bold bg-white outline-none focus:border-blue-500" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="flex-1 bg-white rounded shadow border border-slate-300 p-3 overflow-y-auto flex flex-col gap-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <h2 className="font-black text-sm text-slate-800">لوحة الإحصائيات وتحليل الإنتاجية</h2>
            </div>
          </div>
          
          {aggregatedLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-400 flex flex-col items-center gap-2">
              <BarChart3 className="w-10 h-10 opacity-30" />
              <p className="text-sm font-bold">لا توجد بيانات إنتاجية مسجلة لعرض الرسومات البيانية بعد.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-200 text-center">
                  <p className="text-[10px] font-bold text-blue-800">إجمالي الأطنان</p>
                  <p className="font-mono font-black text-lg sm:text-xl text-blue-900">
                    {aggregatedLogs.reduce((acc, curr) => acc + curr.tons, 0).toFixed(1)} <span className="text-xs font-normal">طن</span>
                  </p>
                </div>
                <div className="bg-green-50 p-2.5 rounded-lg border border-green-200 text-center">
                  <p className="text-[10px] font-bold text-green-800">إجمالي البليت</p>
                  <p className="font-mono font-black text-lg sm:text-xl text-green-900">
                    {aggregatedLogs.reduce((acc, curr) => acc + curr.billets, 0)} <span className="text-xs font-normal">بليت</span>
                  </p>
                </div>
                <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-200 text-center">
                  <p className="text-[10px] font-bold text-purple-800">عدد الورديات المسجلة</p>
                  <p className="font-mono font-black text-lg sm:text-xl text-purple-900">
                    {aggregatedLogs.length}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2">
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
                <div className="flex justify-between text-[9px] text-slate-400 font-mono px-1">
                  <span>الأقدم</span>
                  <span>الأحدث</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="font-bold text-xs text-slate-700">سجل أداء الورديات الإجمالي:</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[...aggregatedLogs].sort((a,b) => b.timestamp - a.timestamp).map((log, i) => (
                    <div key={i} className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex justify-between items-center hover:bg-white transition-colors cursor-default shadow-sm hover:shadow">
                      <div className="flex flex-col">
                        <span className="font-bold text-xs text-slate-800">{log.date} ({log.shift})</span>
                        <span className="text-[10px] text-blue-600 font-bold mt-0.5">مقاس المنتج: {log.productSize || '10'} مم</span>
                        <span className="text-[8px] text-slate-400 font-mono">آخر تحديث: {log.time}</span>
                      </div>
                      <div className="text-left font-mono">
                        <div className="text-xs font-black text-green-700">{log.tons.toFixed(1)} طن</div>
                        <div className="text-[10px] text-slate-500">{log.billets} بليت</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'archive' && (
        <div className="flex-1 bg-slate-100 rounded shadow border border-slate-300 p-1.5 overflow-y-auto">
          {sortedDates.length === 0 ? (
            <div className="text-center py-10 text-slate-400 flex flex-col items-center gap-2"><List className="w-8 h-8 opacity-50" /><p className="text-sm font-bold">لا يوجد إنتاج بعد.</p></div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5 pb-4">
              {sortedDates.map((date) => {
                const dayData = groupedArchive[date];
                return (
                  <div key={date} className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col overflow-hidden transition-all hover:shadow-md">
                    <div className="bg-slate-800 text-white p-1.5 flex justify-between items-center flex-wrap gap-1">
                      <div className="flex items-center gap-1">
                        <CalendarDays className="w-3 h-3 text-blue-400" />
                        <span className="font-bold text-[10px] sm:text-xs">يوم {dayData.dayName}</span>
                      </div>
                      <span className="text-[8px] sm:text-[10px] font-mono text-slate-300 bg-slate-900 px-1 py-0.5 rounded border border-slate-700">{date}</span>
                    </div>
                    <div className="bg-blue-50 p-1.5 flex flex-col sm:flex-row justify-between sm:items-center border-b border-blue-100 gap-1">
                      <span className="text-[9px] font-bold text-blue-900 hidden sm:inline">إجمالي:</span>
                      <div className="flex gap-1 justify-between w-full sm:w-auto">
                        <span className="bg-white text-blue-800 text-[9px] font-bold px-1 py-0.5 rounded shadow-sm border border-blue-200 text-center flex-1 sm:flex-none">{dayData.totalBillets} <span className="font-normal opacity-70">ب</span></span>
                        <span className="bg-green-500 text-white text-[9px] font-bold px-1 py-0.5 rounded shadow-sm text-center flex-1 sm:flex-none">{dayData.totalTons.toFixed(1)} <span className="font-normal opacity-90">ط</span></span>
                      </div>
                    </div>
                    <div className="p-1 flex-1 flex flex-col gap-1 bg-white">
                      {dayData.shiftsList.map((log, index) => (
                        <div key={index} className="flex flex-col sm:flex-row justify-between sm:items-center p-1 bg-slate-50 hover:bg-slate-100 rounded border border-slate-100 transition-colors">
                          <div className="flex justify-between sm:justify-start items-center sm:flex-col sm:items-start w-full sm:w-auto">
                            <span className="font-bold text-[9px] text-slate-800">{log.shift.replace('الوردية ', '').replace(' (12 ساعة)', '')} (مقاس {log.productSize || '10'} مم)</span>
                            <span className="text-[7px] text-slate-400 font-mono">{log.time}</span>
                          </div>
                          <div className="flex justify-between items-center text-left font-mono bg-white px-1 py-0.5 rounded border border-slate-200 mt-0.5 sm:mt-0 w-full sm:w-auto">
                            <div className="text-[9px]"><span className="font-bold text-slate-700">{log.billets}</span><span className="text-[7px] text-slate-400">ب</span></div>
                            <span className="mx-1 text-[8px] text-slate-300">|</span>
                            <div className="text-[9px]"><span className="font-bold text-green-600">{log.tons.toFixed(1)}</span><span className="text-[7px] text-green-700">ط</span></div>
                          </div>
                        </div>
                      ))}
                      {dayData.shiftsList.length < (new Date(dayData.timestamp).getDay() === 5 ? 2 : 3) && (
                         <div className="flex-1 min-h-[25px] border border-dashed border-slate-200 rounded flex items-center justify-center m-0.5 opacity-50">
                           <span className="text-[8px] font-bold text-slate-400 animate-pulse">قيد التشغيل...</span>
                         </div>
                      )}
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
