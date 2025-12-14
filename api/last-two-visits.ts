// api/last-two-visits.ts
import { supabaseAdmin } from './_supabase';

export const runtime = 'nodejs';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const customerId = url.searchParams.get('customer_id');
    if (!customerId) return new Response('customer_id is required', { status: 400 });

    // 最新2件の visit と紐づく before/after・主観スコアを付けて返す
    const { data: visits, error } = await supabaseAdmin
      .from('visits')
      .select(`
        id, visit_date, staff, menu,
        hrv_measurements (phase, rmssd, sdnn, heart_rate),
        subjective_scores (sleep_quality, stress, body_heaviness)
      `)
      .eq('customer_id', customerId)
      .order('visit_date', { ascending: false })
      .limit(2);

    if (error) return new Response(error.message, { status: 500 });

    const visitIds = (visits ?? []).map((v: any) => v.id);

    // ai_reports を visit_id で引いて紐付ける（最新の1件だけ）
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

    const normalize = (v: any) => {
      const before = v.hrv_measurements?.find((m: any) => m.phase === 'before') ?? null;
      const after = v.hrv_measurements?.find((m: any) => m.phase === 'after') ?? null;
      return {
        id: v.id,
        date: v.visit_date,
        staff: v.staff,
        menu: v.menu,
        before,
        after,
        subjective: v.subjective_scores?.[0] ?? null,
        ai_report: reportByVisitId.get(v.id) ?? null,
      };
    };

    const [current, previous] = (visits ?? []).map(normalize);
    return Response.json({ current, previous });
  },
};
