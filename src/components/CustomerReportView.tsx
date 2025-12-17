import { useEffect, useState } from 'react';
import { Sparkles, TrendingUp, Lightbulb, Leaf } from 'lucide-react';

interface ReportData {
  visit_id: string;
  visit_date: string;
  customer_name: string;
  menu: string;
  before_rmssd: number | null;
  after_rmssd: number | null;
  improvement_rate: number;
  report_text: string | null;
  next_action: string | null;
}

interface CustomerReportViewProps {
  visitId: string;
}

export function CustomerReportView({ visitId }: CustomerReportViewProps) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/get-report?visit_id=${visitId}`);
        if (!res.ok) {
          throw new Error('レポートが見つかりませんでした');
        }
        const data = await res.json();
        setReport(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [visitId, API_BASE]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-emerald-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-emerald-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md">
          <div className="text-red-500 text-5xl mb-4">😢</div>
          <h1 className="text-xl text-gray-800 mb-2">レポートが見つかりません</h1>
          <p className="text-gray-500 text-sm">{error || 'URLをご確認ください'}</p>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-emerald-50">
      {/* ヘッダー */}
      <header className="bg-white/80 backdrop-blur shadow-sm py-4 px-6">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center">
            <Leaf className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-green-800">森の日々</h1>
            <p className="text-xs text-gray-500">ヘッドスパ専門店</p>
          </div>
        </div>
      </header>

      <main className="p-4 pb-8">
        <div className="max-w-lg mx-auto space-y-4">
          {/* 挨拶カード */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <p className="text-gray-600 text-sm mb-1">{formatDate(report.visit_date)}</p>
            <h2 className="text-xl text-gray-800">
              <span className="text-green-600 font-semibold">{report.customer_name}</span>様
            </h2>
            <p className="text-gray-600 mt-2 text-sm">
              本日はご来店ありがとうございました。
              <br />
              施術の効果をまとめましたのでご確認ください。
            </p>
          </div>

          {/* 改善率カード */}
          <div className="bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl shadow-lg p-6 text-white">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-6 h-6" />
              <h3 className="font-semibold">今日の変化</h3>
            </div>
            <div className="text-center py-4">
              <div className="text-6xl font-bold mb-2">
                {report.improvement_rate > 0 ? '+' : ''}
                {report.improvement_rate}%
              </div>
              <p className="text-green-100">RMSSD改善率</p>
            </div>
            {report.before_rmssd && report.after_rmssd && (
              <div className="flex justify-center gap-6 mt-4 pt-4 border-t border-white/20">
                <div className="text-center">
                  <p className="text-green-100 text-xs">施術前</p>
                  <p className="text-xl font-semibold">{report.before_rmssd}ms</p>
                </div>
                <div className="text-2xl text-green-200">→</div>
                <div className="text-center">
                  <p className="text-green-100 text-xs">施術後</p>
                  <p className="text-xl font-semibold">{report.after_rmssd}ms</p>
                </div>
              </div>
            )}
          </div>

          {/* AIインサイト */}
          {report.report_text && (
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-6 h-6 text-purple-500" />
                <h3 className="font-semibold text-gray-800">AIインサイト</h3>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                  {report.report_text}
                </p>
              </div>
            </div>
          )}

          {/* 次回までの1アクション */}
          {report.next_action && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl shadow-lg p-6 border-2 border-amber-200">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-6 h-6 text-amber-500" />
                <h3 className="font-semibold text-gray-800">次回までの1アクション</h3>
              </div>
              <div className="bg-white rounded-xl p-4">
                <p className="text-lg text-amber-800 font-medium">{report.next_action}</p>
              </div>
            </div>
          )}

          {/* フッター */}
          <div className="text-center pt-4">
            <p className="text-gray-400 text-xs">
              次回のご来店をお待ちしております
            </p>
            <p className="text-gray-400 text-xs mt-1">
              森の日々 - ヘッドスパ専門店
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
