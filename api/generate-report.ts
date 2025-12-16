// api/generate-report.ts
import OpenAI from 'openai';
import { supabaseAdmin } from './_supabase';

export const runtime = 'nodejs';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_REPORT_MODEL || 'gpt-4o-mini';

type NormalizedVisit = {
  id: string;
  date: string;
  menu?: string | null;
  staff?: string | null;
  before?: { rmssd?: number | null; sdnn?: number | null; heart_rate?: number | null } | null;
  after?: { rmssd?: number | null; sdnn?: number | null; heart_rate?: number | null } | null;
  subjective?: {
    sleep_quality?: number | null;
    stress?: number | null;
    body_heaviness?: number | null;
    bedtime?: string | null;
    alcohol?: boolean | null;
    caffeine?: boolean | null;
    exercise?: boolean | null;
  } | null;
};

function num(v: any): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function boolOrNull(v: any): boolean | null {
  return typeof v === 'boolean' ? v : null;
}
function diff(before: any, after: any): number | null {
  const b = num(before);
  const a = num(after);
  if (b == null || a == null) return null;
  return a - b;
}
function pct(before: any, after: any): number | null {
  const b = num(before);
  const a = num(after);
  if (b == null || a == null || b === 0) return null;
  return Math.round(((a - b) / b) * 100);
}
function fmtDelta(before: any, after: any): string {
  const b = num(before);
  const a = num(after);
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
  const subj = v.subjective_scores?.[0] ?? null;

  return {
    id: v.id,
    date: v.visit_date,
    menu: v.menu ?? null,
    staff: v.staff ?? null,
    before: before
      ? { rmssd: num(before.rmssd), sdnn: num(before.sdnn), heart_rate: num(before.heart_rate) }
      : null,
    after: after ? { rmssd: num(after.rmssd), sdnn: num(after.sdnn), heart_rate: num(after.heart_rate) } : null,
    subjective: subj
      ? {
          sleep_quality: num(subj.sleep_quality),
          stress: num(subj.stress),
          body_heaviness: num(subj.body_heaviness),
          bedtime: subj.bedtime ?? null,
          alcohol: boolOrNull(subj.alcohol),
          caffeine: boolOrNull(subj.caffeine),
          exercise: boolOrNull(subj.exercise),
        }
      : null,
  };
}

function buildFallbackNextAction(input: any): string {
  // “時間/回数”を必ず入れる
  const s = input?.today?.subjective ?? {};
  const sleepQ = num(s.sleep_quality);
  const stress = num(s.stress);
  const bedtime = typeof s.bedtime === 'string' ? s.bedtime : null;
  const alcohol = s.alcohol === true;
  const caffeine = s.caffeine === true;
  const exercise = s.exercise === true;

  // 優先度の高い順に 1つだけ返す
  if (caffeine) return '次回まで：14時以降はカフェインを避ける（まず3日間）';
  if (alcohol) return '次回まで：就寝前に水をコップ1杯＋深呼吸3分（毎晩）';
  if (sleepQ != null && sleepQ <= 4) return '次回まで：就寝30分前はスマホを置き、呼吸3分×2回';
  if (stress != null && stress >= 6) return '次回まで：4秒吸って6秒吐く呼吸を3分×2回（毎日）';
  if (bedtime) return '次回まで：就寝前に首肩ストレッチ2分＋呼吸2分（毎晩）';
  if (exercise) return '次回まで：軽い散歩10分を週2回（できる範囲で）';
  return '次回まで：就寝前に深呼吸3分×2回（毎日）';
}

async function createCompletion(messages: any[]) {
  // response_format が環境で弾かれる可能性に備えてフォールバック付き
  try {
    return await client.chat.completions.create({
      model: MODEL,
      messages,
      response_format: { type: 'json_object' } as any,
      temperature: 0.7,
      max_tokens: 900,
    });
  } catch (e) {
    // 古い環境などで response_format が未対応の時
    return await client.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 900,
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
          subjective_scores (sleep_quality, stress, body_heaviness, bedtime, alcohol, caffeine, exercise)
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
          subjective_scores (sleep_quality, stress, body_heaviness, bedtime, alcohol, caffeine, exercise)
        `)
        .eq('id', visitId)
        .single();

      if (!error && data) {
        current = normalizeVisit(data);
      }
    }

    // fallback
    const cd = body.fallbackCustomerData ?? {};

    const todayBefore = {
      rmssd: current?.before?.rmssd ?? num(cd.beforeRMSSD),
      sdnn: current?.before?.sdnn ?? num(cd.beforeSDNN),
      heart_rate: current?.before?.heart_rate ?? num(cd.beforeHeartRate),
    };
    const todayAfter = {
      rmssd: current?.after?.rmssd ?? num(cd.afterRMSSD),
      sdnn: current?.after?.sdnn ?? num(cd.afterSDNN),
      heart_rate: current?.after?.heart_rate ?? num(cd.afterHeartRate),
    };
    const todaySubj = {
      sleep_quality: current?.subjective?.sleep_quality ?? num(cd.sleepQuality),
      stress: current?.subjective?.stress ?? num(cd.stress),
      body_heaviness: current?.subjective?.body_heaviness ?? num(cd.bodyHeaviness),
      bedtime: current?.subjective?.bedtime ?? (cd.bedtime ?? null),
      alcohol: current?.subjective?.alcohol ?? boolOrNull(cd.alcohol),
      caffeine: current?.subjective?.caffeine ?? boolOrNull(cd.caffeine),
      exercise: current?.subjective?.exercise ?? boolOrNull(cd.exercise),
    };

    const input = {
      today: {
        date: current?.date ?? new Date().toISOString().slice(0, 10),
        menu: current?.menu ?? cd.menu ?? null,
        staff: current?.staff ?? cd.staff ?? null,
        before: todayBefore,
        after: todayAfter,
        subjective: todaySubj,
        computed: {
          rmssd_diff: diff(todayBefore.rmssd, todayAfter.rmssd),
          rmssd_pct: pct(todayBefore.rmssd, todayAfter.rmssd),
          sdnn_diff: diff(todayBefore.sdnn, todayAfter.sdnn),
          sdnn_pct: pct(todayBefore.sdnn, todayAfter.sdnn),
          hr_diff: diff(todayBefore.heart_rate, todayAfter.heart_rate),
          hr_pct: pct(todayBefore.heart_rate, todayAfter.heart_rate),
        },
      },
      previous: previous
        ? {
            date: previous.date,
            after: previous.after ?? null,
            subjective: previous.subjective ?? null,
          }
        : null,
    };

    const system = `
あなたはリラクゼーションサロンのスタッフとして、お客様に渡す「施術後レポート」を作成します（日本語・丁寧語）。
医療的な診断・治療効果の断定は禁止。「傾向」「〜かもしれません」を用います。

【必須ルール】
- reportは“必ず”複数行（改行あり）で、目安350〜700文字
- 数値を2つ以上引用（RMSSD/SDNN/心拍/主観スコア）
- 「主観（睡眠/ストレス/重だるさ）」に必ず触れる
- bedtime/alcohol/caffeine/exercise は、入力があるものだけ触れる（無いなら無理に書かない）
- セルフケアは最大2つ。必ず「時間 or 回数」を入れる
- next_action は1つだけ。40〜70文字で、時間/回数を必ず入れる（抽象は禁止）

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
`;

    try {
      const res1 = await createCompletion([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]);

      const content1 = res1.choices[0]?.message?.content ?? '{}';

      let report = '';
      let nextAction = '';

      try {
        const parsed = JSON.parse(content1);
        const r = parsed.report;
        const na = parsed.next_action ?? parsed.nextAction ?? parsed.next ?? parsed.action;

        report = typeof r === 'string' ? r.trim() : '';
        nextAction = typeof na === 'string' ? na.trim() : '';
      } catch {
        // ```json ``` 対応（response_formatが効かなかった時の保険）
        const jsonMatch = content1.match(/```json\n([\s\S]*?)\n```/) || content1.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content1;
        try {
          const parsed = JSON.parse(jsonStr);
          report = typeof parsed.report === 'string' ? parsed.report.trim() : '';
          nextAction =
            typeof (parsed.next_action ?? parsed.nextAction) === 'string'
              ? String(parsed.next_action ?? parsed.nextAction).trim()
              : '';
        } catch {
          report = content1;
          nextAction = '';
        }
      }

      // reportが短すぎる or next_actionが空なら “追いプロンプト” で再生成（1回だけ）
      if ((report && report.length < 220) || !nextAction) {
        const strictSystem = system + '\n短すぎる回答は禁止。必ず指定文字数・見出しを満たす。';
        const res2 = await createCompletion([
          { role: 'system', content: strictSystem },
          { role: 'user', content: user },
        ]);
        const content2 = res2.choices[0]?.message?.content ?? '{}';
        try {
          const parsed2 = JSON.parse(content2);
          const r2 = parsed2.report;
          const na2 = parsed2.next_action ?? parsed2.nextAction;
          const report2 = typeof r2 === 'string' ? r2.trim() : '';
          const next2 = typeof na2 === 'string' ? na2.trim() : '';
          if (report2) report = report2;
          if (next2) nextAction = next2;
        } catch {
          // noop
        }
      }

      // それでも next_action が空なら必ずフォールバックを入れる（枠が消えない）
      if (!nextAction) {
        nextAction = buildFallbackNextAction(input);
      }

      // ai_reports 保存（現状互換：report_textのみ保存）
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
      });
    } catch (err) {
      console.error('OpenAI error', err);
      return new Response('OpenAI error', { status: 500 });
    }
  },
};
