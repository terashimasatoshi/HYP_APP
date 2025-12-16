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

type SubjectiveBefore = {
  // 新仕様（snake_case）
  sleep_quality?: number;
  stress?: number;
  body_heaviness?: number;
  bedtime?: string; // "HH:MM" or "HH:MM:SS"
  alcohol?: boolean;
  caffeine?: boolean;
  exercise?: boolean;

  // 互換（camelCase）
  sleepQuality?: number;
  bodyHeaviness?: number;
};

type SubjectiveAfter = {
  // 新仕様（snake_case）
  sleep_quality?: number;
  stress?: number;
  body_heaviness?: number;

  // 互換（camelCase）
  sleepQuality?: number;
  bodyHeaviness?: number;
};

function normalizeTimeToHHMMSS(t?: string | null): string | null {
  if (!t) return null;
  const s = String(t).trim();
  if (!s) return null;
  // "23:00" -> "23:00:00"
  if (s.length === 5 && /^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  // "23:00:00" はそのまま
  return s;
}

function pickNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const payload = await request.json().catch(() => null);
    if (!payload) return new Response('Invalid JSON', { status: 400 });

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
          // ここは来る可能性があるものだけ入れる（無ければnull）
          customer_no: payload?.customer?.customer_no ?? null,
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

    const hrvRows: any[] = [];
    if (before) hrvRows.push({ visit_id: visitId, phase: 'before', ...before });
    if (after) hrvRows.push({ visit_id: visitId, phase: 'after', ...after });

    if (hrvRows.length) {
      const { error: hErr } = await supabaseAdmin.from('hrv_measurements').insert(hrvRows);
      if (hErr) return new Response(hErr.message, { status: 500 });
    }

    // =========================
    // 主観スコア（before/after）
    // =========================
    // 新仕様：
    //   payload.subjective_before（phase='before'）
    //   payload.subjective_after  （phase='after'）
    //
    // 互換仕様（旧）：
    //   payload.subjective -> before扱い（今までのフロントが送ってた形式）
    const sbBefore: SubjectiveBefore | undefined =
      payload?.subjective_before ?? payload?.subjective ?? undefined;

    const sbAfter: SubjectiveAfter | undefined = payload?.subjective_after ?? undefined;

    const subjectiveRows: any[] = [];

    // before（施術前）
    if (sbBefore) {
      subjectiveRows.push({
        visit_id: visitId,
        phase: 'before',
        sleep_quality: pickNumber(sbBefore.sleep_quality ?? sbBefore.sleepQuality),
        stress: pickNumber(sbBefore.stress),
        body_heaviness: pickNumber(sbBefore.body_heaviness ?? sbBefore.bodyHeaviness),
        bedtime: normalizeTimeToHHMMSS((sbBefore as any).bedtime ?? null),
        alcohol: Boolean((sbBefore as any).alcohol),
        caffeine: Boolean((sbBefore as any).caffeine),
        exercise: Boolean((sbBefore as any).exercise),
      });
    }

    // after（施術後）
    if (sbAfter) {
      subjectiveRows.push({
        visit_id: visitId,
        phase: 'after',
        sleep_quality: pickNumber(sbAfter.sleep_quality ?? sbAfter.sleepQuality),
        stress: pickNumber(sbAfter.stress),
        body_heaviness: pickNumber(sbAfter.body_heaviness ?? sbAfter.bodyHeaviness),
        // 施術後は「3スライダーのみ」の想定なので生活習慣は入れない（必要なら後で追加OK）
      });
    }

    if (subjectiveRows.length) {
      // ✅ (visit_id, phase) のユニーク制約/Index がある前提で upsert
      const { error: sErr } = await supabaseAdmin
        .from('subjective_scores')
        .upsert(subjectiveRows, { onConflict: 'visit_id,phase' });

      if (sErr) return new Response(sErr.message, { status: 500 });
    }

    return Response.json({ visit_id: visitId, customer_id: ensuredCustomerId });
  },
};
