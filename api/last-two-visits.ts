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
      };
    };

    const [current, previous] = (visits ?? []).map(normalize);
    return Response.json({ current, previous });
  },
};