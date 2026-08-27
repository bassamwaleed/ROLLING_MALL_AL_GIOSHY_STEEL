import React, { useState, useEffect } from 'react';
import { Users, UserCog, Edit3, TrendingUp, AlertTriangle, CheckCircle, RotateCcw, Save, Power, Settings2, Archive, CalendarDays, List, BarChart3, RefreshCw, Sliders, Trash2, Clock, Settings, X, UploadCloud } from 'lucide-react';
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
    <div className="flex bg-slate-800 border border-slate-700 rounded px-3 py-1 items-center gap-2 shadow-inner">
      <Clock className="w-4 h-4 text-blue-400" />
      <div className="flex flex-col items-center leading-none mt-0.5">
        <span className="text-xs font-mono font-bold text-slate-100" dir="ltr">
          {time.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <span className="text-[9px] text-slate-400 mt-0.5">
          {time.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' })}
        </span>
      </div>
    </div>
  );
};

// ======================================================
// بداية التطبيق الفعلي
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
  
  // إعدادات التحكم واللوجو
  const [billetWeight, setBilletWeight] = useState(0.75); 
  const [selectedProductSize, setSelectedProductSize] = useState('10'); 
  const [customLogo, setCustomLogo] = useState(""); 
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
        setDoc(settingsRef, { billetWeight: 0.75, logoUrl: "" }, { merge: true });
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

  const handleGoToToday = () => {
    const state = getInitialProductionState();
    setCurrentProdDate(new Date(state.prodDate.getTime())); 
    setSelectedShift(state.initialShift);
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
    saveToCloud(newStands, null, null, null);
  };

  const getStandStatus = (tons, limit) => {
    const percentage = (tons / limit) * 100;
    if (percentage >= 100) return { color: 'danger', bg: 'bg-red-100', border: 'border-red-500', bar: 'bg-red-600', text: 'text-red-700' };
    if (percentage >= 80) return { color: 'warning', bg: 'bg-yellow-100', border: 'border-yellow-400', bar: 'bg-yellow-500', text: 'text-yellow-700' };
    return { color: 'good', bg: 'bg-slate-50', border: 'border-slate-300', bar: 'bg-green-500', text: 'text-slate-700' };
  };

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

  const openSettingsModal = () => {
    setTempLogoUrl(customLogo);
    setIsSettingsOpen(true);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        alert("حجم الصورة كبير جداً. يرجى اختيار صورة أقل من 1 ميجابايت.");
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
    if(window.confirm('تحذير نهائي: هل أنت متأكد من مسح جميع بيانات الأرشيف القديمة بشكل كامل والبدء من جديد؟')) {
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
    
    const exactNow = new Date();
    const saveTime = exactNow.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const exactTimestamp = exactNow.getTime(); 
    
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
    6. ترتيب وتجميع الأرشيف (Aggregation)
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
          
          {customLogo ? (
            <div className="w-full flex justify-center mb-6 bg-white/5 p-4 rounded-lg border border-white/10">
              <img src={customLogo} alt="Factory Logo" className="h-24 object-contain drop-shadow-md" />
            </div>
          ) : (
            <Settings2 className="w-20 h-20 mx-auto text-blue-500 mb-6" />
          )}
          
          <h1 className="text-3xl font-black mb-3 text-slate-100">تتبع درافيل الإنتاج</h1>
          <p className="text-blue-400 mb-8 text-sm flex items-center justify-center gap-1 font-bold">
            <CheckCircle className="w-5 h-5" /> نظام متصل بالسحابة
          </p>
          {!isDataLoaded ? (
            <div className="text-slate-400 animate-pulse text-sm font-bold">جاري الاتصال بقاعدة البيانات...</div>
          ) : (
            <div className="space-y-4">
              <button onClick={() => setCurrentUser('tech')} className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 p-4 rounded-lg font-bold text-lg transition-colors shadow-lg">
                <Edit3 className="w-6 h-6" /> دخول فني الإنتاج
              </button>
              <button onClick={() => setCurrentUser('manager')} className="w-full flex items-center justify-center gap-3 bg-slate-700 hover:bg-slate-600 p-4 rounded-lg font-bold text-lg transition-colors shadow-lg">
                <TrendingUp className="w-6 h-6" /> دخول إدارة المصنع
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh bg-slate-200 text-slate-900 font-sans flex flex-col p-2 lg:p-4 gap-2 overflow-hidden max-w-[1600px] mx-auto w-full" dir="rtl">
      
      {/* نافذة رفع اللوجو */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-300">
            <div className="bg-slate-800 p-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-base flex items-center gap-2"><Settings className="w-5 h-5"/> إعدادات النظام المتقدمة</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X className="w-6 h-6"/></button>
            </div>
            <div className="p-6 flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-1">
                  <UploadCloud className="w-5 h-5 text-blue-600"/> رفع لوجو المصنع (من الجهاز):
                </label>
                <input 
                  type="file" 
                  accept="image/png, image/jpeg"
                  onChange={handleLogoUpload} 
                  className="w-full border border-slate-300 rounded p-2 text-sm focus:border-blue-500 outline-none file:mr-3 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" 
                />
                <p className="text-[11px] text-slate-500">اختر صورة المصنع (يفضل حجم صغير PNG/JPG) وسيتم تطبيقها فوراً.</p>
              </div>
              
              {tempLogoUrl && (
                <div className="bg-slate-100 p-4 rounded-lg border border-slate-200 flex flex-col items-center gap-3">
                  <span className="text-xs font-bold text-slate-400">معاينة الشعار:</span>
                  <img src={tempLogoUrl} alt="Preview" className="h-20 object-contain" />
                </div>
              )}

              <button onClick={handleSaveSettings} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 active:scale-95 transition-all flex justify-center items-center gap-2 shadow-md mt-2 text-lg">
                <Save className="w-5 h-5" /> تطبيق الشعار
              </button>
            </div>
          </div>
        </div>
      )}

      {/* الشريط العلوي */}
      <nav className="bg-slate-900 text-white p-3 lg:px-6 lg:py-4 rounded-xl flex flex-col lg:flex-row gap-3 flex-none shadow-md">
        
        <div className="flex justify-between items-center lg:w-1/3">
          <div className="flex items-center gap-3">
            {customLogo && (
              <div className="bg-white/10 p-1 rounded backdrop-blur-sm hidden sm:flex">
                 <img src={customLogo} alt="Logo" className="h-8 lg:h-10 w-auto max-w-[150px] object-contain" />
              </div>
            )}
            <span className="font-bold text-base lg:text-lg">Roll Tracker</span>
          </div>
          {/* إظهار الساعة في الموبايل فقط هنا */}
          <div className="lg:hidden"><LiveClock /></div>
        </div>

        {/* أزرار التنقل في المنتصف للشاشات الكبيرة */}
        <div className="flex gap-2 bg-slate-800 p-1.5 rounded-lg lg:w-1/3 lg:justify-center">
          <button onClick={() => setActiveTab('dashboard')} className={`flex-1 lg:flex-none lg:px-6 py-2 text-sm font-bold rounded flex justify-center items-center gap-2 transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'}`}><TrendingUp className="w-4 h-4" /> التشغيل</button>
          <button onClick={() => setActiveTab('analytics')} className={`flex-1 lg:flex-none lg:px-6 py-2 text-sm font-bold rounded flex justify-center items-center gap-2 transition-all ${activeTab === 'analytics' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'}`}><BarChart3 className="w-4 h-4" /> الإحصائيات</button>
          <button onClick={() => setActiveTab('archive')} className={`flex-1 lg:flex-none lg:px-6 py-2 text-sm font-bold rounded flex justify-center items-center gap-2 transition-all ${activeTab === 'archive' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:bg-slate-700'}`}><Archive className="w-4 h-4" /> الأرشيف</button>
        </div>

        <div className="hidden lg:flex items-center justify-end gap-4 lg:w-1/3">
           {/* إظهار الساعة في اللاب توب هنا */}
           <LiveClock />
           <div className="h-8 w-px bg-slate-700"></div>
           {currentUser === 'manager' && (
               <button onClick={openSettingsModal} className="bg-slate-700 p-2 rounded-lg hover:bg-slate-600 transition-colors shadow-sm" title="إعدادات النظام">
                 <Settings className="w-5 h-5 text-blue-300" />
               </button>
            )}
            <span className="bg-slate-800 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-300 flex items-center gap-2 border border-slate-700">
              <span className={`w-2.5 h-2.5 rounded-full ${auth ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-slate-400'}`}></span> 
              {currentUser === 'tech' ? 'فني تشغيل' : 'مدير المصنع'}
            </span>
            <button onClick={() => {setCurrentUser('none'); setActiveTab('dashboard');}} className="text-red-400 hover:text-red-300 text-sm font-bold transition-colors ml-2">خروج</button>
        </div>
      </nav>

      {/* لوحة التشغيل (الداشبورد) */}
      {activeTab === 'dashboard' && (
        <div className="flex flex-col gap-2 flex-1 overflow-hidden">
          
          <div className="bg-white p-2 lg:p-4 rounded-xl shadow-sm flex items-center justify-between border border-slate-300 flex-none overflow-x-auto whitespace-nowrap">
            <div className="flex items-center gap-4 shrink-0">
               {customLogo && <img src={customLogo} alt="Dashboard Logo" className="h-10 lg:h-12 object-contain drop-shadow-sm" />}
               <div className="w-px h-8 bg-slate-300 hidden sm:block"></div>
               <span className="font-bold text-slate-700 text-sm lg:text-base hidden sm:inline">مقاس المنتج:</span>
            </div>
            <div className="flex gap-2 ml-auto">
              {['10', '12', '16', '18', '22'].map((size) => (
                <button
                  key={size}
                  onClick={() => handleProductSizeChange(size)}
                  className={`px-4 lg:px-6 py-2 lg:py-2.5 rounded-lg font-bold text-sm lg:text-base transition-all shrink-0 ${selectedProductSize === size ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200'}`}
                >
                  {size} مم
                </button>
              ))}
            </div>
          </div>

          {/* شاشة الفني */}
          {currentUser === 'tech' && (
            <div className="bg-white p-3 lg:p-4 rounded-xl shadow-sm flex flex-col lg:flex-row flex-none border border-slate-300 gap-3 items-stretch lg:items-center">
              
              <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs lg:text-sm font-bold p-2 lg:p-3 rounded-lg flex justify-between items-center lg:w-2/5">
                <button onClick={() => handleDateChange(-1)} className="px-3 py-1.5 bg-blue-200 hover:bg-blue-300 rounded-md active:scale-95 text-blue-900 transition-colors">سابق</button>
                
                <div className="flex flex-col items-center mx-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="hidden lg:inline">تسجيل لـ:</span>
                    <span>يوم {currentProdDate.toLocaleDateString('ar-EG', { weekday: 'long' })}</span>
                    <button onClick={handleGoToToday} className="px-2 py-0.5 bg-green-500 hover:bg-green-600 rounded text-white shadow-sm transition-colors text-[10px] flex gap-1 items-center" title="تحديث لتاريخ اليوم">
                      الآن <RotateCcw className="w-3 h-3"/>
                    </button>
                  </div>
                  <span className="font-mono text-xs text-blue-600 tracking-wider">{currentProdDate.toLocaleDateString('en-GB')}</span>
                  <span className="text-[10px] text-slate-500 mt-0.5 lg:hidden">({selectedProductSize} مم | {billetWeight} طن)</span>
                </div>

                <button onClick={() => handleDateChange(1)} className="px-3 py-1.5 bg-blue-200 hover:bg-blue-300 rounded-md active:scale-95 text-blue-900 transition-colors">تالي</button>
              </div>

              <div className="flex gap-2 items-stretch lg:w-2/5">
                <input type="number" value={shiftBillets} onChange={(e) => setShiftBillets(e.target.value)} className="flex-1 p-3 border-2 border-slate-300 rounded-lg font-mono text-center text-xl font-bold outline-none focus:border-blue-500 transition-colors" placeholder="عدد البليت للوردية" />
                <select value={selectedShift} onChange={(e) => setSelectedShift(e.target.value)} className="w-1/2 bg-slate-50 border-2 border-slate-300 text-xs lg:text-sm font-bold p-3 rounded-lg outline-none focus:border-blue-500 transition-colors cursor-pointer">
                  {availableShifts.map(shift => <option key={shift} value={shift}>{shift}</option>)}
                </select>
              </div>
              
              <button onClick={handleAddShiftProduction} className="lg:w-1/5 bg-blue-600 hover:bg-blue-700 text-white font-bold p-3 rounded-lg active:scale-95 flex justify-center items-center gap-2 transition-all text-base lg:text-lg shadow-md">
                <Save className="w-5 h-5" /> حفظ وإغلاق
              </button>
            </div>
          )}

          {/* شاشة المدير */}
          {currentUser === 'manager' && (
            <div className="flex flex-col lg:flex-row gap-3 flex-none bg-white p-3 lg:p-4 rounded-xl border border-slate-300 shadow-sm items-stretch">
              
              <div className="grid grid-cols-3 gap-2 text-center lg:w-1/2">
                 <div className="bg-green-50 p-2 border border-green-200 rounded-lg flex flex-col justify-center"><p className="text-[10px] lg:text-xs font-bold text-green-800 mb-1">أقل من 80%</p><p className="font-black text-xl lg:text-2xl text-green-600">{stands.filter(s => (s.accumulatedTons / s.maxLimit) < 0.8).length}</p></div>
                 <div className="bg-yellow-50 p-2 border border-yellow-200 rounded-lg flex flex-col justify-center"><p className="text-[10px] lg:text-xs font-bold text-yellow-800 mb-1">إنذار (+80%)</p><p className="font-black text-xl lg:text-2xl text-yellow-600">{stands.filter(s => (s.accumulatedTons / s.maxLimit) >= 0.8 && (s.accumulatedTons / s.maxLimit) < 1).length}</p></div>
                 <div className="bg-red-50 p-2 border border-red-200 rounded-lg flex flex-col justify-center"><p className="text-[10px] lg:text-xs font-bold text-red-800 mb-1">خطر (+100%)</p><p className="font-black text-xl lg:text-2xl text-red-600">{stands.filter(s => (s.accumulatedTons / s.maxLimit) >= 1).length}</p></div>
              </div>
              
              <div className="flex flex-col lg:flex-row items-stretch justify-between gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 lg:border-r border-slate-200 lg:pl-4 lg:w-1/2">
                <div className="flex items-center justify-between lg:justify-start gap-3 bg-slate-50 p-2 lg:p-3 rounded-lg border border-slate-200 flex-1">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-blue-600" />
                    <span className="text-xs lg:text-sm font-bold text-slate-700">وزن البليت:</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input 
                      type="number" step="0.01" value={billetWeight} onChange={(e) => handleWeightChange(e.target.value)} 
                      className="w-20 lg:w-24 p-1.5 border-2 border-slate-300 rounded-md text-center font-mono font-bold text-sm lg:text-base bg-white outline-none focus:border-blue-500 transition-colors" 
                    />
                    <span className="text-xs font-bold text-slate-500">طن</span>
                  </div>
                </div>
                
                <div className="flex gap-2 lg:flex-col lg:w-1/3">
                  <button onClick={handleResetAllStands} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-3 rounded-lg text-xs lg:text-sm flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-colors">
                    <RefreshCw className="w-4 h-4" /> تصفير الستاندات
                  </button>
                  <button onClick={handleClearArchive} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg text-xs lg:text-sm flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-colors">
                    <Trash2 className="w-4 h-4" /> مسح الأرشيف
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* شبكة الستاندات المتناسقة - 6 أعمدة في اللاب توب و 3 في الموبايل */}
          <div className="flex-1 grid grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3 overflow-hidden pb-1">
            {stands.map((stand, idx) => {
              const status = getStandStatus(stand.accumulatedTons, stand.maxLimit);
              const percentage = Math.min((stand.accumulatedTons / stand.maxLimit) * 100, 100);

              return (
                <div key={idx} className={`rounded-xl flex flex-col justify-between border-2 ${stand.isActive ? status.bg : 'bg-slate-200 opacity-70'} ${stand.isActive ? status.border : 'border-slate-300'} p-2 lg:p-3 relative overflow-hidden shadow-sm transition-all hover:shadow-md`}>
                  <div className="absolute bottom-0 left-0 w-full h-1.5 bg-slate-200"><div className={`h-full ${status.bar}`} style={{width: `${percentage}%`, transition: 'width 0.5s ease-in-out'}}></div></div>
                  
                  <div className="flex justify-between items-center z-10 border-b border-black/5 pb-1 lg:pb-2 mb-1 lg:mb-2">
                    <span className="font-black text-sm lg:text-base text-slate-800">St. {stand.id}</span>
                    {currentUser === 'tech' ? (
                      <button onClick={() => handleToggleActive(idx)} className={`p-1.5 rounded-md transition-colors ${stand.isActive ? 'text-green-700 bg-green-100 hover:bg-green-200' : 'text-slate-500 bg-slate-300 hover:bg-slate-400'}`}><Power className="w-3.5 h-3.5 lg:w-4 lg:h-4" /></button>
                    ) : (status.color === 'danger' && <AlertTriangle className="w-4 h-4 text-red-500 animate-ping" />)}
                  </div>
                  
                  <div className="flex flex-col items-center justify-center flex-1 z-10">
                    <span className={`font-mono font-black text-2xl lg:text-4xl leading-none ${status.text}`}>{stand.accumulatedTons.toFixed(0)}</span>
                    <span className="text-[10px] lg:text-xs font-bold text-slate-500 mt-1 lg:mt-2 bg-white/50 px-2 py-0.5 rounded-full border border-black/5">
                      {currentUser === 'tech' ? `من ${stand.maxLimit} طن` : `النسبة: ${percentage.toFixed(1)}%`}
                    </span>
                  </div>
                  
                  {currentUser === 'tech' ? (
                    <button onClick={() => handleResetStand(idx)} className="w-full mt-2 lg:mt-3 py-2 bg-slate-800 text-white text-xs lg:text-sm font-bold rounded-lg z-10 active:scale-95 transition-transform shadow-sm hover:bg-slate-700">تصفير الدرفيل</button>
                  ) : (
                    <div className="mt-2 lg:mt-3 pt-2 border-t border-black/10 flex items-center justify-between gap-2 z-10">
                       <button onClick={() => handleResetStand(idx)} className="bg-red-500 hover:bg-red-600 text-white text-[10px] lg:text-xs px-2 py-1.5 rounded-md font-bold transition-colors shadow-sm">ريست</button>
                       <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-md px-1 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-200 transition-all">
                          <span className="text-[9px] font-bold text-slate-400 pl-1 border-l border-slate-200 hidden xl:inline">الهدف:</span>
                          <input type="number" value={stand.maxLimit} onChange={(e) => handleLimitChange(idx, e.target.value)} className="w-12 lg:w-14 py-1 text-xs lg:text-sm text-center font-mono font-bold outline-none bg-transparent" />
                       </div>
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
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-300 p-4 lg:p-6 overflow-y-auto flex flex-col gap-4 lg:gap-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg"><BarChart3 className="w-6 h-6 text-blue-600" /></div>
              <h2 className="font-black text-lg lg:text-xl text-slate-800">الإحصائيات والتحليل البياني</h2>
            </div>
          </div>
          
          {aggregatedLogs.length === 0 ? (
            <div className="text-center py-16 text-slate-400 flex flex-col items-center gap-3 bg-slate-50 rounded-xl border border-dashed border-slate-300">
              <BarChart3 className="w-12 h-12 opacity-30" />
              <p className="text-base font-bold">لا توجد بيانات إنتاجية مسجلة لعرض الرسومات البيانية بعد.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 flex flex-col items-center justify-center shadow-sm transition-transform hover:-translate-y-1">
                  <p className="text-xs lg:text-sm font-bold text-blue-800 mb-2 bg-blue-100 px-3 py-1 rounded-full">إجمالي الأطنان المُنْتجة</p>
                  <p className="font-mono font-black text-3xl lg:text-4xl text-blue-900">
                    {aggregatedLogs.reduce((acc, curr) => acc + curr.tons, 0).toFixed(1)} <span className="text-sm font-bold text-blue-700">طن</span>
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded-xl border border-green-200 flex flex-col items-center justify-center shadow-sm transition-transform hover:-translate-y-1">
                  <p className="text-xs lg:text-sm font-bold text-green-800 mb-2 bg-green-100 px-3 py-1 rounded-full">إجمالي عدد البليت المسحوب</p>
                  <p className="font-mono font-black text-3xl lg:text-4xl text-green-900">
                    {aggregatedLogs.reduce((acc, curr) => acc + curr.billets, 0)} <span className="text-sm font-bold text-green-700">بليت</span>
                  </p>
                </div>
                <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 flex flex-col items-center justify-center shadow-sm transition-transform hover:-translate-y-1">
                  <p className="text-xs lg:text-sm font-bold text-purple-800 mb-2 bg-purple-100 px-3 py-1 rounded-full">إجمالي الورديات المسجلة</p>
                  <p className="font-mono font-black text-3xl lg:text-4xl text-purple-900">
                    {aggregatedLogs.length} <span className="text-sm font-bold text-purple-700">وردية</span>
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-4 lg:p-6 rounded-xl border border-slate-200 flex flex-col gap-3 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                    <h3 className="font-bold text-sm lg:text-base text-slate-800">مؤشر اتجاه الإنتاج (Production Trend)</h3>
                  </div>
                  <span className="text-xs bg-slate-200 text-slate-600 font-bold px-2 py-1 rounded-md">آخر 10 ورديات مسجلة</span>
                </div>
                
                <div className="w-full h-48 lg:h-64 bg-white rounded-xl border border-slate-300 p-2 relative flex items-end shadow-inner">
                  <svg className="absolute inset-0 w-full h-full p-4 lg:p-6 overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <defs>
                      <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
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
                          {/* خطوط الشبكة الإرشادية */}
                          <line x1="5" y1="10" x2="95" y2="10" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="2,2" />
                          <line x1="5" y1="50" x2="95" y2="50" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="2,2" />
                          <line x1="5" y1="90" x2="95" y2="90" stroke="#e2e8f0" strokeWidth="1" />
                          
                          <path d={areaD} fill="url(#grad)" />
                          <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                          
                          {/* إضافة قيم فوق النقاط في الشاشات الكبيرة */}
                          {points.map((pt, i) => {
                            const [cx, cy] = pt.split(',');
                            const val = pointsData[i].tons.toFixed(0);
                            return (
                              <g key={i}>
                                <circle cx={cx} cy={cy} r="4.5" className="fill-white stroke-blue-600 stroke-[3px] hover:r-[6px] transition-all cursor-pointer" />
                                <text x={cx} y={Number(cy) - 8} fontSize="4" fill="#64748b" textAnchor="middle" className="font-mono font-bold hidden md:block">{val}</text>
                              </g>
                            );
                          })}
                        </>
                      );
                    })()}
                  </svg>
                </div>
                <div className="flex justify-between text-xs text-slate-500 font-bold px-2 mt-1">
                  <span>الأقدم</span>
                  <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded">الوقت الحالي</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <List className="w-5 h-5 text-slate-600" />
                  <h3 className="font-bold text-sm lg:text-base text-slate-800">سجل أداء الورديات التفصيلي:</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[...aggregatedLogs].sort((a,b) => b.timestamp - a.timestamp).map((log, i) => (
                    <div key={i} className="bg-white p-3 lg:p-4 rounded-xl border border-slate-200 flex justify-between items-center hover:border-blue-300 transition-colors shadow-sm group">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">{log.date}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded border border-slate-200">{log.shift.replace(' (12 ساعة)', '')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-100">مقاس: {log.productSize || '10'} مم</span>
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono mt-1">آخر تحديث للوردية: {log.time}</span>
                      </div>
                      <div className="text-left font-mono flex flex-col items-end">
                        <div className="text-lg lg:text-xl font-black text-green-600 bg-green-50 px-2 py-1 rounded-md border border-green-100 group-hover:bg-green-500 group-hover:text-white transition-colors">{log.tons.toFixed(1)} <span className="text-xs font-bold">ط</span></div>
                        <div className="text-xs text-slate-500 font-bold mt-1 mr-1">{log.billets} <span className="text-[10px]">بليت</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* شاشة الأرشيف */}
      {activeTab === 'archive' && (
        <div className="flex-1 bg-slate-100 rounded-xl shadow-inner border border-slate-300 p-2 lg:p-4 overflow-y-auto">
          {sortedDates.length === 0 ? (
            <div className="text-center py-16 text-slate-400 flex flex-col items-center gap-3"><List className="w-12 h-12 opacity-30" /><p className="text-base font-bold">لا يوجد إنتاج مسجل في الأرشيف بعد.</p></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4 pb-4">
              {sortedDates.map((date) => {
                const dayData = groupedArchive[date];
                return (
                  <div key={date} className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden transition-all hover:shadow-md hover:border-blue-300">
                    
                    <div className="bg-slate-800 text-white p-3 lg:p-4 flex justify-between items-center gap-2">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 lg:w-5 lg:h-5 text-blue-400" />
                        <span className="font-bold text-sm lg:text-base">يوم {dayData.dayName}</span>
                      </div>
                      <span className="text-[10px] lg:text-xs font-mono text-slate-300 bg-slate-900 px-2 py-1 rounded-md border border-slate-700">{date}</span>
                    </div>
                    
                    <div className="bg-blue-50/80 p-3 flex flex-col gap-2 border-b border-blue-100">
                      <span className="text-[10px] lg:text-xs font-bold text-blue-900 opacity-80 uppercase tracking-wider">حصيلة اليوم الإنتاجي:</span>
                      <div className="flex gap-2 w-full">
                        <div className="flex-1 bg-white flex flex-col items-center py-1.5 rounded-lg shadow-sm border border-blue-100">
                          <span className="font-mono font-black text-blue-800 text-base lg:text-lg leading-none">{dayData.totalBillets}</span>
                          <span className="text-[9px] lg:text-[10px] font-bold text-slate-500 mt-0.5">إجمالي البليت</span>
                        </div>
                        <div className="flex-1 bg-green-500 flex flex-col items-center py-1.5 rounded-lg shadow-sm border border-green-600 text-white">
                          <span className="font-mono font-black text-base lg:text-lg leading-none">{dayData.totalTons.toFixed(1)}</span>
                          <span className="text-[9px] lg:text-[10px] font-bold opacity-90 mt-0.5">إجمالي الأطنان</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-2 lg:p-3 flex-1 flex flex-col gap-2 bg-slate-50/50">
                      <span className="text-[10px] font-bold text-slate-500 px-1">تفاصيل الورديات:</span>
                      {dayData.shiftsList.map((log, index) => (
                        <div key={index} className="flex flex-col sm:flex-row justify-between sm:items-center p-2 bg-white rounded-lg border border-slate-200 shadow-sm transition-colors hover:border-blue-200 relative overflow-hidden group">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-200 group-hover:bg-blue-400 transition-colors"></div>
                          
                          <div className="flex flex-col pl-2 sm:pl-3">
                            <span className="font-bold text-xs lg:text-sm text-slate-800">{log.shift.replace('الوردية ', '').replace(' (12 ساعة)', '')}</span>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold border border-slate-200">مقاس {log.productSize || '10'} مم</span>
                              <span className="text-[8px] text-slate-400 font-mono hidden sm:inline">{log.time}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3 text-left font-mono mt-2 sm:mt-0 bg-slate-50 px-2 py-1.5 rounded-md border border-slate-100">
                            <div className="flex flex-col items-end">
                              <span className="font-black text-sm text-slate-700 leading-none">{log.billets}</span>
                              <span className="text-[8px] font-bold text-slate-400 mt-0.5">بليت</span>
                            </div>
                            <div className="w-px h-6 bg-slate-300 mx-1"></div>
                            <div className="flex flex-col items-end">
                              <span className="font-black text-sm text-green-600 leading-none">{log.tons.toFixed(1)}</span>
                              <span className="text-[8px] font-bold text-green-700 mt-0.5">طن</span>
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {dayData.shiftsList.length < (new Date(dayData.timestamp).getDay() === 5 ? 2 : 3) && (
                         <div className="mt-1 flex-1 min-h-[40px] border-2 border-dashed border-slate-200 bg-white/50 rounded-lg flex items-center justify-center opacity-70">
                           <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin"/> الوردية القادمة قيد العمل...</span>
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
