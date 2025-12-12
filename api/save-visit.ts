// api/save-visit.ts
import { supabaseAdmin } from './_supabase';

export const runtime = 'nodejs';

type HRV = {
  rmssd?: number;
  sdnn?: number;
  heart_rate?: number;
  artifact_pct?: number;
  duration_seconds?: number;
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const payload = await request.json().catch(() => null);

    // 必須チェック
    const customerId: string | undefined = payload?.customer?.id;
    const fullName: string | undefined = payload?.customer?.full_name;
    if (!customerId && !fullName) {
      return new Response('customer.id or customer.full_name is required', { status: 400 });
    }

    // 顧客ID未指定なら作成
    let ensuredCustomerId = customerId;
    if (!ensuredCustomerId) {
      const { data, error } = await supabaseAdmin
        .from('customers')
        .insert({
          full_name: fullName!,
          phone: payload?.customer?.phone ?? null,
          email: payload?.customer?.email ?? null,
          gender: payload?.customer?.gender ?? null,
          birthdate: payload?.customer?.birthdate ?? null,
          notes: payload?.customer?.notes ?? null,
        })
        .select('id')
        .single();

      if (error) return new Response(error.message, { status: 500 });
      ensuredCustomerId = data!.id;
    }

    // visit 作成
    const visitDate = payload?.visit?.visit_date ?? null; // "YYYY-MM-DD"
    const { data: visit, error: vErr } = await supabaseAdmin
      .from('visits')
      .insert({
        customer_id: ensuredCustomerId!,
        visit_date: visitDate,
        staff: payload?.visit?.staff ?? null,
        menu: payload?.visit?.menu ?? null,
        notes: payload?.visit?.notes ?? null,
      })
      .select('id')
      .single();

    if (vErr) return new Response(vErr.message, { status: 500 });

    const visitId = visit!.id as string;

    // HRV（before/after）
    const before: HRV | undefined = payload?.before;
    const after: HRV | undefined = payload?.after;

    const rows: any[] = [];
    if (before) rows.push({ visit_id: visitId, phase: 'before', ...before });
    if (after) rows.push({ visit_id: visitId, phase: 'after', ...after });

    if (rows.length) {
      const { error: hErr } = await supabaseAdmin.from('hrv_measurements').insert(rows);
      if (hErr) return new Response(hErr.message, { status: 500 });
    }

    // 主観スコア
    const s = payload?.subjective;
    if (s) {
      const { error: sErr } = await supabaseAdmin.from('subjective_scores').insert({
        visit_id: visitId,
        sleep_quality: s.sleepQuality ?? null,
        stress: s.stress ?? null,
        body_heaviness: s.bodyHeaviness ?? null,
        bedtime: s.bedtime ? (s.bedtime.length === 5 ? s.bedtime + ':00' : s.bedtime) : null,
        alcohol: !!s.alcohol,
        caffeine: !!s.caffeine,
        exercise: !!s.exercise,
      });
      if (sErr) return new Response(sErr.message, { status: 500 });
    }

    return Response.json({ visit_id: visitId, customer_id: ensuredCustomerId });
  },
};