// api/generate-report.ts
import OpenAI from 'openai';
import { supabaseAdmin } from './_supabase';

export const runtime = 'nodejs';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// envで切り替え可能（例：gpt-4o / gpt-4o-mini）
const MODEL = process.env.OPENAI_REPORT_MODEL || 'gpt-4o-mini';

type NormalizedVisit = {
  id: string;
  customer_id?: string | null;
  date: string;
  menu?: string | null;
  staff?: string | null;
  before?: { rmssd?: number | null; sdnn?: number | null; heart_rate?: number | null } | null;
  after?: { rmssd?: number | null; sdnn?: number | null; heart_rate?: number | null } | null;
  subjective?: {
    sleep_quality?: number | null;
    stress?: number | null;
    body_heaviness?: number | null;
    bedtime?: string | null; // "HH:MM:SS" など
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

function menuHint(menu?: string | null): string {
  const m = (menu ?? '').toLowerCase();
  if (!m) return '';
  if (m.includes('深眠') || m.includes('ディープスリープ')) {
    return 'メニューは睡眠・休息の質に寄せた施術。睡眠負債/交感神経優位の緩和観点で書く。';
  }
  if (m.includes('炭酸')) {
    return 'メニューは炭酸系。頭皮のこわばり/巡り/リフレッシュ感の観点で書く。';
  }
  if (m.includes('フュージョン')) {
    return 'メニューは全身寄り。疲労感/回復感/睡眠の質をまとめて書く。';
  }
  return 'リラクゼーション施術として、休息・緊張緩和の観点で書く。';
}

function normalizeVisit(v: any): NormalizedVisit | null {
  if (!v) return null;

  const before = v.hrv_measurements?.find((m: any) => m.phase === 'before') ?? null;
  const after = v.hrv_measurements?.find((m: any) => m.phase === 'after') ?? null;
  const subj = v.subjective_scores?.[0] ?? null;

  return {
    id: v.id,
    customer_id: v.customer_id ?? null,
    date: v.visit_date,
    menu: v.menu ?? null,
    staff: v.staff ?? null,
    before: before
      ? {
          rmssd: num(before.rmssd),
          sdnn: num(before.sdnn),
          heart_rate: num(before.heart_rate),
        }
      : null,
    after: after
      ? {
          rmssd: num(after.rmssd),
          sdnn: num(after.sdnn),
          heart_rate: num(after.heart_rate),
        }
      : null,
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

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const body = await request.json().catch(() => null);
    if (!body) return new Response('Invalid JSON', { status: 400 });

    const customerId: string | undefined = body.customer_id;
    const visitId: string | undefined = body.visit_id;

    // auto保存は互換維持でデフォルトON（不要なら false を渡してOFF）
    // 例：AIReportScreenから { auto_save: false } を送れば保存しない
    const autoSave: boolean = body.auto_save !== false;

    // プロンプト材料を DB から取得（なければフォールバック）
    let current: NormalizedVisit | null = null;
    let previous: NormalizedVisit | null = null;

    // 1) customer_id の最新2件
    if (customerId) {
      const { data, error } = await supabaseAdmin
        .from('visits')
        .select(
          `
          id, customer_id, visit_date, staff, menu,
          hrv_measurements (phase, rmssd, sdnn, heart_rate),
          subjective_scores (sleep_quality, stress, body_heaviness, bedtime, alcohol, caffeine, exercise)
        `
        )
        .eq('customer_id', customerId)
        .order('visit_date', { ascending: false })
        .limit(2);

      if (!error && data) {
        current = normalizeVisit(data[0]);
        previous = normalizeVisit(data[1]);
      }
    }

    // 2) visit_id 指定時は current をその visit に固定
    //    （customer_id 未指定でも、このvisitのcustomer_idから前回を補完できるよう customer_id もselectしている）
    if (visitId) {
      const { data, error } = await supabaseAdmin
        .from('visits')
        .select(
          `
          id, customer_id, visit_date, staff, menu,
          hrv_measurements (phase, rmssd, sdnn, heart_rate),
          subjective_scores (sleep_quality, stress, body_heaviness, bedtime, alcohol, caffeine, exercise)
        `
        )
        .eq('id', visitId)
        .single();

      if (!error && data) {
        current = normalizeVisit(data);

        // previousが無いなら、current.customer_id で補完（自分自身は除外）
        if (!previous && current?.customer_id) {
          const { data: pv, error: pvErr } = await supabaseAdmin
            .from('visits')
            .select(
              `
              id, customer_id, visit_date, staff, menu,
              hrv_measurements (phase, rmssd, sdnn, heart_rate),
              subjective_scores (sleep_quality, stress, body_heaviness, bedtime, alcohol, caffeine, exercise)
            `
            )
            .eq('customer_id', current.customer_id)
            .neq('id', current.id)
            .order('visit_date', { ascending: false })
            .limit(1);

          if (!pvErr && pv && pv[0]) previous = normalizeVisit(pv[0]);
        }
      }
    }

    // 3) 何もなければフロントからのフォールバックデータに頼る
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

    const todaySubjective = {
      sleep_quality: current?.subjective?.sleep_quality ?? num(cd.sleepQuality),
      stress: current?.subjective?.stress ?? num(cd.stress),
      body_heaviness: current?.subjective?.body_heaviness ?? num(cd.bodyHeaviness),
      bedtime: current?.subjective?.bedtime ?? (cd.bedtime ?? null),
      alcohol: current?.subjective?.alcohol ?? boolOrNull(cd.alcohol),
      caffeine: current?.subjective?.caffeine ?? boolOrNull(cd.caffeine),
      exercise: current?.subjective?.exercise ?? boolOrNull(cd.exercise),
    };

    const computed = {
      rmssd_diff: diff(todayBefore.rmssd, todayAfter.rmssd),
      rmssd_pct: pct(todayBefore.rmssd, todayAfter.rmssd),
      sdnn_diff: diff(todayBefore.sdnn, todayAfter.sdnn),
      sdnn_pct: pct(todayBefore.sdnn, todayAfter.sdnn),
      hr_diff: diff(todayBefore.heart_rate, todayAfter.heart_rate),
      hr_pct: pct(todayBefore.heart_rate, todayAfter.heart_rate),
    };

    const dataForAI = {
      today: {
        date: current?.date ?? new Date().toISOString().slice(0, 10),
        menu: current?.menu ?? cd.menu ?? null,
        staff: current?.staff ?? cd.staff ?? null,
        before: todayBefore,
        after: todayAfter,
        subjective: todaySubjective,
        computed,
      },
      previous: previous
        ? {
            date: previous.date,
            menu: previous.menu ?? null,
            after: previous.after ?? null,
            subjective: previous.subjective ?? null,
          }
        : null,
      note: menuHint(current?.menu ?? cd.menu ?? null),
    };

    // ===== プロンプト（ここが品質の肝） =====
    const system = `
あなたはリラクゼーションサロンのスタッフとして、お客様に渡す「施術後レポート」を作成します（日本語・丁寧語）。
医療的な診断や治療効果の断定はしません。「傾向」「〜かもしれません」を使い、安全運転で書きます。

【品質ルール（必須）】
- report内で必ず数値を2つ以上引用し、前→後の変化を明確に書く（RMSSD/SDNN/心拍/主観スコア）
- previousがある場合、「前回との差」に必ず1行触れる（数値 or 主観）
- 生活背景（就寝時間/アルコール/カフェイン/運動）で、入力があるものに必ず触れる（無い場合は触れない）
- セルフケア提案は最大2つ。必ず「時間」または「回数」を含める（例：3分×2回、10分、週2回）
- next_action は1つだけ。40〜60文字程度で、時間/回数を必ず含める。抽象的な表現は禁止。

【reportの構成（この順で）】
1) 本日のまとめ（2行）
2) 数値の変化（箇条書き2〜3行）
3) 主観・生活背景の観点（1〜2行）
4) セルフケア（1〜2個）
5) 次回来店の目安（1行：例「1〜2週間以内」など。データが弱い時は一般的に）

【出力形式】
必ずJSONのみ：
{
  "report": "...",
  "next_action": "..."
}
`;

    const user = `次のDATAだけを根拠に、上記ルールに従って作成してください。\n\nDATA:\n${JSON.stringify(
      dataForAI,
      null,
      2
    )}`;

    try {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        // ✅ JSON出力を安定化（パース失敗を激減）
        response_format: { type: 'json_object' },
        temperature: 0.6,
        max_tokens: 700,
      });

      const content = response.choices[0]?.message?.content ?? '{}';

      let report = '';
      let nextAction = '';

      try {
        const parsed = JSON.parse(content);
        report = typeof parsed.report === 'string' ? parsed.report.trim() : '';
        nextAction = typeof parsed.next_action === 'string' ? parsed.next_action.trim() : '';
      } catch {
        // まれに壊れた場合の保険
        report = content;
        nextAction = '';
      }

      // =====（互換維持）ここで自動保存（不要なら auto_save:false でOFFにできる）=====
      let savedId: string | null = null;

      if (autoSave) {
        const basePayload: any = {
          visit_id: current?.id ?? null,
          model: MODEL,
          report_text: report,
        };

        // next_action列があるDBなら保存、無ければ無視できるようにtryする
        const payloadWithNext: any = {
          ...basePayload,
          next_action: nextAction || null,
        };

        // upsertできるなら重複しにくい（visit_idにユニーク制約がある場合）
        const trySave = async (payload: any) => {
          // 1) upsert（visit_id unique がある時に効く）
          const up = await supabaseAdmin
            .from('ai_reports')
            .upsert(payload, { onConflict: 'visit_id' })
            .select('id')
            .single();

          if (!up.error && up.data?.id) return up.data.id as string;

          // 2) upsertがダメならinsert
          const ins = await supabaseAdmin.from('ai_reports').insert(payload).select('id').single();
          if (!ins.error && ins.data?.id) return ins.data.id as string;

          // 失敗時ログだけ
          console.error('ai_reports save error:', up.error ?? ins.error);
          return null;
        };

        // next_action列が無い場合に備えてフォールバック
        const id1 = await trySave(payloadWithNext);
        if (id1) {
          savedId = id1;
        } else {
          // next_actionが原因で落ちた可能性があるので、最小payloadで再トライ
          const id2 = await trySave(basePayload);
          if (id2) savedId = id2;
        }
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
