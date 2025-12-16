import { useMemo } from 'react';
import type { CustomerData } from '../App';
import { Sparkles, Moon, Brain, Briefcase, Home, ArrowRight } from 'lucide-react';

interface AfterConditionScreenProps {
  customerData: CustomerData;
  updateCustomerData: (data: Partial<CustomerData>) => void;
  onNext: () => void;
  onHome?: () => void;
}

/**
 * 施術後の体感（3スライダー）
 * - 施術前(Counseling)と同じカードサイズ感に寄せる（3カード横並び）
 * - 最後の「診断へ進む」ボタンの文字が消えないようにする
 *
 * ※ CustomerData に afterSleepQuality / afterStress / afterBodyHeaviness がある想定
 *   まだ型に無い場合でも落ちないように (customerData as any) で参照しています。
 */

function clamp0to10(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n)));
}

function signed(n: number) {
  const v = Math.round(n);
  return v >= 0 ? `+${v}` : `${v}`;
}

type CardSpec = {
  key: 'afterSleepQuality' | 'afterStress' | 'afterBodyHeaviness';
  title: string;
  scaleLeft: string;
  scaleRight: string;
  icon: React.ReactNode;
  valueColorClass: string;
  iconBgClass: string;
  iconColorClass: string;
  beforeKey: 'sleepQuality' | 'stress' | 'bodyHeaviness';
};

export function AfterConditionScreen({
  customerData,
  updateCustomerData,
  onNext,
  onHome,
}: AfterConditionScreenProps) {
  const cdAny = customerData as any;

  // 施術前（Counseling）
  const beforeSleep = clamp0to10(Number(cdAny.sleepQuality ?? 5));
  const beforeStress = clamp0to10(Number(cdAny.stress ?? 5));
  const beforeHeavy = clamp0to10(Number(cdAny.bodyHeaviness ?? 5));

  // 施術後（AfterCondition）
  const afterSleep = clamp0to10(Number(cdAny.afterSleepQuality ?? 0));
  const afterStress = clamp0to10(Number(cdAny.afterStress ?? 0));
  const afterHeavy = clamp0to10(Number(cdAny.afterBodyHeaviness ?? 0));

  // 3つ揃っていれば次へ（0も入力として許容）
  const canNext =
    typeof cdAny.afterSleepQuality === 'number' &&
    typeof cdAny.afterStress === 'number' &&
    typeof cdAny.afterBodyHeaviness === 'number';

  const specs: CardSpec[] = useMemo(
    () => [
      {
        key: 'afterSleepQuality',
        beforeKey: 'sleepQuality',
        title: '睡眠の質（施術後）',
        scaleLeft: '悪い',
        scaleRight: '良い',
        icon: <Moon className="w-6 h-6" />,
        valueColorClass: 'text-blue-600',
        iconBgClass: 'bg-blue-50',
        iconColorClass: 'text-blue-600',
      },
      {
        key: 'afterStress',
        beforeKey: 'stress',
        title: 'ストレス（施術後）',
        scaleLeft: '低い',
        scaleRight: '高い',
        icon: <Brain className="w-6 h-6" />,
        valueColorClass: 'text-orange-600',
        iconBgClass: 'bg-orange-50',
        iconColorClass: 'text-orange-600',
      },
      {
        key: 'afterBodyHeaviness',
        beforeKey: 'bodyHeaviness',
        title: '頭皮・身体の重さ（施術後）',
        scaleLeft: '軽い',
        scaleRight: '重い',
        icon: <Briefcase className="w-6 h-6" />,
        valueColorClass: 'text-purple-600',
        iconBgClass: 'bg-purple-50',
        iconColorClass: 'text-purple-600',
      },
    ],
    []
  );

  const setAfterValue = (key: CardSpec['key'], value: number) => {
    updateCustomerData({ [key]: clamp0to10(value) } as any);
  };

  const getAfterValue = (key: CardSpec['key']) => {
    if (key === 'afterSleepQuality') return afterSleep;
    if (key === 'afterStress') return afterStress;
    return afterHeavy;
  };

  const getBeforeValue = (beforeKey: CardSpec['beforeKey']) => {
    if (beforeKey === 'sleepQuality') return beforeSleep;
    if (beforeKey === 'stress') return beforeStress;
    return beforeHeavy;
  };

  const deltaSleep = afterSleep - beforeSleep;
  const deltaStress = afterStress - beforeStress;
  const deltaHeavy = afterHeavy - beforeHeavy;

  return (
    <div className="h-full p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        {/* Title Card（Counselingと同じノリ） */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center gap-2 text-green-800 font-semibold">
            <Sparkles className="w-5 h-5 text-green-600" />
            施術後カウンセリング
          </div>
          <p className="text-sm text-gray-600 mt-1">施術後の体感コンディションを入力してください</p>
        </div>

        {/* ✅ 施術前と同じ「3カード横並び」 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {specs.map((s) => {
            const before = getBeforeValue(s.beforeKey);
            const after = getAfterValue(s.key);
            const delta = after - before;

            return (
              <div key={s.key} className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${s.iconBgClass} ${s.iconColorClass}`}
                  >
                    {s.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-gray-800 font-medium">{s.title}</div>
                    <div className="text-xs text-gray-500 mt-1">0: {s.scaleLeft} / 10: {s.scaleRight}</div>
                  </div>
                </div>

                <div className={`text-4xl font-semibold mt-4 ${s.valueColorClass}`}>{after}</div>

                {/* Slider */}
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={after}
                  onChange={(e) => setAfterValue(s.key, Number(e.target.value))}
                  className="w-full mt-4 accent-gray-900"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0</span>
                  <span>10</span>
                </div>

                {/* before→after & delta */}
                <div className="mt-4 bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-600">施術前 → 施術後</div>
                  <div className="text-sm text-gray-800 mt-1">
                    {before} → {after}（差分 {signed(delta)}）
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 差分まとめ（既存の意図を残す） */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mt-6">
          <div className="text-sm text-gray-800 font-semibold mb-3">施術前 → 施術後（体感差分まとめ）</div>

          <div className="space-y-3">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-600">睡眠の質</div>
              <div className="text-sm text-gray-800 mt-1">
                {beforeSleep} → {afterSleep}（{signed(deltaSleep)}）
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-600">ストレス</div>
              <div className="text-sm text-gray-800 mt-1">
                {beforeStress} → {afterStress}（{signed(deltaStress)}）
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-600">重だるさ</div>
              <div className="text-sm text-gray-800 mt-1">
                {beforeHeavy} → {afterHeavy}（{signed(deltaHeavy)}）
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-4">
            ※ここで入力した「施術後の体感」は、AIレポート生成に加味できます（save-visit / generate-report 対応時）
          </p>
        </div>

        {/* ✅ 画面下部アクション（文字が消えない配色に修正） */}
        <div className="mt-6">
          <div className="flex gap-4 items-center">
            {onHome && (
              <button
                type="button"
                onClick={onHome}
                className="px-5 py-3 rounded-xl bg-white border border-green-200 text-green-700 hover:bg-green-50 shadow-sm flex items-center gap-2"
              >
                <Home className="w-5 h-5" />
                ホームへ
              </button>
            )}

            <button
              type="button"
              onClick={onNext}
              disabled={!canNext}
              className={`flex-1 py-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 ${
                canNext
                  ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white hover:shadow-lg'
                  : 'bg-gray-200 text-gray-600 cursor-not-allowed'
              }`}
            >
              診断へ進む
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          {!canNext && (
            <p className="text-xs text-gray-400 mt-2">
              ※3項目すべて入力すると「診断へ進む」が有効になります
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
