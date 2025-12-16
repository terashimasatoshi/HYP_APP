// api/last-two-visits.ts
import { supabaseAdmin } from './_supabase';

export const runtime = 'nodejs';

function pickNum(v: any): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function pickBool(v: any): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

type Subj = {
  sleep_quality?: number | null;
  stress?: number | null;
  body_heaviness?: number | null;
  bedtime?: string | null;
  alcohol?: boolean | null;
  caffeine?: boolean | null;
  exercise?: boolean | null;
};

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const customerId = url.searchParams.get('customer_id');
    if (!customerId) return new Response('customer_id is required', { status: 400 });

    // =========================
    // 最新2件の visit を取得
    // 同日複数回でも安定するよう created_at DESC 優先
    // =========================
    let visits: any[] | null = null;

    {
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
        .order('created_at', { ascending: false }) // ✅ ここが重要
        .order('visit_date', { ascending: false }) // 保険
        .limit(2);

      if (error) {
        // created_at が無い環境のフォールバック（※できればDBにcreated_atを追加推奨）
        const msg = String((error as any).message ?? '');
        const looksLikeMissingColumn = msg.includes('created_at') || msg.includes('column') || msg.includes('42703');

        if (!looksLikeMissingColumn) {
          return new Response(error.message, { status: 500 });
        }

        const { data: data2, error: error2 } = await supabaseAdmin
          .from('visits')
          .select(
            `
            id, customer_id, visit_date, staff, menu,
            hrv_measurements (phase, rmssd, sdnn, heart_rate),
            subjective_scores (phase, sleep_quality, stress, body_heaviness, bedtime, alcohol, caffeine, exercise)
          `
          )
          .eq('customer_id', customerId)
          .order('visit_date', { ascending: false })
          .limit(2);

        if (error2) return new Response(error2.message, { status: 500 });
        visits = data2 ?? [];
      } else {
        visits = data ?? [];
      }
    }

    const visitIds = (visits ?? []).map((v: any) => v.id);

    // =========================
    // ai_reports を visit_id で引いて紐付ける（最新の1件だけ）
    // =========================
    const reportByVisitId = new Map<string, string>();
    if (visitIds.length > 0) {
      const { data: reports, error: rErr } = await supabaseAdmin
        .from('ai_reports')
        .select('visit_id, report_text, created_at')
        .in('visit_id', visitIds)
        .order('created_at', { ascending: false });

      // visit_idごとに最初の1件（created_at desc の先頭）を採用
      if (!rErr && reports) {
        for (const r of reports as any[]) {
          if (r?.visit_id && !reportByVisitId.has(r.visit_id)) {
            reportByVisitId.set(r.visit_id, r.report_text ?? '');
          }
        }
      }
    }

    // =========================
    // normalize
    // =========================
    const normalize = (v: any) => {
      const before = v.hrv_measurements?.find((m: any) => m.phase === 'before') ?? null;
      const after = v.hrv_measurements?.find((m: any) => m.phase === 'after') ?? null;

      const sb = v.subjective_scores?.find((s: any) => s.phase === 'before') ?? null;
      const sa = v.subjective_scores?.find((s: any) => s.phase === 'after') ?? null;

      const toSubj = (row: any): Subj | null => {
        if (!row) return null;
        return {
          sleep_quality: pickNum(row.sleep_quality),
          stress: pickNum(row.stress),
          body_heaviness: pickNum(row.body_heaviness),
          bedtime: row.bedtime ?? null,
          alcohol: pickBool(row.alcohol),
          caffeine: pickBool(row.caffeine),
          exercise: pickBool(row.exercise),
        };
      };

      const subjective_before = toSubj(sb);
      const subjective_after = toSubj(sa);

      return {
        id: v.id,
        date: v.visit_date,
        created_at: v.created_at ?? null,
        staff: v.staff,
        menu: v.menu,
        before,
        after,

        // ✅ phase別で返す（新仕様）
        subjective_before,
        subjective_after,

        // ✅ 互換用：旧UIが subjectve だけ見てても壊れないように入れておく
        // （基本は before を優先。無ければ after）
        subjective: subjective_before ?? subjective_after ?? null,

        ai_report: reportByVisitId.get(v.id) ?? null,
      };
    };

    const normalized = (visits ?? []).map(normalize);
    const current = normalized[0] ?? null;
    const previous = normalized[1] ?? null;

    return Response.json({ current, previous });
  },
};
