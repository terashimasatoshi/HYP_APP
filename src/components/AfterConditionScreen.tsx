

// src/components/AfterConditionScreen.tsx
import { useEffect } from 'react';
import { CustomerData } from '../App';
import { Moon, Brain, Weight, Home, ArrowRight } from 'lucide-react';
import { Slider } from './ui/slider';

interface AfterConditionScreenProps {
  customerData: CustomerData;
  updateCustomerData: (data: Partial<CustomerData>) => void;
  onNext: () => void;
  onHome?: () => void; // 画面内の「ホームへ」ボタンを出したい場合に渡す（HeaderのHomeだけでOKなら省略可）
}

type CustomerDataWithAfter = CustomerData & {
  afterSleepQuality?: number;
  afterStress?: number;
  afterBodyHeaviness?: number;
};

function clamp0to10(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(10, v));
}

function fmtDiff(d: number) {
  const sign = d >= 0 ? '+' : '';
  return `${sign}${d}`;
}

function DiffBadge({ before, after }: { before: number; after: number }) {
  const d = after - before;
  return (
    <div className="mt-2 bg-gray-50 rounded-xl p-2 text-xs text-gray-600">
      <div className="font-medium">施術前 → 施術後</div>
      <div className="mt-1">
        {before} → {after}（差分 {fmtDiff(d)}）
      </div>
    </div>
  );
}

type ScoreCardProps = {
  icon: React.ReactNode;
  iconBgClassName: string;
  title: string;
  subtitle: string;
  value: number;
  onChange: (n: number) => void;
  beforeValue: number;
  valueClassName: string;
};

function ScoreCard({
  icon,
  iconBgClassName,
  title,
  subtitle,
  value,
  onChange,
  beforeValue,
  valueClassName,
}: ScoreCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconBgClassName}`}>
          {icon}
        </div>
        <div>
          <h3 className="text-gray-800">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      
      <div className="mb-4">
        <div className={`text-4xl text-center mb-4 ${valueClassName}`}>
          {value}
        </div>
        <Slider
          value={[value]}
          onValueChange={([v]) => onChange(v)}
          min={0}
          max={10}
          step={1}
          className="mb-2"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>0</span>
          <span>5</span>
          <span>10</span>
        </div>
      </div>

      <DiffBadge before={beforeValue} after={value} />
    </div>
  );
}

export function AfterConditionScreen({
  customerData,
  updateCustomerData,
  onNext,
  onHome,
}: AfterConditionScreenProps) {
  const cd = customerData as CustomerDataWithAfter;

  const beforeSleep = clamp0to10(customerData.sleepQuality);
  const beforeStress = clamp0to10(customerData.stress);
  const beforeHeavy = clamp0to10(customerData.bodyHeaviness);

  const afterSleep = clamp0to10(cd.afterSleepQuality ?? beforeSleep);
  const afterStress = clamp0to10(cd.afterStress ?? beforeStress);
  const afterHeavy = clamp0to10(cd.afterBodyHeaviness ?? beforeHeavy);

  // 初期値が未設定の場合、施術前の値で埋める（差分0からスタート）
  useEffect(() => {
    const patch: any = {};
    if (cd.afterSleepQuality == null) patch.afterSleepQuality = beforeSleep;
    if (cd.afterStress == null) patch.afterStress = beforeStress;
    if (cd.afterBodyHeaviness == null) patch.afterBodyHeaviness = beforeHeavy;

    if (Object.keys(patch).length > 0) {
      updateCustomerData(patch as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cd.afterSleepQuality, cd.afterStress, cd.afterBodyHeaviness, beforeSleep, beforeStress, beforeHeavy]);

  const canNext = true;

  return (
    <div className="h-full p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto pb-28">
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <h2 className="text-green-800 font-semibold mb-2">施術後の体感チェック</h2>
          <p className="text-sm text-gray-600">施術後のコンディションを入力してください（0〜10）</p>
        </div>

        {/* ✅ ここを「縦並び」→「横並び（PCは3列）」に */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          <ScoreCard
            icon={<Moon className="w-6 h-6 text-blue-600" />}
            iconBgClassName="bg-blue-100"
            title="睡眠の質（施術後）"
            subtitle="0: 悪い / 10: 良い"
            value={afterSleep}
            beforeValue={beforeSleep}
            valueClassName="text-blue-600"
            onChange={(n) => updateCustomerData({ afterSleepQuality: n } as any)}
          />

          <ScoreCard
            icon={<Brain className="w-6 h-6 text-orange-600" />}
            iconBgClassName="bg-orange-100"
            title="ストレス（施術後）"
            subtitle="0: 低い / 10: 高い"
            value={afterStress}
            beforeValue={beforeStress}
            valueClassName="text-orange-600"
            onChange={(n) => updateCustomerData({ afterStress: n } as any)}
          />

          <ScoreCard
            icon={<Weight className="w-6 h-6 text-purple-600" />}
            iconBgClassName="bg-purple-100"
            title="頭皮・身体の重さ（施術後）"
            subtitle="0: 軽い / 10: 重い"
            value={afterHeavy}
            beforeValue={beforeHeavy}
            valueClassName="text-purple-600"
            onChange={(n) => updateCustomerData({ afterBodyHeaviness: n } as any)}
          />
        </div>

        {/* 差分まとめ */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-sm text-gray-800 font-medium mb-4">施術前 → 施術後（体感差分まとめ）</h3>

          <div className="space-y-3">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">睡眠の質</div>
              <div className="text-sm text-gray-800">
                {beforeSleep} → {afterSleep}（{fmtDiff(afterSleep - beforeSleep)}）
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">ストレス</div>
              <div className="text-sm text-gray-800">
                {beforeStress} → {afterStress}（{fmtDiff(afterStress - beforeStress)}）
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">重だるさ</div>
              <div className="text-sm text-gray-800">
                {beforeHeavy} → {afterHeavy}（{fmtDiff(afterHeavy - beforeHeavy)}）
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            ※ここで入力した「施術後の体感」は、AIレポート生成に加味されます
          </p>
        </div>

        {/* 下部ボタン */}
        <div className="sticky bottom-0 mt-6">
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg border border-green-100 p-4 flex items-center gap-4">
            {onHome && (
              <button
                type="button"
                onClick={onHome}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                <Home className="w-5 h-5" />
                ホームへ
              </button>
            )}

            <button
              type="button"
              onClick={onNext}
              disabled={!canNext}
              className={`ml-auto flex items-center justify-center gap-2 px-6 py-4 rounded-xl shadow-md transition-all ${
                canNext
                  ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white hover:shadow-lg'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              診断へ進む
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
