import { useState } from 'react';
import { Header } from './components/Header';
import { HomeScreen } from './components/HomeScreen';
import { HRVMeasurementScreen } from './components/HRVMeasurementScreen';
import { CounselingScreen } from './components/CounselingScreen';
import { AIReportScreen } from './components/AIReportScreen';

export type Screen = 'home' | 'hrv-before' | 'counseling' | 'hrv-after' | 'report';

export interface CustomerData {
  name: string;
  customerId?: string;
  visitCount: 'first' | 'second' | 'third-plus';
  menu: string;
  staff: string;
  beforeRMSSD: number;
  beforeSDNN: number;
  beforeHeartRate: number;
  afterRMSSD: number;
  afterSDNN: number;
  afterHeartRate: number;
  sleepQuality: number;
  stress: number;
  bodyHeaviness: number;
  bedtime: string;
  alcohol: boolean;
  caffeine: boolean;
  exercise: boolean;
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  // 画面遷移の「戻る」を実現するための履歴
  const [screenHistory, setScreenHistory] = useState<Screen[]>([]);

  // ホーム画面の初期表示モード（既存検索 or 新規登録）
  const [homeMode, setHomeMode] = useState<'search' | 'new'>('search');

  // ホーム画面内のローカル状態（選択中顧客など）をリセットするためのトークン
  const [homeResetCounter, setHomeResetCounter] = useState(0);
  const [customerData, setCustomerData] = useState<CustomerData>({
    name: '',
    customerId: undefined,
    visitCount: 'first',
    menu: '',
    staff: '山崎',
    beforeRMSSD: 0,
    beforeSDNN: 0,
    beforeHeartRate: 0,
    afterRMSSD: 0,
    afterSDNN: 0,
    afterHeartRate: 0,
    sleepQuality: 5,
    stress: 5,
    bodyHeaviness: 5,
    bedtime: '23:00',
    alcohol: false,
    caffeine: false,
    exercise: false,
  });

  const updateCustomerData = (data: Partial<CustomerData>) => {
    setCustomerData(prev => ({ ...prev, ...data }));
  };

  const resetCustomerData = (nextHomeMode: 'search' | 'new' = 'search') => {
    setHomeMode(nextHomeMode);
    setCustomerData({
      name: '',
      customerId: undefined,
      visitCount: 'first',
      menu: '',
      staff: customerData.staff,
      beforeRMSSD: 0,
      beforeSDNN: 0,
      beforeHeartRate: 0,
      afterRMSSD: 0,
      afterSDNN: 0,
      afterHeartRate: 0,
      sleepQuality: 5,
      stress: 5,
      bodyHeaviness: 5,
      bedtime: '23:00',
      alcohol: false,
      caffeine: false,
      exercise: false,
    });
  };

  const navigate = (next: Screen) => {
    setScreenHistory(prev => [...prev, currentScreen]);
    setCurrentScreen(next);
  };

  const goBack = () => {
    setScreenHistory(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setCurrentScreen(last);
      return prev.slice(0, -1);
    });
  };

  const goHome = (mode: 'search' | 'new' = 'search', options?: { confirm?: boolean }) => {
    const shouldConfirm = options?.confirm ?? (currentScreen !== 'home' && currentScreen !== 'report');
    if (shouldConfirm) {
      const ok = window.confirm('入力中のデータを破棄してホームに戻りますか？');
      if (!ok) return;
    }

    // レポートの簡易キャッシュをクリア（別セッションへの誤適用防止）
    try {
      sessionStorage.removeItem('hyp:reportCache:v1');
    } catch {
      // 何もしない
    }

    resetCustomerData(mode);
    setCurrentScreen('home');
    setScreenHistory([]);
    setHomeResetCounter(c => c + 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-emerald-50">
      <Header 
        staff={customerData.staff} 
        onStaffChange={(staff) => updateCustomerData({ staff })}
        showBack={currentScreen !== 'home' && screenHistory.length > 0}
        onBack={goBack}
        showHome={currentScreen !== 'home'}
        onHome={() => goHome('search')}
        showNewCustomer={true}
        onNewCustomer={() => goHome('new', { confirm: currentScreen !== 'home' && currentScreen !== 'report' })}
      />
      
      <main className="h-[calc(100vh-80px)]">
        {currentScreen === 'home' && (
          <HomeScreen 
            customerData={customerData}
            updateCustomerData={updateCustomerData}
            initialMode={homeMode}
            resetCounter={homeResetCounter}
            onStart={() => navigate('hrv-before')}
          />
        )}
        
        {currentScreen === 'hrv-before' && (
          <HRVMeasurementScreen 
            type="before"
            customerData={customerData}
            updateCustomerData={updateCustomerData}
            onNext={() => navigate('counseling')}
          />
        )}
        
        {currentScreen === 'counseling' && (
          <CounselingScreen 
            customerData={customerData}
            updateCustomerData={updateCustomerData}
            onNext={() => navigate('hrv-after')}
          />
        )}
        
        {currentScreen === 'hrv-after' && (
          <HRVMeasurementScreen 
            type="after"
            customerData={customerData}
            updateCustomerData={updateCustomerData}
            onNext={() => navigate('report')}
          />
        )}
        
        {currentScreen === 'report' && (
          <AIReportScreen 
            customerData={customerData}
            onHome={() => goHome('search', { confirm: false })}
            onNewCustomer={() => goHome('new', { confirm: false })}
          />
        )}
      </main>
    </div>
  );
}