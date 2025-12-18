import { useState } from 'react';
import { Header } from './components/Header';
import { HomeScreen } from './components/HomeScreen';
import { HRVMeasurementScreen } from './components/HRVMeasurementScreen';
import { CounselingScreen } from './components/CounselingScreen';
import { AIReportScreen } from './components/AIReportScreen';
import { AfterConditionScreen } from './components/AfterConditionScreen';
import { CustomerReportView } from './components/CustomerReportView';
import { LoginScreen } from './components/LoginScreen';

export type Screen =
  | 'home'
  | 'hrv-before'
  | 'counseling'
  | 'hrv-after'
  | 'after-condition'
  | 'report';

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

  afterSleepQuality: number;
  afterStress: number;
  afterBodyHeaviness: number;

  bedtime: string;
  alcohol: boolean;
  caffeine: boolean;
  exercise: boolean;
}

// ✅ 共有モードのvisitIdを取得（コンポーネント外で即座に判定）
function getShareVisitId(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('share');
}

// ✅ メインアプリ（スタッフ用）を別コンポーネントに分離
function MainApp() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [screenHistory, setScreenHistory] = useState<Screen[]>([]);
  const [homeMode, setHomeMode] = useState<'search' | 'new'>('search');
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

    afterSleepQuality: 5,
    afterStress: 5,
    afterBodyHeaviness: 5,

    bedtime: '23:00',
    alcohol: false,
    caffeine: false,
    exercise: false,
  });

  const updateCustomerData = (data: Partial<CustomerData>) => {
    setCustomerData((prev) => ({ ...prev, ...data }));
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

      afterSleepQuality: 5,
      afterStress: 5,
      afterBodyHeaviness: 5,

      bedtime: '23:00',
      alcohol: false,
      caffeine: false,
      exercise: false,
    });
  };

  const navigate = (next: Screen) => {
    setScreenHistory((prev) => [...prev, currentScreen]);
    setCurrentScreen(next);
  };

  const goBack = () => {
    setScreenHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setCurrentScreen(last);
      return prev.slice(0, -1);
    });
  };

  const goHome = (mode: 'search' | 'new' = 'search', options?: { confirm?: boolean }) => {
    const shouldConfirm =
      options?.confirm ?? (currentScreen !== 'home' && currentScreen !== 'report');

    if (shouldConfirm) {
      const ok = window.confirm('入力中のデータを破棄してホームに戻りますか？');
      if (!ok) return;
    }

    try {
      sessionStorage.removeItem('hyp:reportCache:v1');
    } catch {
      // 何もしない
    }

    resetCustomerData(mode);
    setCurrentScreen('home');
    setScreenHistory([]);
    setHomeResetCounter((c) => c + 1);
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
        onNewCustomer={() =>
          goHome('new', { confirm: currentScreen !== 'home' && currentScreen !== 'report' })
        }
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
            onNext={() => navigate('after-condition')}
          />
        )}

        {currentScreen === 'after-condition' && (
          <AfterConditionScreen
            customerData={customerData}
            updateCustomerData={updateCustomerData}
            onNext={() => navigate('report')}
            onHome={() => goHome('search')}
          />
        )}

        {currentScreen === 'report' && (
          <AIReportScreen
            customerData={customerData}
            onHome={() => goHome('search', { confirm: false })}
          />
        )}
      </main>
    </div>
  );
}

// ✅ 認証状態を確認
function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem('hyp:authenticated') === 'true';
}

// ✅ デフォルトエクスポート - 共有モードかどうかで分岐
export default function App() {
  const [authenticated, setAuthenticated] = useState(isAuthenticated);
  const shareVisitId = getShareVisitId();
  
  // 共有モードならお客様用ページを表示（ログイン不要）
  if (shareVisitId) {
    return <CustomerReportView visitId={shareVisitId} />;
  }
  
  // 未認証ならログイン画面を表示
  if (!authenticated) {
    return <LoginScreen onLogin={() => setAuthenticated(true)} />;
  }
  
  // 認証済みならメインアプリを表示
  return <MainApp />;
}
