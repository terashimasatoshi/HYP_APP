import { useState, useEffect } from 'react';
import { CustomerData } from '../App';
import { Activity, TrendingUp, UserPlus, Search } from 'lucide-react';
import { CustomerPicker } from './CustomerPicker';

interface HomeScreenProps {
  customerData: CustomerData;
  updateCustomerData: (data: Partial<CustomerData>) => void;
  /** App側からホーム画面を開いた時の初期表示（既存検索 or 新規登録） */
  initialMode?: 'search' | 'new';
  /** App側からの「ホームに戻る」等でローカル状態を初期化するトリガー */
  resetCounter?: number;
  onStart: () => void;
}

type Customer = {
  id: string;
  full_name: string;
  phone?: string;
  email?: string;
  gender?: string;
  birthdate?: string;
};

type PreviousVisit = {
  date: string;
  after?: { rmssd?: number; sdnn?: number };
};

export function HomeScreen({
  customerData,
  updateCustomerData,
  initialMode = 'search',
  resetCounter = 0,
  onStart,
}: HomeScreenProps) {
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [previousVisit, setPreviousVisit] = useState<PreviousVisit | null>(null);
  const [loading, setLoading] = useState(false);

  // 新規登録用
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    age: '',
    gender: '',
    phone: '',
  });

  // ✅ 登録中フラグ（二重登録防止）
  const [isRegisteringCustomer, setIsRegisteringCustomer] = useState(false);

  // App側から「新規顧客登録でホームを開く」などの指示があった場合
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // App側からのリセット指示（ホームに戻る等）でローカル状態を初期化
  useEffect(() => {
    setSelectedCustomer(null);
    setPreviousVisit(null);
    setLoading(false);
    setNewCustomer({ name: '', age: '', gender: '', phone: '' });
    setIsRegisteringCustomer(false);
  }, [resetCounter]);

  // 戻るボタンなどでホームに戻った場合、App側のcustomerDataに合わせて選択状態を復元
  useEffect(() => {
    if (customerData.customerId && customerData.name) {
      setSelectedCustomer(prev => {
        if (prev?.id === customerData.customerId) return prev;
        return {
          id: customerData.customerId,
          full_name: customerData.name,
        };
      });
    } else {
      // App側で顧客がクリアされた場合は選択状態もクリア
      setSelectedCustomer(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerData.customerId, customerData.name]);

  const menus = [
    '森の深眠60分コース',
    '森の深眠90分コース',
    '森の深眠90分コース|extra|',
    '森の炭酸60分コース',
    '炭酸アーユル90',
    'ディープスリープ60',
    'ディープスリープ90',
    'ディープスリープ120',
    'フュージョン120',
  ];

  const visitCounts = [
    { value: 'first' as const, label: '初回' },
    { value: 'second' as const, label: '2回目' },
    { value: 'third-plus' as const, label: '3回以上' },
  ];

  // 顧客選択時に前回データを取得
  useEffect(() => {
    if (selectedCustomer) {
      setLoading(true);
      const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
      fetch(`${API_BASE}/api/last-two-visits?customer_id=${selectedCustomer.id}`)
        .then(r => r.json())
        .then(data => {
          if (data.previous) {
            setPreviousVisit(data.previous);
          } else {
            setPreviousVisit(null);
          }
        })
        .catch(err => console.error('Failed to load previous visit:', err))
        .finally(() => setLoading(false));
    }
  }, [selectedCustomer]);

  const handleCustomerSelect = (customer: Customer | null) => {
    setSelectedCustomer(customer);
    if (customer) {
      updateCustomerData({
        name: customer.full_name,
        customerId: customer.id,
      });
    }
  };

  // ✅ 登録処理（確認ダイアログ＋二重送信防止）
  const handleNewCustomerSubmit = async () => {
    if (isRegisteringCustomer) return;

    if (!newCustomer.name.trim()) {
      alert('お名前を入力してください');
      return;
    }

    const ok = confirm(
      `この内容で顧客を登録しますか？\n\n` +
        `名前: ${newCustomer.name}\n` +
        `年齢: ${newCustomer.age || '-'}\n` +
        `性別: ${newCustomer.gender || '-'}\n` +
        `電話番号: ${newCustomer.phone || '-'}`
    );
    if (!ok) return;

    setIsRegisteringCustomer(true);

    const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
    try {
      const response = await fetch(`${API_BASE}/api/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: newCustomer.name,
          phone: newCustomer.phone || null,
          gender: newCustomer.gender || null,
          birthdate: newCustomer.age
            ? new Date(new Date().getFullYear() - parseInt(newCustomer.age), 0, 1)
                .toISOString()
                .split('T')[0]
            : null,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const customer: Customer = {
        id: data.id,
        full_name: newCustomer.name,
        phone: newCustomer.phone,
        gender: newCustomer.gender,
      };

      setSelectedCustomer(customer);
      updateCustomerData({
        name: customer.full_name,
        customerId: customer.id,
      });

      // フォームをリセットして検索モードへ（登録後の事故を減らす）
      setNewCustomer({ name: '', age: '', gender: '', phone: '' });
      setMode('search');
    } catch (error) {
      console.error('Failed to create customer:', error);
      alert('顧客登録に失敗しました');
    } finally {
      setIsRegisteringCustomer(false);
    }
  };

  const canStart = selectedCustomer && customerData.menu;

  return (
    <div className="h-full p-8">
      <div className="max-w-7xl mx-auto h-full flex gap-6">
        {/* Left: Input Area (2/3) */}
        <div
          className="flex-[2] bg-white rounded-2xl shadow-lg p-8 overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 100px)' }}
        >
          <h2 className="text-green-800 mb-6 flex items-center gap-2">
            <Activity className="w-6 h-6" />
            お客様情報
          </h2>

          {/* Mode Toggle */}
          <div className="mb-6 flex gap-2">
            <button
              type="button"
              onClick={() => setMode('search')}
              className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-all ${
                mode === 'search'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Search className="w-4 h-4" />
              既存顧客検索
            </button>
            <button
              type="button"
              onClick={() => setMode('new')}
              className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-all ${
                mode === 'new'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              新規顧客登録
            </button>
          </div>

          {/* Customer Search */}
          {mode === 'search' && (
            <div className="mb-6">
              <CustomerPicker value={selectedCustomer} onChange={handleCustomerSelect} />
              {selectedCustomer && (
                <div className="mt-4 p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-800">✓ {selectedCustomer.full_name} 様を選択中</p>
                  {selectedCustomer.phone && (
                    <p className="text-xs text-gray-600 mt-1">TEL: {selectedCustomer.phone}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* New Customer Form */}
          {mode === 'new' && (
            <div className="mb-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">お名前 *</label>
                <input
                  type="text"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  placeholder="山田太郎"
                  className="w-full px-4 py-3 border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">年齢</label>
                  <input
                    type="number"
                    value={newCustomer.age}
                    onChange={(e) => setNewCustomer({ ...newCustomer, age: e.target.value })}
                    placeholder="30"
                    className="w-full px-4 py-3 border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-300"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">性別</label>
                  <select
                    value={newCustomer.gender}
                    onChange={(e) => setNewCustomer({ ...newCustomer, gender: e.target.value })}
                    className="w-full px-4 py-3 border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-300"
                  >
                    <option value="">選択してください</option>
                    <option value="male">男性</option>
                    <option value="female">女性</option>
                    <option value="other">その他</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">電話番号（顧客番号）</label>
                <input
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  placeholder="090-1234-5678"
                  className="w-full px-4 py-3 border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-300"
                />
              </div>

              {/* ✅ ここが要望の「電話番号の下に顧客登録ボタン」 */}
              {/* 有効になっても “消えない” 配色（白背景＋緑文字＋緑枠）に変更 */}
              <button
                type="button"
                onClick={handleNewCustomerSubmit}
                disabled={isRegisteringCustomer || !newCustomer.name.trim()}
                className={`w-full py-3 rounded-xl transition-all border-2 shadow-sm ${
                  isRegisteringCustomer || !newCustomer.name.trim()
                    ? 'bg-gray-200 text-gray-500 border-gray-200 cursor-not-allowed'
                    : 'bg-white text-green-700 border-green-500 hover:bg-green-50'
                }`}
              >
                {isRegisteringCustomer ? '登録中...' : '顧客を登録'}
              </button>

              <p className="text-xs text-gray-500">
                ※入力ミス防止のため、登録時に確認ダイアログが表示されます
              </p>
            </div>
          )}

          {/* Visit Count Badge */}
          <div className="mb-8">
            <label className="block text-sm text-gray-700 mb-2">来店回数</label>
            <div className="flex gap-3">
              {visitCounts.map((vc) => (
                <button
                  type="button"
                  key={vc.value}
                  onClick={() => updateCustomerData({ visitCount: vc.value })}
                  className={`px-6 py-2 rounded-full transition-all ${
                    customerData.visitCount === vc.value
                      ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {vc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Menu Selection */}
          <div>
            <label className="block text-sm text-gray-700 mb-3">メニュー選択</label>
            <div className="grid grid-cols-3 gap-3">
              {menus.map((menu) => (
                <button
                  type="button"
                  key={menu}
                  onClick={() => updateCustomerData({ menu })}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    customerData.menu === menu
                      ? 'border-green-400 bg-green-50 shadow-md'
                      : 'border-gray-200 bg-white hover:border-green-200 hover:bg-green-50/50'
                  }`}
                >
                  <div
                    className={`text-sm ${
                      customerData.menu === menu ? 'text-green-800' : 'text-gray-700'
                    }`}
                  >
                    {menu}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Action Area (1/3) */}
        <div className="flex-1 flex flex-col gap-6">
          {/* Previous Score Card */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-sm text-gray-600 mb-4">前回のスコア</h3>
            {loading ? (
              <div className="text-center py-8 text-gray-400">読み込み中...</div>
            ) : !selectedCustomer ? (
              <div className="text-center py-8 text-gray-400">お客様を選択してください</div>
            ) : !previousVisit ? (
              <div className="text-center py-8 text-gray-400">初回のご来店です</div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">RMSSD (After)</span>
                  <span className="text-green-600 font-semibold">
                    {previousVisit.after?.rmssd || '-'} ms
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">SDNN (After)</span>
                  <span className="text-green-600 font-semibold">
                    {previousVisit.after?.sdnn || '-'} ms
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">前回来店</span>
                  <span className="text-sm text-gray-500">
                    {new Date(previousVisit.date).toLocaleDateString('ja-JP')}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Start Button */}
          <div className="bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl shadow-lg p-8 flex-1 flex flex-col items-center justify-center">
            <TrendingUp className="w-16 h-16 text-white mb-4" />
            <p className="text-white/90 text-sm mb-6 text-center">
              お客様情報を入力して
              <br />
              計測を開始してください
            </p>
            <button
              type="button"
              onClick={onStart}
              disabled={!canStart}
              className={`w-full py-4 rounded-xl transition-all ${
                canStart
                  ? 'bg-white text-green-700 hover:bg-green-50 shadow-md hover:shadow-lg'
                  : 'bg-white/50 text-green-300 cursor-not-allowed'
              }`}
            >
              HRV計測をはじめる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
