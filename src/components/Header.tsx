import { ArrowLeft, Home, Leaf, UserPlus } from 'lucide-react';

interface HeaderProps {
  staff: string;
  onStaffChange: (staff: string) => void;

  // ナビゲーション（任意）
  showBack?: boolean;
  onBack?: () => void;
  showHome?: boolean;
  onHome?: () => void;
  showNewCustomer?: boolean;
  onNewCustomer?: () => void;
}

export function Header({
  staff,
  onStaffChange,
  showBack,
  onBack,
  showHome,
  onHome,
  showNewCustomer,
  onNewCustomer,
}: HeaderProps) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('ja-JP', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    weekday: 'short'
  });
  const timeStr = now.toLocaleTimeString('ja-JP', { 
    hour: '2-digit', 
    minute: '2-digit'
  });

  const staffList = ['山崎', '小西', '吉竹', 'その他'];

  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-green-100 h-20 flex items-center justify-between px-8 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center shadow-md">
          <Leaf className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-green-800">HRVアフターカウンセリング</h1>

        {(showBack || showHome) && (
          <div className="flex items-center gap-2 ml-4">
            {showBack && onBack && (
              <button
                onClick={onBack}
                className="px-3 py-2 bg-white border border-green-200 rounded-lg text-green-800 hover:bg-green-50 transition-all flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                戻る
              </button>
            )}
            {showHome && onHome && (
              <button
                onClick={onHome}
                className="px-3 py-2 bg-white border border-green-200 rounded-lg text-green-800 hover:bg-green-50 transition-all flex items-center gap-2"
              >
                <Home className="w-4 h-4" />
                ホーム
              </button>
            )}
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-6">
        {showNewCustomer && onNewCustomer && (
          <button
            onClick={onNewCustomer}
            className="px-4 py-2 bg-gradient-to-r from-green-400 to-emerald-500 text-white rounded-lg shadow-sm hover:shadow-md transition-all flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            新規顧客登録
          </button>
        )}

        <div className="text-right">
          <div className="text-sm text-gray-600">{dateStr}</div>
          <div className="text-green-700">{timeStr}</div>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">担当者：</span>
          <select 
            value={staff}
            onChange={(e) => onStaffChange(e.target.value)}
            className="px-4 py-2 bg-white border border-green-200 rounded-lg text-green-800 focus:outline-none focus:ring-2 focus:ring-green-300 cursor-pointer"
          >
            {staffList.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}