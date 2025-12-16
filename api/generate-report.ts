// api/generate-report.ts
import OpenAI from 'openai';
import { supabaseAdmin } from './_supabase';

export const runtime = 'nodejs';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_REPORT_MODEL || 'gpt-4o-mini';

/**
 * subjective_scores の phase(before/after) を取り込む対応版
 * - today: HRV(before/after) + subjective_before/after + 差分
 * - next_action: 必ず「自宅でできる行動」1つ（来店/施術/予約など禁止）
 * - 次回来店目安: 3〜6週間（約1ヶ月〜1ヶ月半）に固定
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
  date: string;
  menu?: string | null;
  staff?: string | null;
  before?: { rmssd?: number | null; sdnn?: number | null; heart_rate?: number | null } | null;
  after?: { rmssd?: number | null; sdnn?: number | null; heart_rate?: number | null } | null;

  // ✅ phase別で保持
  subjective_before?: Subj | null;
  subjective_after?: Subj | null;
};

function num(v: any): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function num2(v: any): number | null {
  // 数値文字列も許可（fallback用）
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
    date: v.visit_date,
    menu: v.menu ?? null,
    staff: v.staff ?? null,
    before: before
      ? { rmssd: num(before.rmssd), sdnn: num(before.sdnn), heart_rate: num(before.heart_rate) }
      : null,
    after: after
      ? { rmssd: num(after.rmssd), sdnn: num(after.sdnn), heart_rate: num(after.heart_rate) }
      : null,
    subjective_before: toSubj(subjBeforeRow),
    subjective_after: toSubj(subjAfterRow),
  };
}

function buildFallbackNextAction(input: any): string {
  // ✅ 基本は「施術前の主観＋生活」中心、afterがあれば補助で見る
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

  // afterが高ストレスなら優先して呼吸
  if (stressA != null && stressA >= 6) {
    return '次回まで：4秒吸って6秒吐く呼吸を3分×2回（毎日）';
  }
  if (stressB != null && stressB >= 6) {
    return '次回まで：4秒吸って6秒吐く呼吸を3分×2回（毎日）';
  }

  // 睡眠が低いなら就寝前ルーティン
  if ((sleepB != null && sleepB <= 4) || (sleepA != null && sleepA <= 4)) {
    return '次回まで：就寝前にスマホを置き、呼吸瞑想5分（毎晩）';
  }

  // 重だるさ高いなら頭皮＋首肩
  if ((heavyA != null && heavyA >= 6) || (heavyB != null && heavyB >= 6)) {
    return '次回まで：頭皮を指の腹で1分＋首回し1分（毎晩）';
  }

  if (caffeine) {
    return '次回まで：14時以降はカフェインを控える（まず7日間）';
  }
  if (alcohol) {
    return '次回まで：就寝前に白湯200ml＋首肩ストレッチ2分（毎晩）';
  }
  return '次回まで：首肩ストレッチ2分＋深呼吸2分（毎晩）';
}

function validateNextAction(text: string): boolean {
  if (!text) return false;
  const t = text.trim();

  // 40〜70文字（要件）
  if (t.length < 40 || t.length > 70) return false;

  // 来店/施術/予約など禁止
  const banned = /(来店|予約|施術|サロン|クリニック|病院|受診|通院|次回予約)/;
  if (banned.test(t)) return false;

  // 数字 + 時間/回数 単位が必須
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
  // 3〜6週間 or 約1ヶ月〜1ヶ月半 を含めばOK
  return /(3\s*[〜\-~]\s*6\s*週間)|(約?\s*1\s*ヶ?月\s*[〜\-~]\s*1\s*ヶ?月半)/.test(report);
}

async function createCompletion(messages: any[], opts?: { max_tokens?: number }) {
  // response_format が環境で弾かれる可能性に備えてフォールバック付き
  try {
    return await client.chat.completions.create({
      model: MODEL,
      messages,
      response_format: { type: 'json_object' } as any,
      temperature: 0.7,
      max_tokens: opts?.max_tokens ?? 900,
    });
  } catch (e) {
    return await client.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.7,
      max_tokens: opts?.max_tokens ?? 900,
    });
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const body = await request.json().catch(() => null);
    if (!body) return new Response('Invalid JSON', { status: 400 });

    const customerId: string | undefined = body.customer_id;
    const visitId: string | undefined = body.visit_id;

    let current: NormalizedVisit | null = null;
    let previous: NormalizedVisit | null = null;

    // customer_id で最新2件
    if (customerId) {
      const { data, error } = await supabaseAdmin
        .from('visits')
        .select(`
          id, visit_date, staff, menu,
          hrv_measurements (phase, rmssd, sdnn, heart_rate),
          subjective_scores (phase, sleep_quality, stress, body_heaviness, bedtime, alcohol, caffeine, exercise)
        `)
        .eq('customer_id', customerId)
        .order('visit_date', { ascending: false })
        .limit(2);

      if (!error && data) {
        current = normalizeVisit(data[0]);
        previous = normalizeVisit(data[1]);
      }
    }

    // visit_id 指定時は current を固定
    if (visitId) {
      const { data, error } = await supabaseAdmin
        .from('visits')
        .select(`
          id, visit_date, staff, menu,
          hrv_measurements (phase, rmssd, sdnn, heart_rate),
          subjective_scores (phase, sleep_quality, stress, body_heaviness, bedtime, alcohol, caffeine, exercise)
        `)
        .eq('id', visitId)
        .single();

      if (!error && data) {
        current = normalizeVisit(data);
      }
    }

    // fallback（フロントから来る場合に備える）
    const cd = body.fallbackCustomerData ?? {};

    // HRV（today）
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

    // ✅ subjective_before（施術前：生活も含む）
    const subjBefore: Subj = {
      sleep_quality: current?.subjective_before?.sleep_quality ?? num2(cd.sleepQuality),
      stress: current?.subjective_before?.stress ?? num2(cd.stress),
      body_heaviness: current?.subjective_before?.body_heaviness ?? num2(cd.bodyHeaviness),
      bedtime: current?.subjective_before?.bedtime ?? (cd.bedtime ?? null),
      alcohol: current?.subjective_before?.alcohol ?? boolOrNull(cd.alcohol),
      caffeine: current?.subjective_before?.caffeine ?? boolOrNull(cd.caffeine),
      exercise: current?.subjective_before?.exercise ?? boolOrNull(cd.exercise),
    };

    // ✅ subjective_after（施術後：3スライダー想定）
    // App側が後で追加する可能性を考えて afterSleepQuality/afterStress/afterBodyHeaviness も拾う
    const subjAfter: Subj = {
      sleep_quality:
        current?.subjective_after?.sleep_quality ??
        num2(cd.afterSleepQuality ?? cd.after_sleep_quality ?? null),
      stress: current?.subjective_after?.stress ?? num2(cd.afterStress ?? cd.after_stress ?? null),
      body_heaviness:
        current?.subjective_after?.body_heaviness ??
        num2(cd.afterBodyHeaviness ?? cd.after_body_heaviness ?? null),
    };

    const input = {
      today: {
        date: current?.date ?? new Date().toISOString().slice(0, 10),
        menu: current?.menu ?? cd.menu ?? null,
        staff: current?.staff ?? cd.staff ?? null,
        before: todayBefore,
        after: todayAfter,

        // ✅ 施術前/施術後 主観（phase別）
        subjective_before: subjBefore,
        subjective_after: subjAfter,

        // ✅ 差分（after - before）
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

          // 解釈の注意（AIが取り違えないように）
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
あなたはリラクゼーションサロンのスタッフとして、お客様に渡す「施術後レポート」を作成します（日本語・丁寧語）。
医療的な診断・治療効果の断定は禁止。「傾向」「〜かもしれません」を用います。

【必須ルール】
- reportは“必ず”複数行（改行あり）で、目安350〜700文字
- 数値を2つ以上引用（RMSSD/SDNN/心拍/主観スコアから2つ以上）
- 「施術前→施術後の主観（sleep_quality/stress/body_heaviness）」に必ず触れ、差分も1つ以上言及する
  ※sleep_qualityは高いほど良い / stress・body_heavinessは低いほど良い
- bedtime/alcohol/caffeine/exercise は、入力があるものだけ触れる（無いなら無理に書かない）
- セルフケアは最大2つ。必ず「時間 or 回数」を入れる（抽象は禁止）

【次回来店の目安（重要）】
- report内の「【次回来店の目安】」は必ず
  「3〜6週間後（約1ヶ月〜1ヶ月半）」の範囲で提案する
- 1週間後/2週間後 など “3週間未満” の提案は禁止

【next_action（最重要）】
- next_action は「自宅でできるセルフケア」1つだけ
- 内容は瞑想/呼吸/ストレッチ/頭皮マッサージ/首肩ほぐし等の“自宅で完結する行動”
- 来店/施術/予約/サロン/クリニック等の単語を含めるのは禁止
- 40〜70文字で、時間/回数を必ず入れる（抽象は禁止）

【reportフォーマット（この見出しを使う）】
【本日のまとめ】
【数値の変化】
【主観・生活背景】
【セルフケア（次回まで）】
【次回来店の目安】
`;

    const user = `
次のDATAだけを根拠に、上のルールに従ってJSONで出力してください。
JSONは必ず { "report": "...", "next_action": "..." } の2キーのみ。

DATA:
${JSON.stringify(input, null, 2)}

補助：数値の見せ方例
- RMSSD: ${fmtDelta(todayBefore.rmssd, todayAfter.rmssd)}
- SDNN: ${fmtDelta(todayBefore.sdnn, todayAfter.sdnn)}
- 心拍: ${fmtDelta(todayBefore.heart_rate, todayAfter.heart_rate)}
- 主観(睡眠): ${fmtDelta(subjBefore.sleep_quality, subjAfter.sleep_quality)}
- 主観(ストレス): ${fmtDelta(subjBefore.stress, subjAfter.stress)}
- 主観(重だるさ): ${fmtDelta(subjBefore.body_heaviness, subjAfter.body_heaviness)}
`;

    try {
      const res1 = await createCompletion([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]);

      const content1 = res1.choices[0]?.message?.content ?? '{}';

      let report = '';
      let nextAction = '';

      // 1st parse
      try {
        const parsed = JSON.parse(content1);
        report = typeof parsed.report === 'string' ? parsed.report.trim() : '';
        nextAction = typeof parsed.next_action === 'string' ? parsed.next_action.trim() : '';
      } catch {
        // ```json ``` 対応（response_formatが効かなかった時の保険）
        const jsonMatch = content1.match(/```json\n([\s\S]*?)\n```/) || content1.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content1;
        try {
          const parsed = JSON.parse(jsonStr);
          report = typeof parsed.report === 'string' ? parsed.report.trim() : '';
          nextAction = typeof parsed.next_action === 'string' ? parsed.next_action.trim() : '';
        } catch {
          report = content1;
          nextAction = '';
        }
      }

      // ✅ reportの品質チェック（短い/見出し不足/次回来店範囲がズレる）
      const needsReportRetry =
        (!report || report.length < 220) || !reportHasRequiredHeadings(report) || !reportHasNextVisitRange(report);

      // ✅ next_action の品質チェック（自宅行動・文字数・禁止語・時間/回数）
      const needsNextActionFix = !validateNextAction(nextAction);

      // 追い生成（最大1回）
      if (needsReportRetry || needsNextActionFix) {
        const strictSystem =
          system +
          `
追加ルール：
- reportは必ず見出し5つを含む
- 【次回来店の目安】は必ず「3〜6週間後（約1ヶ月〜1ヶ月半）」にする
- next_action は必ず40〜70文字、禁止語なし、時間/回数あり
`;
        const res2 = await createCompletion([
          { role: 'system', content: strictSystem },
          { role: 'user', content: user },
        ]);

        const content2 = res2.choices[0]?.message?.content ?? '{}';
        try {
          const parsed2 = JSON.parse(content2);
          const r2 = typeof parsed2.report === 'string' ? parsed2.report.trim() : '';
          const na2 = typeof parsed2.next_action === 'string' ? parsed2.next_action.trim() : '';
          if (r2) report = r2;
          if (na2) nextAction = na2;
        } catch {
          // noop
        }
      }

      // ✅ next_action がまだ条件NGならフォールバックで絶対に枠を消さない
      if (!validateNextAction(nextAction)) {
        nextAction = buildFallbackNextAction(input);
      }

      // ai_reports 保存（互換：report_textのみ保存）
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
          // デバッグ用：必要ならフロントで確認できる
          has_subjective_before: Boolean(input?.today?.subjective_before),
          has_subjective_after:
            input?.today?.subjective_after?.sleep_quality != null ||
            input?.today?.subjective_after?.stress != null ||
            input?.today?.subjective_after?.body_heaviness != null,
        },
      });
    } catch (err) {
      console.error('OpenAI error', err);
      return new Response('OpenAI error', { status: 500 });
    }
  },
};
