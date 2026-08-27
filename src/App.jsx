import React, { useState, useEffect } from 'react';
import { Users, UserCog, Edit3, TrendingUp, AlertTriangle, CheckCircle, RotateCcw, Save, Power, Settings2, Archive, CalendarDays, List, BarChart3, RefreshCw } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

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

export default function App() {
  const [currentUser, setCurrentUser] = useState('none');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [userAuth, setUserAuth] = useState(null);
  
  const BILLET_WEIGHT = 0.75; 
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
  const [selectedProductSize, setSelectedProductSize] = useState('10'); 
  const [isDataLoaded, setIsDataLoaded] = useState(false); 

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

    const unsubStands = onSnapshot(standsRef, (docSnap) => {
      if (docSnap.exists()) setStands(docSnap.data().standsList);
      else setDoc(standsRef, { standsList: initialStands });
      setIsDataLoaded(true);
    });

    const unsubArchive = onSnapshot(archiveRef, (docSnap) => {
      if (docSnap.exists()) setProductionArchive(docSnap.data().archiveList);
      else setDoc(archiveRef, { archiveList: [] });
    });

    return () => { unsubStands(); unsubArchive(); };
  }, [userAuth]);

  const handleProductSizeChange = (size) => {
    setSelectedProductSize(size);
    const newStands = stands.map((stand, index) => {
      let active = true;
      if (['16', '18', '22'].includes(size)) {
        if (index >= 10) active = false; 
      }
      return { ...stand, isActive: active };
    });
    saveToCloud(newStands, null);
  };

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

  const getStandStatus = (tons, limit) => {
    const percentage = (tons / limit) * 100;
    if (percentage >= 100) return { color: 'danger', bg: 'bg-red-100', border: 'border-red-500', bar: 'bg-red-600', text: 'text-red-700' };
    if (percentage >= 80) return { color: 'warning', bg: 'bg-yellow-100', border: 'border-yellow-400', bar: 'bg-yellow-500', text: 'text-yellow-700' };
    return { color: 'good', bg: 'bg-slate-50', border: 'border-slate-300', bar: 'bg-green-500', text: 'text-slate-700' };
  };

  const saveToCloud = async (newStands, newArchive) => {
    if (userAuth && db) {
      try {
        await setDoc(doc(db, 'factory', appId, 'data', 'standsState'), { standsList: newStands });
        if (newArchive) await setDoc(doc(db, 'factory', appId, 'data', 'archiveState'), { archiveList: newArchive });
      } catch (error) { console.error("Save error:", error); }
    } else {
      setStands(newStands);
      if (newArchive) setProductionArchive(newArchive);
    }
  };

  const handleToggleActive = (index) => {
    const newStands = [...stands];
    newStands[index].isActive = !newStands[index].isActive;
    saveToCloud(newStands, null);
  };

  const handleResetStand = (index) => {
    if(window.confirm(`تصفير وتغيير درافيل ستاند رقم ${stands[index].id}؟`)) {
      const newStands = [...stands];
      newStands[index].accumulatedTons = 0;
      newStands[index].lastResetDate = new Date().toLocaleDateString('en-GB');
      saveToCloud(newStands, null);
    }
  };

  const handleResetAllStands = () => {
    if(window.confirm('تحذير: هل أنت متأكد من تصفير كافة عدادات الستاندات بالكامل؟')) {
      const newStands = stands.map(stand => ({
        ...stand,
        accumulatedTons: 0,
        lastResetDate: new Date().toLocaleDateString('en-GB')
      }));
      saveToCloud(newStands, null);
    }
  };

  const handleLimitChange = (index, newValue) => {
    const val = Number(newValue);
    if (val > 0) {
      const newStands = [...stands];
      newStands[index].maxLimit = val;
      saveToCloud(newStands, null);
    }
  };

  const handleAddShiftProduction = () => {
    const billetsCount = Number(shiftBillets);
    if (billetsCount <= 0 || isNaN(billetsCount)) return;

    const addedTons = billetsCount * BILLET_WEIGHT;
    const saveTime = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const dateStr = currentProdDate.toLocaleDateString('en-GB'); 
    const dayNameStr = currentProdDate.toLocaleDateString('ar-EG', { weekday: 'long' });
    
    const newStands = stands.map(stand => stand.isActive ? { ...stand, accumulatedTons: stand.accumulatedTons + addedTons } : stand);
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
    const newArchive = [newArchiveLog, ...productionArchive];

    saveToCloud(newStands, newArchive);

    const currentShiftIndex = availableShifts.indexOf(selectedShift);
    if (currentShiftIndex === availableShifts.length - 1) {
      const nextDate = new Date(currentProdDate);
      nextDate.setDate(nextDate.getDate() + 1);
      setCurrentProdDate(nextDate);
      const nextIsFriday = nextDate.getDay() === 5;
      setSelectedShift(nextIsFriday ? 'الوردية الأولى (12 ساعة)' : 'الوردية الأولى');
      alert(`تم إقفال يوم ${dayNameStr} بنجاح!\n\nتم فتح يوم جديد تلقائياً.`);
    } else {
      setSelectedShift(availableShifts[currentShiftIndex + 1]);
    }
    setShiftBillets(''); 
  };

  const groupedArchive = productionArchive.reduce((acc, log) => {
    if (!acc[log.date]) acc[log.date] = { dayName: log.dayName, totalBillets: 0, totalTons: 0, shifts: [], timestamp: log.timestamp };
    acc[log.date].totalBillets += log.billets;
    acc[log.date].totalTons += log.tons;
    acc[log.date].shifts.push(log);
    return acc;
  }, {});

  const shiftOrder = { 'الوردية الأولى': 1, 'الوردية الأولى (12 ساعة)': 1, 'الوردية الثانية': 2, 'الوردية الثانية (12 ساعة)': 2, 'الوردية الثالثة': 3 };
  Object.keys(groupedArchive).forEach(dateKey => groupedArchive[dateKey].shifts.sort((a, b) => shiftOrder[a.shift] - shiftOrder[b.shift]));
  const sortedDates = Object.keys(groupedArchive).sort((a, b) => groupedArchive[b].timestamp - groupedArchive[a].timestamp);

  if (currentUser === 'none') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4" dir="rtl">
        <div className="bg-slate-800 p-8 rounded-xl max-w-sm w-full text-center border border-slate-700 shadow-2xl">
          <Settings2 className="w-16 h-16 mx-auto text-blue-500 mb-4" />
          <h1 className="text-3xl font-black mb-2">تتبع الدرافيل</h1>
          <p className="text-blue-400 mb-8 text-sm flex items-center justify-center gap-1 font-bold">
            <CheckCircle className="w-4 h-4" /> جاهز للعمل مع Firebase
          </p>
          {!isDataLoaded ? (
            <div className="text-slate-400 animate-pulse text-sm font-bold">جاري التحميل...</div>
          ) : (
            <div className="space-y-4">
              <button onClick={() => setCurrentUser('tech')} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 p-4 rounded-lg font-bold">
                <Edit3 className="w-5 h-5" /> الفني (إدخال)
              </button>
              <button onClick={() => setCurrentUser('manager')} className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 p-4 rounded-lg font-bold">
                <TrendingUp className="w-5 h-5" /> الإدارة (مراقبة وأرشيف)
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh bg-slate-200 text-slate-900 font-sans flex flex-col p-1 gap-1 overflow-hidden" dir="rtl">
      <nav className="bg-slate-900 text-white p-2 rounded flex flex-col gap-2 flex-none">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1">
            <Settings2 className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-sm">Roll Tracker</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-slate-800 px-2 py-0.5 rounded text-[10px] font-bold text-blue-300 flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${auth ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}></span> 
              {currentUser === 'tech' ? 'فني' : 'مدير'}
            </span>
            <button onClick={() => {setCurrentUser('none'); setActiveTab('dashboard');}} className="text-red-400 text-xs font-bold">خروج</button>
          </div>
        </div>
        <div className="flex gap-2 bg-slate-800 p-1 rounded-lg">
          <button onClick={() => setActiveTab('dashboard')} className={`flex-1 py-1.5 text-xs font-bold rounded flex justify-center items-center gap-1 ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}><TrendingUp className="w-3 h-3" /> الداشبورد</button>
          <button onClick={() => setActiveTab('analytics')} className={`flex-1 py-1.5 text-xs font-bold rounded flex justify-center items-center gap-1 ${activeTab === 'analytics' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}><BarChart3 className="w-3 h-3" /> الإحصائيات</button>
          <button onClick={() => setActiveTab('archive')} className={`flex-1 py-1.5 text-xs font-bold rounded flex justify-center items-center gap-1 ${activeTab === 'archive' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}><Archive className="w-3 h-3" /> التقويم</button>
        </div>
      </nav>

      {activeTab === 'dashboard' && (
        <div className="flex flex-col gap-1 flex-1 overflow-hidden">
          <div className="bg-white p-1.5 rounded shadow flex items-center justify-between border border-slate-300 flex-none text-xs">
            <span className="font-bold text-slate-700">مقاس المنتج الحالي:</span>
            <div className="flex gap-1">
              {['10', '12', '16', '18', '22'].map((size) => (
                <button
                  key={size}
                  onClick={() => handleProductSizeChange(size)}
                  className={`px-2.5 py-1 rounded font-bold transition-all ${selectedProductSize === size ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200'}`}
                >
                  {size} مم
                </button>
              ))}
            </div>
          </div>

          {currentUser === 'tech' && (
            <div className="bg-white p-1.5 rounded shadow flex flex-col flex-none border border-slate-300 gap-1.5">
              <div className="bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-bold px-2 py-1 rounded flex justify-between items-center">
                <span>تسجيل لـ: {currentProdDate.toLocaleDateString('ar-EG', { weekday: 'long' })} (مقاس {selectedProductSize} مم)</span>
                <span className="font-mono">{currentProdDate.toLocaleDateString('en-GB')}</span>
              </div>
              <div className="flex gap-1 items-center">
                <input type="number" value={shiftBillets} onChange={(e) => setShiftBillets(e.target.value)} className="flex-1 p-1.5 border border-slate-400 rounded font-mono text-center text-lg font-bold outline-none" placeholder="عدد البليت" />
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
            <div className="flex flex-col gap-1 flex-none">
              <div className="grid grid-cols-3 gap-1 text-center">
                 <div className="bg-green-100 p-1 border border-green-300 rounded"><p className="text-[9px] font-bold text-green-800">أقل من 80%</p><p className="font-black text-green-700">{stands.filter(s => (s.accumulatedTons / s.maxLimit) < 0.8).length}</p></div>
                 <div className="bg-yellow-100 p-1 border border-yellow-400 rounded"><p className="text-[9px] font-bold text-yellow-800">إنذار (+80%)</p><p className="font-black text-yellow-700">{stands.filter(s => (s.accumulatedTons / s.maxLimit) >= 0.8 && (s.accumulatedTons / s.maxLimit) < 1).length}</p></div>
                 <div className="bg-red-100 p-1 border border-red-500 rounded"><p className="text-[9px] font-bold text-red-800">خطر (+100%)</p><p className="font-black text-red-700">{stands.filter(s => (s.accumulatedTons / s.maxLimit) >= 1).length}</p></div>
              </div>
              <button onClick={handleResetAllStands} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-2 rounded text-xs flex justify-center items-center gap-1.5 shadow active:scale-95">
                <RefreshCw className="w-3.5 h-3.5" /> تصفير كافة الستاندات بالكامل (إدارة)
              </button>
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
                       <span className="text-[8px] font-bold opacity-70">الهدف:</span>
                       <input type="number" value={stand.maxLimit} onChange={(e) => handleLimitChange(idx, e.target.value)} className="w-12 text-[10px] text-center border border-slate-300 rounded font-mono font-bold bg-white outline-none focus:border-blue-500" />
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
          <div className="flex items-center gap-2 border-b pb-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h2 className="font-black text-sm text-slate-800">لوحة الإحصائيات وتحليل الإنتاجية</h2>
          </div>
          
          {productionArchive.length === 0 ? (
            <div className="text-center py-12 text-slate-400 flex flex-col items-center gap-2">
              <BarChart3 className="w-10 h-10 opacity-30" />
              <p className="text-sm font-bold">لا توجد بيانات كافية لعرض الرسوم البيانية حتى الآن.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-200 text-center">
                  <p className="text-[10px] font-bold text-blue-800">إجمالي إنتاج المصنع</p>
                  <p className="font-mono font-black text-xl text-blue-900">
                    {productionArchive.reduce((acc, curr) => acc + curr.tons, 0)} <span className="text-xs font-normal">طن</span>
                  </p>
                </div>
                <div className="bg-green-50 p-2.5 rounded-lg border border-green-200 text-center">
                  <p className="text-[10px] font-bold text-green-800">إجمالي عدد البليت</p>
                  <p className="font-mono font-black text-xl text-green-900">
                    {productionArchive.reduce((acc, curr) => acc + curr.billets, 0)} <span className="text-xs font-normal">بليت</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="font-bold text-xs text-slate-700">تحليل إنتاج الورديات ومقاسات المنتجات:</h3>
                <div className="flex flex-col gap-1.5">
                  {productionArchive.map((log) => {
                    const maxTons = Math.max(...productionArchive.map(l => l.tons), 1);
                    const widthPercent = Math.min((log.tons / maxTons) * 100, 100);
                    return (
                      <div key={log.id} className="bg-slate-50 p-2 rounded border border-slate-200 flex flex-col gap-1">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="text-slate-800">{log.date} ({log.shift})</span>
                          <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px]">مقاس {log.productSize || '10'} مم</span>
                        </div>
                        <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden flex">
                          <div className="bg-green-500 h-full rounded-full transition-all duration-500" style={{ width: `${widthPercent}%` }}></div>
                        </div>
                        <div className="flex justify-between text-[10px] font-mono text-slate-500">
                          <span>{log.billets} بليت</span>
                          <span className="font-bold text-green-700">{log.tons} طن</span>
                        </div>
                      </div>
                    );
                  })}
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
                  <div key={date} className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col overflow-hidden">
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
                        <span className="bg-green-500 text-white text-[9px] font-bold px-1 py-0.5 rounded shadow-sm text-center flex-1 sm:flex-none">{dayData.totalTons} <span className="font-normal opacity-90">ط</span></span>
                      </div>
                    </div>
                    <div className="p-1 flex-1 flex flex-col gap-1 bg-white">
                      {dayData.shifts.map((log) => (
                        <div key={log.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-1 bg-slate-50 hover:bg-slate-100 rounded border border-slate-100">
                          <div className="flex justify-between sm:justify-start items-center sm:flex-col sm:items-start w-full sm:w-auto">
                            <span className="font-bold text-[9px] text-slate-800">{log.shift.replace('الوردية ', '').replace(' (12 ساعة)', '')} (مقاس {log.productSize || '10'} مم)</span>
                            <span className="text-[7px] text-slate-400 font-mono">{log.time}</span>
                          </div>
                          <div className="flex justify-between items-center text-left font-mono bg-white px-1 py-0.5 rounded border border-slate-200 mt-0.5 sm:mt-0 w-full sm:w-auto">
                            <div className="text-[9px]"><span className="font-bold text-slate-700">{log.billets}</span><span className="text-[7px] text-slate-400">ب</span></div>
                            <span className="mx-1 text-[8px] text-slate-300">|</span>
                            <div className="text-[9px]"><span className="font-bold text-green-600">{log.tons}</span><span className="text-[7px] text-green-700">ط</span></div>
                          </div>
                        </div>
                      ))}
                      {dayData.shifts.length < (new Date(dayData.timestamp).getDay() === 5 ? 2 : 3) && (
                         <div className="flex-1 min-h-[25px] border border-dashed border-slate-200 rounded flex items-center justify-center m-0.5 opacity-50">
                           <span className="text-[8px] font-bold text-slate-400">قيد التشغيل...</span>
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
