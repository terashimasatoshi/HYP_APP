import { CustomerData } from '../App';
import { CheckCircle2, Home, ArrowRight, Sparkles } from 'lucide-react';

interface AfterConditionScreenProps {
  customerData: CustomerData;
  updateCustomerData: (data: Partial<CustomerData>) => void;
  onNext: () => void;
  onHome: () => void;
}

function diffLabel(after: number, before: number) {
  const d = after - before;
  if (d === 0) return '±0';
  return d > 0 ? `+${d}` : `${d}`;
}

function clamp0to10(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, n));
}

export function AfterConditionScreen({
  customerData,
  updateCustomerData,
  onNext,
  onHome,
}: AfterConditionScreenProps) {
  const afterSleep = clamp0to10(customerData.afterSleepQuality);
  const afterStress = clamp0to10(customerData.afterStress);
  const afterHeavy = clamp0to10(customerData.afterBodyHeaviness);

  const beforeSleep = clamp0to10(customerData.sleepQuality);
  const beforeStress = clamp0to10(customerData.stress);
  const beforeHeavy = clamp0to10(customerData.bodyHeaviness);

  return (
    <div className="h-full p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        {/* Title */}
        <div className="mb-6">
          <h2 className="text-green-800 mb-2 flex items-center gap-2">
            <CheckCircle2 className="w-7 h-7 text-green-600" />
            施術後の体感コンディション
          </h2>
          <p className="text-sm text-gray-600">
            施術前の体感と比較して、施術後の状態を記録します（AIレポートの精度が上がります）
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Sleep */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm text-gray-700 font-semibold">睡眠の質（施術後）</h3>
            </div>

            <div className="flex items-end justify-between mb-3">
              <div className="text-4xl font-semibold text-blue-600">{afterSleep}</div>
              <div className="text-xs text-gray-500 text-right">
                施術前 {beforeSleep} → 施術後 {afterSleep}
                <div className="mt-1">差分 {diffLabel(afterSleep, beforeSleep)}</div>
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={10}
              value={afterSleep}
              onChange={(e) =>
                updateCustomerData({ afterSleepQuality: parseInt(e.target.value, 10) })
              }
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>悪い</span>
              <span>良い</span>
            </div>
          </div>

          {/* Stress */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-orange-600" />
              <h3 className="text-sm text-gray-700 font-semibold">ストレス（施術後）</h3>
            </div>

            <div className="flex items-end justify-between mb-3">
              <div className="text-4xl font-semibold text-orange-600">{afterStress}</div>
              <div className="text-xs text-gray-500 text-right">
                施術前 {beforeStress} → 施術後 {afterStress}
                <div className="mt-1">差分 {diffLabel(afterStress, beforeStress)}</div>
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={10}
              value={afterStress}
              onChange={(e) => updateCustomerData({ afterStress: parseInt(e.target.value, 10) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>低い</span>
              <span>高い</span>
            </div>
          </div>

          {/* Heaviness */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              <h3 className="text-sm text-gray-700 font-semibold">頭皮・身体の重さ（施術後）</h3>
            </div>

            <div className="flex items-end justify-between mb-3">
              <div className="text-4xl font-semibold text-purple-600">{afterHeavy}</div>
              <div className="text-xs text-gray-500 text-right">
                施術前 {beforeHeavy} → 施術後 {afterHeavy}
                <div className="mt-1">差分 {diffLabel(afterHeavy, beforeHeavy)}</div>
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={10}
              value={afterHeavy}
              onChange={(e) =>
                updateCustomerData({ afterBodyHeaviness: parseInt(e.target.value, 10) })
              }
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span>軽い</span>
              <span>重い</span>
            </div>
          </div>
        </div>

        {/* Summary box */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h4 className="text-sm text-gray-700 font-semibold mb-3">施術前 → 施術後（体感差分まとめ）</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">睡眠の質</div>
              <div className="text-sm text-gray-700">
                {beforeSleep} → {afterSleep}（{diffLabel(afterSleep, beforeSleep)}）
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">ストレス</div>
              <div className="text-sm text-gray-700">
                {beforeStress} → {afterStress}（{diffLabel(afterStress, beforeStress)}）
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">重だるさ</div>
              <div className="text-sm text-gray-700">
                {beforeHeavy} → {afterHeavy}（{diffLabel(afterHeavy, beforeHeavy)}）
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-4">
            ※ここで入力した「施術後の体感」は、AIレポート生成に加味できます（次のステップで save-visit / generate-report を対応します）
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onHome}
            className="px-6 py-3 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all flex items-center gap-2"
          >
            <Home className="w-5 h-5" />
            ホームへ
          </button>

          <button
            type="button"
            onClick={onNext}
            className="flex-1 py-3 rounded-xl bg-green-500 text-white hover:bg-green-600 transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
          >
            診断へ進む
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
