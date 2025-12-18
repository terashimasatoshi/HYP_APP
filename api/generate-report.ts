// api/generate-report.ts
import OpenAI from 'openai';
import { supabaseAdmin } from './_supabase';
import { HRV_KNOWLEDGE, SELFCARE_KNOWLEDGE, NEXT_ACTION_EXAMPLES, SELFCARE_EXAMPLES } from './_knowledge';

export const runtime = 'nodejs';

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
});
const MODEL = 'gemini-2.5-flash';

/**
 * subjective_scores の phase(before/after) を取り込む対応版
 * - today: HRV(before/after) + subjective_before/after + 差分
 * - next_action: 必ず「自宅でできる行動」1つ（来店/施術/予約など禁止）
 * - 次回来店目安: 3〜6週間（約1ヶ月〜1ヶ月半）に固定
 *
 * ✅ 修正ポイント
 * - visits を visit_date だけでなく created_at で並べ替え（同日複数回でも安定）
 * - visit_id 指定時は「そのvisitの直前のvisit」を取得（前回参照がズレない）
 */

type Subj = {
  sleep_quality?: number | null;
  stress?: number | null;
  body_heaviness?: number | null;
  bedtime?: string | null;
  alcohol?: boolean | null;
  caffeine?: boolean | null;
  exercise?: boolean | null;
};

type NormalizedVisit = {
  id: string;
  customer_id?: string | null;
  date: string; // visit_date
  created_at?: string | null; // ✅
  menu?: string | null;
  staff?: string | null;
  before?: { rmssd?: number | null; sdnn?: number | null; heart_rate?: number | null } | null;
  after?: { rmssd?: number | null; sdnn?: number | null; heart_rate?: number | null } | null;
  subjective_before?: Subj | null;
  subjective_after?: Subj | null;
};

function num(v: any): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function num2(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function boolOrNull(v: any): boolean | null {
  return typeof v === 'boolean' ? v : null;
}
function diff(before: any, after: any): number | null {
  const b = num2(before);
  const a = num2(after);
  if (b == null || a == null) return null;
  return a - b;
}
function pct(before: any, after: any): number | null {
  const b = num2(before);
  const a = num2(after);
  if (b == null || a == null || b === 0) return null;
  return Math.round(((a - b) / b) * 100);
}
function fmtDelta(before: any, after: any): string {
  const b = num2(before);
  const a = num2(after);
  if (b == null || a == null) return 'データ不足';
  const d = a - b;
  const p = pct(b, a);
  const sign = d >= 0 ? '+' : '';
  return `${b} → ${a}（${sign}${d}${p != null ? ` / ${sign}${p}%` : ''}）`;
}

function normalizeVisit(v: any): NormalizedVisit | null {
  if (!v) return null;

  const before = v.hrv_measurements?.find((m: any) => m.phase === 'before') ?? null;
  const after = v.hrv_measurements?.find((m: any) => m.phase === 'after') ?? null;

  const subjBeforeRow = v.subjective_scores?.find((s: any) => s.phase === 'before') ?? null;
  const subjAfterRow = v.subjective_scores?.find((s: any) => s.phase === 'after') ?? null;

  const toSubj = (row: any): Subj | null => {
    if (!row) return null;
    return {
      sleep_quality: num(row.sleep_quality),
      stress: num(row.stress),
      body_heaviness: num(row.body_heaviness),
      bedtime: row.bedtime ?? null,
      alcohol: boolOrNull(row.alcohol),
      caffeine: boolOrNull(row.caffeine),
      exercise: boolOrNull(row.exercise),
    };
  };

  return {
    id: v.id,
    customer_id: v.customer_id ?? null,
    date: v.visit_date,
    created_at: v.created_at ?? null, // ✅
    menu: v.menu ?? null,
    staff: v.staff ?? null,
    before: before ? { rmssd: num(before.rmssd), sdnn: num(before.sdnn), heart_rate: num(before.heart_rate) } : null,
    after: after ? { rmssd: num(after.rmssd), sdnn: num(after.sdnn), heart_rate: num(after.heart_rate) } : null,
    subjective_before: toSubj(subjBeforeRow),
    subjective_after: toSubj(subjAfterRow),
  };
}

function buildFallbackNextAction(input: any): string {
  const sb = input?.today?.subjective_before ?? {};
  const sa = input?.today?.subjective_after ?? {};

  const sleepB = num2(sb.sleep_quality);
  const stressB = num2(sb.stress);
  const heavyB = num2(sb.body_heaviness);

  const sleepA = num2(sa.sleep_quality);
  const stressA = num2(sa.stress);
  const heavyA = num2(sa.body_heaviness);

  const alcohol = sb.alcohol === true;
  const caffeine = sb.caffeine === true;

  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  if (stressA != null && stressA >= 6) return pick(SELFCARE_EXAMPLES.highStress);
  if (stressB != null && stressB >= 6) return pick(SELFCARE_EXAMPLES.highStress);

  if ((sleepB != null && sleepB <= 4) || (sleepA != null && sleepA <= 4)) {
    return pick(SELFCARE_EXAMPLES.poorSleep);
  }

  if ((heavyA != null && heavyA >= 6) || (heavyB != null && heavyB >= 6)) {
    return pick(SELFCARE_EXAMPLES.bodyHeaviness);
  }

  if (caffeine) return pick(SELFCARE_EXAMPLES.caffeine);
  if (alcohol) return pick(SELFCARE_EXAMPLES.alcohol);

  return pick(SELFCARE_EXAMPLES.general);
}

function validateNextAction(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 40 || t.length > 70) return false;

  const banned = /(来店|予約|施術|サロン|クリニック|病院|受診|通院|次回予約)/;
  if (banned.test(t)) return false;

  const hasDigit = /\d/.test(t);
  const hasUnit = /(分|回|秒)/.test(t);
  if (!hasDigit || !hasUnit) return false;

  return true;
}

function reportHasRequiredHeadings(report: string): boolean {
  const required = ['【本日のまとめ】', '【数値の変化】', '【主観・生活背景】', '【セルフケア（次回まで）】', '【次回来店の目安】'];
  return required.every((h) => report.includes(h));
}

function reportHasNextVisitRange(report: string): boolean {
  return /3[〜~\-−–]6週間|約1[ヶか]月[〜~\-−–]1[ヶか]月半|1ヶ月〜1ヶ月半|3～6週間/.test(report);
}

async function createCompletion(messages: any[], opts?: { max_tokens?: number }) {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    temperature: 0.7,
    max_tokens: opts?.max_tokens ?? 4000,
  });
  return response;
}

/** ✅ tags で確実に抽出 */
function extractTag(text: string, tag: 'report' | 'next_action'): string {
  if (!text) return '';
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = text.match(re);
  return (m?.[1] ?? '').trim();
}

/** ✅ report本文に混入したコード/JSONっぽい塊を最低限落とす（保険） */
function sanitizeReport(report: string): string {
  if (!report) return '';
  let r = report;

  // fenced code block を除去
  r = r.replace(/```[\s\S]*?```/g, '').trim();

  // “露骨なJSONオブジェクト” が末尾に付くケースを削る（よくある事故）
  // ※ 文章中の軽い括弧は残すため、行頭から始まる { ... } ブロックに限定
  r = r.replace(/^\s*\{[\s\S]*\}\s*$/m, '').trim();

  // 連続空行を圧縮
  r = r.replace(/\n{3,}/g, '\n\n').trim();

  return r;
}

/** ✅ JSON救済（タグがない時の最後の手段） */
function tryParseJson(content: string): { report: string; next_action: string } | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    return {
      report: typeof parsed.report === 'string' ? parsed.report.trim() : '',
      next_action: typeof parsed.next_action === 'string' ? parsed.next_action.trim() : '',
    };
  } catch {
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : '';
    if (!jsonStr) return null;
    try {
      const parsed = JSON.parse(jsonStr);
      return {
        report: typeof parsed.report === 'string' ? parsed.report.trim() : '',
        next_action: typeof parsed.next_action === 'string' ? parsed.next_action.trim() : '',
      };
    } catch {
      return null;
    }
  }
}

/**
 * ✅ visits取得：同日複数回でも最新順が安定するよう created_at DESC を使う
 */
async function fetchLatestTwoByCustomer(customerId: string) {
  const { data, error } = await supabaseAdmin
    .from('visits')
    .select(
      `
      id, customer_id, visit_date, created_at, staff, menu,
      hrv_measurements (phase, rmssd, sdnn, heart_rate),
      subjective_scores (phase, sleep_quality, stress, body_heaviness, bedtime, alcohol, caffeine, exercise)
    `
    )
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false }) // ✅
    .order('visit_date', { ascending: false }) // 保険
    .limit(2);

  if (error) throw error;
  return data ?? [];
}

/**
 * ✅ 「このvisitの直前」を取得（visit_id指定時にズレない）
 */
async function fetchPrevOfCurrent(customerId: string, current: NormalizedVisit) {
  const curCreatedAt = current.created_at;
  if (!curCreatedAt) return null;

  const { data, error } = await supabaseAdmin
    .from('visits')
    .select(
      `
      id, customer_id, visit_date, created_at, staff, menu,
      hrv_measurements (phase, rmssd, sdnn, heart_rate),
      subjective_scores (phase, sleep_quality, stress, body_heaviness, bedtime, alcohol, caffeine, exercise)
    `
    )
    .eq('customer_id', customerId)
    .lt('created_at', curCreatedAt)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data ?? [])[0] ?? null;
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const body = await request.json().catch(() => null);
    if (!body) return new Response('Invalid JSON', { status: 400 });

    let customerId: string | undefined = body.customer_id;
    const visitId: string | undefined = body.visit_id;

    let current: NormalizedVisit | null = null;
    let previous: NormalizedVisit | null = null;

    try {
      if (visitId) {
        const { data, error } = await supabaseAdmin
          .from('visits')
          .select(
            `
            id, customer_id, visit_date, created_at, staff, menu,
            hrv_measurements (phase, rmssd, sdnn, heart_rate),
            subjective_scores (phase, sleep_quality, stress, body_heaviness, bedtime, alcohol, caffeine, exercise)
          `
          )
          .eq('id', visitId)
          .single();

        if (error) throw error;

        current = normalizeVisit(data);
        customerId = customerId ?? (current?.customer_id ?? undefined);

        if (customerId && current) {
          const prevRow = await fetchPrevOfCurrent(customerId, current);
          previous = normalizeVisit(prevRow);
        }
      } else {
        if (customerId) {
          const rows = await fetchLatestTwoByCustomer(customerId);
          current = normalizeVisit(rows[0]);
          previous = normalizeVisit(rows[1]);
        }
      }
    } catch (e: any) {
      console.error('visit load error:', e?.message ?? e);
    }

    const cd = body.fallbackCustomerData ?? {};

    const todayBefore = {
      rmssd: current?.before?.rmssd ?? num2(cd.beforeRMSSD),
      sdnn: current?.before?.sdnn ?? num2(cd.beforeSDNN),
      heart_rate: current?.before?.heart_rate ?? num2(cd.beforeHeartRate),
    };
    const todayAfter = {
      rmssd: current?.after?.rmssd ?? num2(cd.afterRMSSD),
      sdnn: current?.after?.sdnn ?? num2(cd.afterSDNN),
      heart_rate: current?.after?.heart_rate ?? num2(cd.afterHeartRate),
    };

    const subjBefore: Subj = {
      sleep_quality: current?.subjective_before?.sleep_quality ?? num2(cd.sleepQuality),
      stress: current?.subjective_before?.stress ?? num2(cd.stress),
      body_heaviness: current?.subjective_before?.body_heaviness ?? num2(cd.bodyHeaviness),
      bedtime: current?.subjective_before?.bedtime ?? (cd.bedtime ?? null),
      alcohol: current?.subjective_before?.alcohol ?? boolOrNull(cd.alcohol),
      caffeine: current?.subjective_before?.caffeine ?? boolOrNull(cd.caffeine),
      exercise: current?.subjective_before?.exercise ?? boolOrNull(cd.exercise),
    };

    const subjAfter: Subj = {
      sleep_quality:
        current?.subjective_after?.sleep_quality ?? num2(cd.afterSleepQuality ?? cd.after_sleep_quality ?? null),
      stress: current?.subjective_after?.stress ?? num2(cd.afterStress ?? cd.after_stress ?? null),
      body_heaviness:
        current?.subjective_after?.body_heaviness ?? num2(cd.afterBodyHeaviness ?? cd.after_body_heaviness ?? null),
    };

    const input = {
      today: {
        date: current?.date ?? new Date().toISOString().slice(0, 10),
        menu: current?.menu ?? cd.menu ?? null,
        staff: current?.staff ?? cd.staff ?? null,
        before: todayBefore,
        after: todayAfter,
        subjective_before: subjBefore,
        subjective_after: subjAfter,
        computed: {
          rmssd_diff: diff(todayBefore.rmssd, todayAfter.rmssd),
          rmssd_pct: pct(todayBefore.rmssd, todayAfter.rmssd),
          sdnn_diff: diff(todayBefore.sdnn, todayAfter.sdnn),
          sdnn_pct: pct(todayBefore.sdnn, todayAfter.sdnn),
          hr_diff: diff(todayBefore.heart_rate, todayAfter.heart_rate),
          hr_pct: pct(todayBefore.heart_rate, todayAfter.heart_rate),
          subjective_sleep_diff: diff(subjBefore.sleep_quality, subjAfter.sleep_quality),
          subjective_stress_diff: diff(subjBefore.stress, subjAfter.stress),
          subjective_heavy_diff: diff(subjBefore.body_heaviness, subjAfter.body_heaviness),
          note: {
            sleep_quality: '高いほど良い',
            stress: '低いほど良い',
            body_heaviness: '低いほど良い',
            delta_rule: '差分 = 施術後 - 施術前',
          },
        },
      },
      previous: previous
        ? {
            date: previous.date,
            after: previous.after ?? null,
            subjective_after: previous.subjective_after ?? null,
          }
        : null,
    };

    const system = `
【参考ナレッジ：自律神経・HRV】
${HRV_KNOWLEDGE}

【参考ナレッジ：セルフケア方法】
${SELFCARE_KNOWLEDGE}

【参考ナレッジ：次回アクション例】
${NEXT_ACTION_EXAMPLES}

---

あなたはリラクゼーションサロン「森の日々」のスタッフとして、お客様に渡す「施術後レポート」を作成します（日本語・丁寧語）。
医療的な診断・治療効果の断定は禁止。「傾向」「〜と考えられます」「〜かもしれません」を用います。

【レポート作成の必須ルール】
- reportは必ず複数行（改行あり）で、目安400〜800文字
- 自律神経・副交感神経の観点からRMSSDの変化を解説する（お客様にわかりやすく）
- 数値を2つ以上引用（RMSSD/SDNN/心拍/主観スコアから2つ以上）
- 「施術前→施術後の主観（sleep_quality/stress/body_heaviness）」に必ず触れ、差分も1つ以上言及する
  ※sleep_qualityは高いほど良い / stress・body_heavinessは低いほど良い
- bedtime/alcohol/caffeine/exercise は、入力があるものだけ触れる（無いなら無理に書かない）
- セルフケアは最大2つ。必ず「時間 or 回数」を入れる（抽象は禁止）
- セルフケアも「副交感神経を活性化させる」観点で提案する（深呼吸、ストレッチ、瞑想など）
- report本文にJSON/コード/```/波括弧の羅列を含めない（DATAを貼らない）

【次回来店の目安（重要）】
- report内の「【次回来店の目安】」は必ず「3〜6週間後（約1ヶ月〜1ヶ月半）」の範囲で提案する
- 1週間後/2週間後 など "3週間未満" の提案は禁止

【next_action（最重要）】
- next_action は「自宅でできるセルフケア」1つだけ
- 来店/施術/予約/サロン/クリニック等の単語を含めるのは禁止
- 40〜70文字で、時間/回数を必ず入れる（抽象は禁止）

【出力形式（超重要）】
- 出力は必ず次の2つのタグだけ。余計な文章は禁止。
<report>...ここにレポート本文...</report>
<next_action>...ここに次回アクション...</next_action>

【reportフォーマット（この見出しを使う）】
【本日のまとめ】
【数値の変化】
【主観・生活背景】
【セルフケア（次回まで）】
【次回来店の目安】
`;

    const user = `
次のDATAだけを根拠に、上のルールに従って作成してください。
出力は必ずタグ形式のみ（JSON禁止・コードブロック禁止・DATA貼り付け禁止）。

DATA:
${JSON.stringify(input, null, 2)}

補助：数値の見せ方例
- RMSSD（副交感神経指標）: ${fmtDelta(todayBefore.rmssd, todayAfter.rmssd)}
- SDNN（自律神経全体の活動量）: ${fmtDelta(todayBefore.sdnn, todayAfter.sdnn)}
- 心拍数: ${fmtDelta(todayBefore.heart_rate, todayAfter.heart_rate)}
- 主観(睡眠の質): ${fmtDelta(subjBefore.sleep_quality, subjAfter.sleep_quality)}
- 主観(ストレス): ${fmtDelta(subjBefore.stress, subjAfter.stress)}
- 主観(重だるさ): ${fmtDelta(subjBefore.body_heaviness, subjAfter.body_heaviness)}
`;

    try {
      const res1 = await createCompletion([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]);

      const content1 = res1.choices[0]?.message?.content ?? '';

      // 1) タグ抽出（最優先）
      let report = extractTag(content1, 'report');
      let nextAction = extractTag(content1, 'next_action');

      // 2) タグが取れない場合だけJSON救済
      if (!report || !nextAction) {
        const parsed = tryParseJson(content1);
        if (parsed) {
          report = report || parsed.report;
          nextAction = nextAction || parsed.next_action;
        }
      }

      // 3) それでもreportが空なら「全文をreport扱い」になるが、混入を落とす
      if (!report) report = content1.trim();
      report = sanitizeReport(report);

      const needsReportRetry =
        !report ||
        report.length < 220 ||
        !reportHasRequiredHeadings(report) ||
        !reportHasNextVisitRange(report);

      const needsNextActionFix = !validateNextAction(nextAction);

      if (needsReportRetry || needsNextActionFix) {
        const strictSystem =
          system +
          `
追加ルール（再試行）：
- 必ずタグ形式のみで出力（<report>と<next_action>以外は禁止）
- reportは見出し5つを必ず含む
- 【次回来店の目安】は必ず「3〜6週間後（約1ヶ月〜1ヶ月半）」
- next_action は必ず40〜70文字、禁止語なし、時間/回数あり
`;

        const res2 = await createCompletion([
          { role: 'system', content: strictSystem },
          { role: 'user', content: user },
        ]);

        const content2 = res2.choices[0]?.message?.content ?? '';

        const r2 = sanitizeReport(extractTag(content2, 'report'));
        const na2 = extractTag(content2, 'next_action');

        if (r2) report = r2;
        if (na2) nextAction = na2;

        // 再試行でもタグが取れない場合の最終救済
        if ((!report || !nextAction) && content2) {
          const parsed2 = tryParseJson(content2);
          if (parsed2) {
            report = report || sanitizeReport(parsed2.report);
            nextAction = nextAction || parsed2.next_action;
          }
        }
      }

      if (!validateNextAction(nextAction)) {
        nextAction = buildFallbackNextAction(input);
      }

      let savedId: string | null = null;
      if (current?.id) {
        const { data: saved, error } = await supabaseAdmin
          .from('ai_reports')
          .insert({
            visit_id: current.id,
            model: MODEL,
            report_text: report,
          })
          .select('id')
          .single();

        if (!error && saved?.id) savedId = saved.id;
      }

      return Response.json({
        report,
        next_action: nextAction,
        report_id: savedId,
        model: MODEL,
        input_used: {
          has_subjective_before: Boolean(input?.today?.subjective_before),
          has_subjective_after:
            input?.today?.subjective_after?.sleep_quality != null ||
            input?.today?.subjective_after?.stress != null ||
            input?.today?.subjective_after?.body_heaviness != null,
          previous_visit_date: input?.previous?.date ?? null,
        },
      });
    } catch (err) {
      console.error('OpenAI error', err);
      return new Response('OpenAI error', { status: 500 });
    }
  },
};
