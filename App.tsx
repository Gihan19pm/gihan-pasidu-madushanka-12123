import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, runTransaction, updateDoc, setDoc, enableNetwork, disableNetwork } from 'firebase/firestore';
import {
  Heart,
  Target,
  TrendingUp,
  Plus,
  Settings,
  History,
  Users,
  AlertCircle,
  Banknote,
  Droplets,
  Loader2,
  Lock,
  LogOut,
  Edit3,
  Cloud,
  CloudOff,
  Save,
  Wifi,
  WifiOff
} from 'lucide-react';
import { AppData, Deposit, NotificationState, ViewState, FirebaseConfig } from './types';

// --- Constants ---
const STORAGE_KEY_DATA = 'hands_for_hope_data';
const STORAGE_KEY_CONFIG = 'hands_for_hope_firebase_config';
const PIN_CODE = '2024';

// --- Components ---

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ children, className = "" }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden ${className}`}>
    {children}
  </div>
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
}

const Button: React.FC<ButtonProps> = ({ onClick, disabled, variant = 'primary', children, className = "", ...props }) => {
  const baseStyle = "px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 active:scale-95";
  
  const variants = {
    primary: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 shadow-lg",
    secondary: "bg-slate-100 hover:bg-slate-200 text-slate-700",
    outline: "border-2 border-slate-200 hover:border-emerald-500 hover:text-emerald-600 text-slate-500",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
    ghost: "bg-transparent hover:bg-slate-100 text-slate-600"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

interface ProgressBarProps {
  current: number;
  total: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ current, total }) => {
  const percentage = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
  
  return (
    <div className="relative pt-1">
      <div className="flex mb-2 items-center justify-between">
        <div>
          <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-emerald-600 bg-emerald-100">
            Progress
          </span>
        </div>
        <div className="text-right">
          <span className="text-xs font-semibold inline-block text-emerald-600">
            {percentage.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="overflow-hidden h-4 mb-4 text-xs flex rounded-full bg-slate-100 shadow-inner">
        <div
          style={{ width: `${percentage}%` }}
          className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-1000 ease-out"
        ></div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  // App State
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewState>('public'); 
  const [pin, setPin] = useState('');
  const [notification, setNotification] = useState<NotificationState | null>(null);
  const [isCloudMode, setIsCloudMode] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configInput, setConfigInput] = useState('');
  
  const [data, setData] = useState<AppData>({
    currentAmount: 0,
    goalAmount: 500000,
    donorCount: 0,
    recentDeposits: []
  });

  // Form States
  const [depositAmount, setDepositAmount] = useState('');
  const [depositorName, setDepositorName] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [manualTotal, setManualTotal] = useState('');

  // Firebase Refs
  const appRef = useRef<any>(null);
  const dbRef = useRef<any>(null);
  const authRef = useRef<any>(null);

  // --- Helpers ---
  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const getInitialData = (): AppData => ({
    currentAmount: 0,
    goalAmount: 500000,
    donorCount: 0,
    recentDeposits: []
  });

  // --- Initialization ---
  useEffect(() => {
    const init = async () => {
      // 1. Check for stored Firebase Config
      const storedConfig = localStorage.getItem(STORAGE_KEY_CONFIG);
      
      if (storedConfig) {
        try {
          const config = JSON.parse(storedConfig);
          initializeFirebase(config);
        } catch (e) {
          console.error("Invalid stored config", e);
          initLocalMode();
        }
      } else {
        initLocalMode();
      }
    };
    init();
  }, []);

  const initLocalMode = () => {
    setIsCloudMode(false);
    const localData = localStorage.getItem(STORAGE_KEY_DATA);
    if (localData) {
      setData(JSON.parse(localData));
    }
    setLoading(false);
  };

  const initializeFirebase = async (config: FirebaseConfig) => {
    try {
      // Prevent multiple initializations
      if (getApps().length > 0) {
        // If config changed, we might need to delete app, but for simplicity we assume full reload if config changes
        appRef.current = getApps()[0];
      } else {
        appRef.current = initializeApp(config);
      }
      
      authRef.current = getAuth(appRef.current);
      dbRef.current = getFirestore(appRef.current);

      await signInAnonymously(authRef.current);
      setIsCloudMode(true);
      
      // Setup Listener
      const docRef = doc(dbRef.current, 'artifacts', 'hands-for-hope', 'public', 'data');
      onSnapshot(docRef, (docSnap) => {
        setLoading(false);
        if (docSnap.exists()) {
          const newData = docSnap.data() as AppData;
          setData(newData);
          // Sync cloud data to local storage as backup
          localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(newData));
        } else {
          // If fresh database, use local data or defaults
          const initial = data.currentAmount > 0 ? data : getInitialData();
          setDoc(docRef, initial);
        }
      }, (err) => {
        console.error("Stream error", err);
        showNotification("Sync paused (Offline)", "error");
        // Fallback to local data if stream fails
        const local = localStorage.getItem(STORAGE_KEY_DATA);
        if(local) setData(JSON.parse(local));
      });

    } catch (e) {
      console.error("Firebase Connection Failed", e);
      showNotification("Cloud connection failed. Using offline mode.", "error");
      initLocalMode();
    }
  };

  // --- Handlers ---

  const handleDisconnectCloud = () => {
    if (confirm("Disconnect from cloud? The app will stop syncing with other devices.")) {
      localStorage.removeItem(STORAGE_KEY_CONFIG);
      window.location.reload(); // Hard reload to clear Firebase instances
    }
  };

  const handleSaveConfig = () => {
    try {
      // Try to parse input. Handles generic JS object or JSON
      let cleanInput = configInput.trim();
      // Remove "const firebaseConfig =" if pasted
      cleanInput = cleanInput.replace(/const\s+firebaseConfig\s*=\s*/, '');
      cleanInput = cleanInput.replace(/;$/, '');
      
      // If user pasted JS object (keys without quotes), this simple JSON.parse might fail
      // We'll try a relaxed parse or just guide them to paste JSON.
      // For robustness, let's assume valid JSON or try to fix it.
      
      // Simple fix for common JS object paste: add quotes to keys
      if (!cleanInput.startsWith('"') && !cleanInput.startsWith('{')) {
         throw new Error("Invalid format");
      }

      // Try parsing
      // If it fails, we can't easily eval() for security, so we ask user to ensure JSON.
      // However, for this specific quick-fix context:
      const config = JSON.parse(cleanInput);
      
      if (!config.apiKey) throw new Error("Missing apiKey");

      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
      setShowConfigModal(false);
      showNotification("Configuration saved! Reloading...");
      setTimeout(() => window.location.reload(), 1000);
      
    } catch (e) {
      showNotification("Invalid JSON format. Please ensure keys are quoted.", "error");
    }
  };

  // Generic Data Updater (Handles both Local and Cloud)
  const updateAppData = async (updater: (prev: AppData) => AppData) => {
    if (isCloudMode && dbRef.current) {
      const docRef = doc(dbRef.current, 'artifacts', 'hands-for-hope', 'public', 'data');
      try {
        await runTransaction(dbRef.current, async (transaction: any) => {
          const sfDoc = await transaction.get(docRef);
          if (!sfDoc.exists()) throw new Error("Doc missing");
          const currentData = sfDoc.data() as AppData;
          const newData = updater(currentData);
          transaction.update(docRef, newData);
        });
      } catch (e) {
        console.error(e);
        showNotification("Cloud update failed", "error");
      }
    } else {
      // Local Mode
      const newData = updater(data);
      setData(newData);
      localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(newData));
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === PIN_CODE) {
      setView('admin');
      setPin('');
      showNotification("Welcome back");
    } else {
      showNotification("Incorrect PIN", "error");
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositAmount || isNaN(Number(depositAmount)) || parseFloat(depositAmount) <= 0) return;

    const amount = parseFloat(depositAmount);
    
    await updateAppData((prev) => {
      const newDeposit: Deposit = {
        id: Date.now(),
        amount: amount,
        name: depositorName || 'Anonymous Donor',
        timestamp: new Date().toISOString()
      };
      let updatedDeposits = [newDeposit, ...(prev.recentDeposits || [])];
      if (updatedDeposits.length > 20) updatedDeposits = updatedDeposits.slice(0, 20);

      return {
        ...prev,
        currentAmount: (prev.currentAmount || 0) + amount,
        donorCount: (prev.donorCount || 0) + 1,
        recentDeposits: updatedDeposits
      };
    });

    setDepositAmount('');
    setDepositorName('');
    showNotification(`Added ${formatCurrency(amount)}`);
  };

  const handleUpdateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal) return;
    await updateAppData((prev) => ({ ...prev, goalAmount: parseFloat(newGoal) }));
    setNewGoal('');
    showNotification("Goal updated");
  };

  const handleManualOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTotal) return;
    await updateAppData((prev) => ({ ...prev, currentAmount: parseFloat(manualTotal) }));
    setManualTotal('');
    showNotification("Total updated");
  };

  // --- Render Loading ---
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-500">
        <Loader2 size={32} className="animate-spin text-emerald-600 mb-4" />
        <p>Loading Hands For Hope...</p>
      </div>
    );
  }

  // --- Render Notification ---
  const NotificationComponent = () => notification && (
    <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-2xl transform transition-all duration-500 ease-in-out flex items-center gap-2 ${notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-600 text-white'}`}>
      {notification.type === 'success' ? <Heart size={18} className="animate-pulse"/> : <AlertCircle size={18}/>}
      {notification.message}
    </div>
  );

  // --- Config Modal ---
  const ConfigModal = () => showConfigModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-lg p-6 animate-in fade-in zoom-in duration-200">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Cloud size={24} className="text-emerald-600" />
          Connect Cloud Database
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          Paste your <code>firebaseConfig</code> object below to sync data across multiple devices.
        </p>
        <textarea
          className="w-full h-40 p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs focus:ring-2 focus:ring-emerald-500 outline-none mb-4"
          placeholder='{ "apiKey": "AIza...", "authDomain": "..." }'
          value={configInput}
          onChange={(e) => setConfigInput(e.target.value)}
        />
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setShowConfigModal(false)}>Cancel</Button>
          <Button onClick={handleSaveConfig}>Connect & Restart</Button>
        </div>
      </Card>
    </div>
  );

  // --- View: Login ---
  if (view === 'login') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <NotificationComponent />
        <Card className="w-full max-w-md p-8 relative">
          <div className="text-center mb-6">
            <div className="bg-emerald-100 text-emerald-600 p-3 rounded-full inline-block mb-3">
              <Lock size={24} />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Admin Access</h2>
            <p className="text-sm text-slate-500">Enter PIN to manage funds</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full text-center text-2xl tracking-widest px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="••••"
              autoFocus
            />
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={() => setView('public')} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1">
                Unlock
              </Button>
            </div>
          </form>
          
          {/* Status Indicator for Login Screen */}
          <div className="absolute top-4 right-4">
            {isCloudMode ? 
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-1 rounded-full"><Wifi size={12}/> Cloud Active</span> : 
              <span className="flex items-center gap-1 text-xs text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded-full"><WifiOff size={12}/> Offline Mode</span>
            }
          </div>
        </Card>
      </div>
    );
  }

  // --- View: Admin Panel ---
  if (view === 'admin') {
    return (
      <div className="min-h-screen bg-slate-100 p-4 pb-20">
        <NotificationComponent />
        <ConfigModal />
        
        <div className="max-w-xl mx-auto space-y-6">
          {/* Admin Header */}
          <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm">
            <div className="flex items-center gap-3">
              <div className="bg-slate-800 text-white p-2 rounded-lg">
                <Settings size={20} />
              </div>
              <div>
                <h1 className="font-bold text-slate-800">Admin Dashboard</h1>
                <p className="text-xs text-slate-500">
                  {isCloudMode ? <span className="text-emerald-600 flex items-center gap-1"><Wifi size={10}/> Syncing Live</span> : "Offline Mode (Local Only)"}
                </p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setView('public')} className="!px-3">
              <LogOut size={16} />
            </Button>
          </div>

          {/* Cloud Connect Banner */}
          {!isCloudMode ? (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 text-blue-800">
                <CloudOff size={20} />
                <div className="text-sm">
                  <p className="font-bold">Device Isolated</p>
                  <p className="text-xs opacity-80">Data will not sync to other screens.</p>
                </div>
              </div>
              <Button variant="primary" onClick={() => setShowConfigModal(true)} className="bg-blue-600 hover:bg-blue-700 text-sm py-1.5 h-auto">
                Connect Cloud
              </Button>
            </div>
          ) : (
             <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs text-emerald-800 flex items-center gap-2 font-medium">
                  <Cloud size={14} /> Cloud Database Connected
                </span>
                <button onClick={handleDisconnectCloud} className="text-xs text-emerald-700 underline hover:text-emerald-900">
                  Disconnect
                </button>
             </div>
          )}

          {/* Current Status Card */}
          <Card className="p-6 bg-slate-800 text-white border-none">
            <h2 className="text-slate-400 text-sm font-bold uppercase mb-4">Current Status</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-slate-400 text-xs mb-1">Total Collected</p>
                <p className="text-2xl font-bold text-emerald-400">{formatCurrency(data.currentAmount)}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs mb-1">Target Goal</p>
                <p className="text-2xl font-bold text-blue-400">{formatCurrency(data.goalAmount)}</p>
              </div>
            </div>
          </Card>

          {/* Quick Actions */}
          <div className="grid gap-6">
            {/* 1. Add Donation */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4 text-emerald-700 font-bold border-b border-emerald-50 pb-2">
                <Plus size={18} /> Add New Donation
              </div>
              <form onSubmit={handleDeposit} className="space-y-3">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="Amount (LKR)"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <input
                  type="text"
                  value={depositorName}
                  onChange={(e) => setDepositorName(e.target.value)}
                  placeholder="Donor Name (Optional)"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <Button className="w-full">Confirm Deposit</Button>
              </form>
            </Card>

            {/* 2. Update Goal */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4 text-blue-700 font-bold border-b border-blue-50 pb-2">
                <Target size={18} /> Change Target Goal
              </div>
              <form onSubmit={handleUpdateGoal} className="flex gap-2">
                <input
                  type="number"
                  value={newGoal}
                  onChange={(e) => setNewGoal(e.target.value)}
                  placeholder="New Goal Amount"
                  className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <Button variant="secondary">Update</Button>
              </form>
            </Card>

            {/* 3. Manual Override */}
            <Card className="p-6 bg-amber-50 border-amber-100">
              <div className="flex items-center gap-2 mb-4 text-amber-700 font-bold border-b border-amber-200/50 pb-2">
                <Edit3 size={18} /> Manual Correction
              </div>
              <p className="text-xs text-amber-600/80 mb-3">
                Use this to fix errors. This sets the total directly, ignoring individual deposit history.
              </p>
              <form onSubmit={handleManualOverride} className="flex gap-2">
                <input
                  type="number"
                  value={manualTotal}
                  onChange={(e) => setManualTotal(e.target.value)}
                  placeholder="Set Exact Total (LKR)"
                  className="flex-1 px-4 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                />
                <Button className="bg-amber-500 hover:bg-amber-600 text-white shadow-none">Set</Button>
              </form>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // --- View: Public (Default) ---
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">
      <NotificationComponent />
      
      {/* Hero */}
      <div className="bg-gradient-to-br from-teal-900 via-emerald-800 to-teal-900 text-white pt-12 pb-24 px-4 sm:px-6 relative overflow-hidden shadow-lg">
        <div className="max-w-3xl mx-auto relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-700/50 border border-emerald-500/30 text-emerald-100 text-sm mb-6 backdrop-blur-sm">
            <Droplets size={14} />
            <span>Sri Lanka Weather Relief Fund</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight drop-shadow-md">
            Hands For Hope
          </h1>
          <p className="text-emerald-100 text-lg md:text-xl max-w-xl mx-auto mb-8 leading-relaxed drop-shadow-sm">
            Joining hands to support families affected by recent floods.
          </p>
          
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-xl max-w-lg mx-auto">
            <p className="text-emerald-200 text-xs font-bold uppercase tracking-widest mb-2">Total Raised So Far</p>
            <div className="text-4xl md:text-5xl font-bold text-white mb-2 tabular-nums">
              {formatCurrency(data.currentAmount)}
            </div>
            <div className="text-emerald-100 text-sm">
              Goal: {formatCurrency(data.goalAmount)}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 -mt-16 relative z-20 space-y-6">
        
        {/* Stats */}
        <Card className="p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-100 p-3 rounded-full text-emerald-600">
              <TrendingUp size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Campaign Progress</h2>
              <p className="text-sm text-slate-500">Live Updates {isCloudMode && <span className="text-emerald-500 text-xs font-bold px-1.5 py-0.5 bg-emerald-50 rounded ml-1">LIVE</span>}</p>
            </div>
          </div>
          
          <ProgressBar current={data.currentAmount} total={data.goalAmount} />
          
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Users size={16} />
                <span className="text-xs font-bold uppercase">Donors</span>
              </div>
              <p className="text-2xl font-bold text-slate-700">{data.donorCount}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Target size={16} />
                <span className="text-xs font-bold uppercase">Reached</span>
              </div>
              <p className="text-2xl font-bold text-slate-700">
                {data.goalAmount > 0 ? (data.currentAmount / data.goalAmount * 100).toFixed(0) : 0}%
              </p>
            </div>
          </div>
        </Card>

        {/* Recent List */}
        <Card className="p-0">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <History size={18} className="text-slate-400" />
              Recent Donations
            </h3>
          </div>
          
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {(!data.recentDeposits || data.recentDeposits.length === 0) ? (
              <div className="p-8 text-center text-slate-400 italic">
                No deposits yet.
              </div>
            ) : (
              data.recentDeposits.map((deposit, idx) => (
                <div key={deposit.id || idx} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-50 text-emerald-600 p-2 rounded-full">
                      <Banknote size={16} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-700 text-sm">{deposit.name}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(deposit.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className="font-bold text-emerald-600 text-sm">
                    +{formatCurrency(deposit.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Footer / Login Link */}
      <footer className="text-center mt-12 mb-6 px-6">
        <p className="text-slate-400 text-sm">© {new Date().getFullYear()} Hands For Hope.</p>
        <button
          onClick={() => setView('login')}
          className="mt-4 text-xs text-slate-300 hover:text-slate-500 transition-colors flex items-center gap-1 mx-auto"
        >
          <Lock size={12} /> Staff Login
        </button>
      </footer>
    </div>
  );
}