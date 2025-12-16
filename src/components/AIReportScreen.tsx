import { useEffect, useMemo, useState } from 'react';
import { CustomerData } from '../App';
import { TrendingUp, Sparkles, Lightbulb, Home, Save } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ImprovementChart } from './ImprovementChart';

type CustomerDataWithAfterSubjective = CustomerData & {
  // ✅ 施術後体感（AfterConditionScreen）で入れる3スライダー想定
  afterSleepQuality?: number;
  afterStress?: number;
  afterBodyHeaviness?: number;
};

interface AIReportScreenProps {
  customerData: CustomerDataWithAfterSubjective;
  onHome: () => void;
}

type VisitData = {
  id?: string;
  date?: string;
  before?: { rmssd?: number; sdnn?: number; heart_rate?: number };
  after?: { rmssd?: number; sdnn?: number; heart_rate?: number };

  // 既存の last-two-visits 互換（今は使ってないが残す）
  subjective?: { sleep_quality?: number; stress?: number; body_heaviness?: number };

  ai_report?: string | null;
};

function isFiniteNumber(v: any): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function AIReportScreen({ customerData, onHome }: AIReportScreenProps) {
  const [aiReport, setAiReport] = useState<string>('');
  const [nextAction, setNextAction] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [visitId, setVisitId] = useState<string | null>(null);
  const [currentVisit, setCurrentVisit] = useState<VisitData | null>(null);
  const [previousVisit, setPreviousVisit] = useState<VisitData | null>(null);

  const [isSavingDiagnosis, setIsSavingDiagnosis] = useState(false);
  const [isDiagnosisSaved, setIsDiagnosisSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

  // 戻る→進むで二重登録を避ける簡易キャッシュ
  const reportCacheKey = 'hyp:reportCache:v1';

  // ✅ 施術後主観（AfterConditionScreen）値を安全に取得
  const afterSleepQuality = isFiniteNumber(customerData.afterSleepQuality) ? customerData.afterSleepQuality : null;
  const afterStress = isFiniteNumber(customerData.afterStress) ? customerData.afterStress : null;
  const afterBodyHeaviness = isFiniteNumber(customerData.afterBodyHeaviness) ? customerData.afterBodyHeaviness : null;

  // ✅ 施術後主観が実際に入力されているか（全部null/undefinedなら送らない）
  const hasSubjectiveAfter = useMemo(() => {
    return [afterSleepQuality, afterStress, afterBodyHeaviness].some((v) => v != null);
  }, [afterSleepQuality, afterStress, afterBodyHeaviness]);

  // ✅ fingerprint（キャッシュ一致判定）に after 主観も含める
  const fingerprint = useMemo(() => {
    return JSON.stringify({
      customerId: customerData.customerId ?? null,
      name: customerData.name ?? null,
      menu: customerData.menu ?? null,
      staff: customerData.staff ?? null,
      date: new Date().toISOString().split('T')[0],

      beforeRMSSD: customerData.beforeRMSSD,
      beforeSDNN: customerData.beforeSDNN,
      beforeHR: customerData.beforeHeartRate,

      afterRMSSD: customerData.afterRMSSD,
      afterSDNN: customerData.afterSDNN,
      afterHR: customerData.afterHeartRate,

      // 施術前（既存）
      sleepQuality: customerData.sleepQuality,
      stress: customerData.stress,
      bodyHeaviness: customerData.bodyHeaviness,
      bedtime: customerData.bedtime,
      alcohol: customerData.alcohol,
      caffeine: customerData.caffeine,
      exercise: customerData.exercise,

      // ✅ 施術後（新規）
      afterSleepQuality,
      afterStress,
      afterBodyHeaviness,
    });
  }, [
    customerData.customerId,
    customerData.name,
    customerData.menu,
    customerData.staff,
    customerData.beforeRMSSD,
    customerData.beforeSDNN,
    customerData.beforeHeartRate,
    customerData.afterRMSSD,
    customerData.afterSDNN,
    customerData.afterHeartRate,
    customerData.sleepQuality,
    customerData.stress,
    customerData.bodyHeaviness,
    customerData.bedtime,
    customerData.alcohol,
    customerData.caffeine,
    customerData.exercise,
    afterSleepQuality,
    afterStress,
    afterBodyHeaviness,
  ]);

  useEffect(() => {
    const saveAndGenerate = async () => {
      setIsLoading(true);
      setError(null);
      setSaveError(null);
      setIsDiagnosisSaved(false);

      // キャッシュが同一なら復元
      try {
        const cachedRaw = sessionStorage.getItem(reportCacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached?.fingerprint === fingerprint) {
            setVisitId(cached.visit_id ?? null);
            setAiReport(cached.report ?? '');

            // next_action が空でも枠が消えないように、空文字は避ける
            const cachedNext = (cached.next_action ?? '').trim();
            setNextAction(cachedNext);

            if (cached.customer_id) {
              const lastTwoResponse = await fetch(
                `${API_BASE}/api/last-two-visits?customer_id=${cached.customer_id}`
              );
              if (lastTwoResponse.ok) {
                const lastTwoData = await lastTwoResponse.json();
                setCurrentVisit(lastTwoData.current);
                setPreviousVisit(lastTwoData.previous);
              }
            }

            setIsLoading(false);
            return;
          }
        }
      } catch {
        // 壊れてても通常処理へ
      }

      try {
        // ✅ 主観：施術前（before）
        const subjectiveBefore = {
          sleepQuality: customerData.sleepQuality,
          stress: customerData.stress,
          bodyHeaviness: customerData.bodyHeaviness,
          bedtime: customerData.bedtime,
          alcohol: customerData.alcohol,
          caffeine: customerData.caffeine,
          exercise: customerData.exercise,
        };

        // ✅ 主観：施術後（after）3スライダー
        const subjectiveAfter = hasSubjectiveAfter
          ? {
              sleepQuality: afterSleepQuality,
              stress: afterStress,
              bodyHeaviness: afterBodyHeaviness,
            }
          : undefined;

        // ① visit/測定/主観データ保存（customer_idに紐付く）
        // 互換のため:
        // - subjective（旧）も送る（= before）
        // - subjective_before（新）も送る（= before）
        // - subjective_after（新）も送る（= after）※入力があるときのみ
        const saveResponse = await fetch(`${API_BASE}/api/save-visit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer: customerData.customerId
              ? { id: customerData.customerId }
              : { full_name: customerData.name },
            visit: {
              visit_date: new Date().toISOString().split('T')[0],
              staff: customerData.staff,
              menu: customerData.menu,
            },
            before: {
              rmssd: customerData.beforeRMSSD,
              sdnn: customerData.beforeSDNN,
              heart_rate: customerData.beforeHeartRate,
            },
            after: {
              rmssd: customerData.afterRMSSD,
              sdnn: customerData.afterSDNN,
              heart_rate: customerData.afterHeartRate,
            },

            // 旧（before）
            subjective: subjectiveBefore,

            // 新（before/after）
            subjective_before: subjectiveBefore,
            subjective_after: subjectiveAfter,
          }),
        });

        if (!saveResponse.ok) throw new Error('データの保存に失敗しました');

        const saveData = await saveResponse.json();
        setVisitId(saveData.visit_id);

        // ② 前回/今回（数値＋診断内容）を取得
        if (saveData.customer_id) {
          const lastTwoResponse = await fetch(
            `${API_BASE}/api/last-two-visits?customer_id=${saveData.customer_id}`
          );
          if (lastTwoResponse.ok) {
            const lastTwoData = await lastTwoResponse.json();
            setCurrentVisit(lastTwoData.current);
            setPreviousVisit(lastTwoData.previous);
          }
        }

        // ③ AIレポート生成
        const reportResponse = await fetch(`${API_BASE}/api/generate-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: saveData.customer_id,
            visit_id: saveData.visit_id,
            fallbackCustomerData: customerData, // after主観も含む想定
          }),
        });

        if (!reportResponse.ok) throw new Error('AIレポートの生成に失敗しました');

        const reportData = await reportResponse.json();
        setAiReport((reportData.report ?? '').trim());

        // ✅ next_action が空のときでもUIが崩れないよう保険
        const na = String(reportData.next_action ?? '').trim();
        setNextAction(na);

        // キャッシュ保存
        try {
          sessionStorage.setItem(
            reportCacheKey,
            JSON.stringify({
              fingerprint,
              customer_id: saveData.customer_id,
              visit_id: saveData.visit_id,
              report: (reportData.report ?? '').trim(),
              next_action: na,
            })
          );
        } catch {
          // noop
        }
      } catch (e) {
        console.error(e);
        setError('処理中にエラーが発生しました。時間をおいて再度お試しください。');
      } finally {
        setIsLoading(false);
      }
    };

    saveAndGenerate();
  }, [API_BASE, customerData, fingerprint, hasSubjectiveAfter, afterSleepQuality, afterStress, afterBodyHeaviness]);

  const improvementRate =
    customerData.beforeRMSSD > 0
      ? Math.round(((customerData.afterRMSSD - customerData.beforeRMSSD) / customerData.beforeRMSSD) * 100)
      : 0;

  // ✅ 施術後主観が未入力の場合は「施術前と同じ値」で表示（変な見た目を防ぐ）
  const chartSleepAfter =
    afterSleepQuality != null ? afterSleepQuality : isFiniteNumber(customerData.sleepQuality) ? customerData.sleepQuality : 0;
  const chartStressAfter =
    afterStress != null ? afterStress : isFiniteNumber(customerData.stress) ? customerData.stress : 0;
  const chartBodyAfter =
    afterBodyHeaviness != null ? afterBodyHeaviness : isFiniteNumber(customerData.bodyHeaviness) ? customerData.bodyHeaviness : 0;

  const comparisonData = [
    { category: 'RMSSD', before: customerData.beforeRMSSD || 0, after: customerData.afterRMSSD || 0 },
    { category: '睡眠', before: customerData.sleepQuality ?? 0, after: chartSleepAfter ?? 0 },
    { category: 'ストレス', before: customerData.stress ?? 0, after: chartStressAfter ?? 0 },
    { category: '重だるさ', before: customerData.bodyHeaviness ?? 0, after: chartBodyAfter ?? 0 },
  ];

  const handleSaveDiagnosis = async () => {
    setSaveError(null);

    if (!visitId) {
      alert('保存準備中です（visit_idがまだありません）。少し待ってからお試しください。');
      return;
    }
    if (!aiReport && !nextAction) {
      alert('診断内容がまだ生成されていません。');
      return;
    }

    setIsSavingDiagnosis(true);
    try {
      const res = await fetch(`${API_BASE}/api/save-diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visit_id: visitId,
          report_text: aiReport,
          next_action: nextAction,
          model: 'gpt-4o-mini',
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }

      setIsDiagnosisSaved(true);

      // 保存後、前回/今回の診断内容も最新化（任意）
      if (customerData.customerId) {
        const lastTwoResponse = await fetch(
          `${API_BASE}/api/last-two-visits?customer_id=${customerData.customerId}`
        );
        if (lastTwoResponse.ok) {
          const lastTwoData = await lastTwoResponse.json();
          setCurrentVisit(lastTwoData.current);
          setPreviousVisit(lastTwoData.previous);
        }
      }
    } catch (e) {
      console.error(e);
      setSaveError('診断内容の保存に失敗しました');
    } finally {
      setIsSavingDiagnosis(false);
    }
  };

  // ✅ next_action 表示用（空でも枠が消えない）
  const nextActionDisplay = useMemo(() => {
    if (isLoading) return '生成中…';
    if (error) return '生成に失敗しました（再読み込みして下さい）';
    if (nextAction && nextAction.trim()) return nextAction.trim();
    return '（次回までの1アクションを生成できませんでした）';
  }, [isLoading, error, nextAction]);

  return (
    <div className="h-full p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h2 className="text-green-800 mb-2 flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-green-600" />
            診断結果（AIレポート）
          </h2>
          <p className="text-sm text-gray-600">{customerData.name}様の本日の施術効果をまとめました</p>
        </div>

        {/* Card 1 */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <h3 className="text-gray-800 mb-6 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-green-600" />
            今日の変化
          </h3>

          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="text-5xl text-green-600">{improvementRate}%</div>
              <div>
                <div className="text-gray-600">RMSSD改善率</div>
                <div className="flex items-center gap-2 text-green-600">
                  <TrendingUp className="w-5 h-5" />
                  <span className="text-sm">改善</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h4 className="text-sm text-gray-600 mb-4">施術前後の比較</h4>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="category" tick={{ fill: '#6B7280', fontSize: 12 }} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="before" name="施術前" fill="#D1D5DB" radius={[8, 8, 0, 0]} />
                <Bar dataKey="after" name="施術後" fill="#34D399" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-xl">
              <div className="text-xs text-gray-600 mb-1">施術前 RMSSD</div>
              <div className="text-2xl text-gray-700">{customerData.beforeRMSSD}ms</div>
            </div>
            <div className="bg-green-50 p-4 rounded-xl">
              <div className="text-xs text-green-700 mb-1">施術後 RMSSD</div>
              <div className="text-2xl text-green-700">{customerData.afterRMSSD}ms</div>
            </div>
          </div>
        </div>

        {/* 前回との比較（数値） */}
        {currentVisit && (
          <div className="mb-6">
            <h3 className="text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-blue-600" />
              前回との比較
            </h3>
            <ImprovementChart current={currentVisit as any} previous={previousVisit as any} />
          </div>
        )}

        {/* 前回の診断内容（保存済みのものがあれば表示） */}
        {previousVisit?.ai_report && (
          <details className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <summary className="cursor-pointer text-sm text-gray-700">前回の診断内容を見る</summary>
            <div className="mt-4 text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
              {previousVisit.ai_report}
            </div>
          </details>
        )}

        {/* AI Insights */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <h3 className="text-gray-800 mb-6 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-600" />
            AIインサイト
          </h3>

          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="w-2 bg-gradient-to-b from-green-400 to-emerald-500 rounded-full flex-shrink-0" />
              <div>
                {isLoading && <p className="text-gray-500 text-sm">AIレポートを生成しています…</p>}
                {error && <p className="text-red-500 text-sm">{error}</p>}
                {!isLoading && !error && aiReport && (
                  <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">{aiReport}</p>
                )}
                {!isLoading && !error && !aiReport && (
                  <p className="text-gray-500 text-sm">レポートを読み込んでいます…</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ✅ Next Action（空でも枠が消えない） */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl shadow-lg p-8 mb-6 border-2 border-green-200">
          <h3 className="text-gray-800 mb-6 flex items-center gap-2">
            <Lightbulb className="w-6 h-6 text-amber-500" />
            次回までの1アクション
          </h3>

          <div className="bg-white rounded-xl p-6">
            <p className="text-xl text-green-800">{nextActionDisplay}</p>
          </div>

          {/* next_actionが未生成/エラーのときは、保存ボタンを押しても意味が薄いので補助文 */}
          {!isLoading && !error && (!nextAction || !nextAction.trim()) && (
            <p className="text-xs text-gray-500 mt-3">
              ※次回までの1アクションが空のため、レポート生成設定をご確認ください。
            </p>
          )}
        </div>

        {/* ✅ Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleSaveDiagnosis}
            disabled={isLoading || isSavingDiagnosis || isDiagnosisSaved || !visitId}
            className={`w-full py-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 ${
              isLoading || isSavingDiagnosis || isDiagnosisSaved || !visitId
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-white border-2 border-green-300 text-green-700 hover:bg-green-50'
            }`}
          >
            <Save className="w-5 h-5" />
            {isDiagnosisSaved ? '保存しました' : isSavingDiagnosis ? '保存中...' : '診断内容を保存する'}
          </button>

          {saveError && <p className="text-sm text-red-500">{saveError}</p>}

          <button
            onClick={onHome}
            className="w-full py-4 bg-gradient-to-r from-green-400 to-emerald-500 text-white rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <Home className="w-5 h-5" />
            ホームへ戻る
          </button>
        </div>
      </div>
    </div>
  );
}
