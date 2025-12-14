// api/save-diagnosis.ts
import { supabaseAdmin } from './_supabase';

export const runtime = 'nodejs';

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const body = await request.json().catch(() => null);
    if (!body) return new Response('Invalid JSON', { status: 400 });

    const visitId: string | undefined = body.visit_id;
    const reportTextRaw: string = body.report_text ?? body.report ?? '';
    const nextAction: string = body.next_action ?? '';
    const model: string | null = body.model ?? null;

    if (!visitId) return new Response('visit_id is required', { status: 400 });
    if (!reportTextRaw && !nextAction) {
      return new Response('report_text or next_action is required', { status: 400 });
    }

    // next_action を別カラムに持てない環境でも保存できるように report_text に統合
    const combinedReportText =
      nextAction && !reportTextRaw.includes('次回までの1アクション')
        ? `${reportTextRaw}\n\n---\n次回までの1アクション：${nextAction}\n`
        : reportTextRaw;

    // すでに同じ visit_id のレポートがあるなら UPDATE、なければ INSERT
    const { data: existing, error: exErr } = await supabaseAdmin
      .from('ai_reports')
      .select('id')
      .eq('visit_id', visitId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (exErr) return new Response(exErr.message, { status: 500 });

    if (existing && existing.length > 0) {
      const reportId = existing[0].id;

      const { error: upErr } = await supabaseAdmin
        .from('ai_reports')
        .update({
          report_text: combinedReportText,
          model: model,
        })
        .eq('id', reportId);

      if (upErr) return new Response(upErr.message, { status: 500 });
      return Response.json({ ok: true, report_id: reportId, updated: true });
    }

    const { data: inserted, error: inErr } = await supabaseAdmin
      .from('ai_reports')
      .insert({
        visit_id: visitId,
        model: model,
        report_text: combinedReportText,
      })
      .select('id')
      .single();

    if (inErr) return new Response(inErr.message, { status: 500 });
    return Response.json({ ok: true, report_id: inserted?.id, inserted: true });
  },
};
