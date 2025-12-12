// api/generate-report.ts
import OpenAI from 'openai';
import { supabaseAdmin } from './_supabase';

export const runtime = 'nodejs';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function hrvBar(rmssd?: number): string {
  if (typeof rmssd !== 'number' || Number.isNaN(rmssd)) return '■□□□□';
  if (rmssd <= 10) return '■□□□□';
  if (rmssd <= 20) return '■■□□□';
  if (rmssd <= 30) return '■■■□□';
  if (rmssd <= 40) return '■■■■□';
  return '■■■■■';
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const body = await request.json().catch(() => null);
    if (!body) return new Response('Invalid JSON', { status: 400 });

    // body: { customer_id?: string; visit_id?: string; fallbackCustomerData?: any }
    const customerId: string | undefined = body.customer_id;
    const visitId: string | undefined = body.visit_id;

    // プロンプト材料を DB から取得（なければフォールバック）
    let current: any = null;
    let previous: any = null;

    if (customerId) {
      const { data, error } = await supabaseAdmin
        .from('visits')
        .select(`
          id, visit_date, staff, menu,
          hrv_measurements (phase, rmssd, sdnn, heart_rate),
          subjective_scores (sleep_quality, stress, body_heaviness)
        `)
        .eq('customer_id', customerId)
        .order('visit_date', { ascending: false })
        .limit(2);

      if (!error && data) {
        const norm = (v: any) => {
          if (!v) return null;
          const before = v.hrv_measurements?.find((m: any) => m.phase === 'before') ?? null;
          const after = v.hrv_measurements?.find((m: any) => m.phase === 'after') ?? null;
          return {
            id: v.id,
            date: v.visit_date,
            menu: v.menu,
            staff: v.staff,
            before,
            after,
            subjective: v.subjective_scores?.[0] ?? null,
          };
        };
        current = norm(data[0]);
        previous = norm(data[1]);
      }
    }

    // visit_id 指定時は current をその visit 固定に
    if (visitId) {
      const { data, error } = await supabaseAdmin
        .from('visits')
        .select(`
          id, visit_date, staff, menu,
          hrv_measurements (phase, rmssd, sdnn, heart_rate),
          subjective_scores (sleep_quality, stress, body_heaviness)
        `)
        .eq('id', visitId)
        .single();
      if (!error && data) {
        const before = data.hrv_measurements?.find((m: any) => m.phase === 'before') ?? null;
        const after = data.hrv_measurements?.find((m: any) => m.phase === 'after') ?? null;
        current = {
          id: data.id,
          date: data.visit_date,
          menu: data.menu,
          staff: data.staff,
          before,
          after,
          subjective: data.subjective_scores?.[0] ?? null,
        };
      }
    }

    // 何もなければフロントからのフォールバックデータに頼る
    const cd = body.fallbackCustomerData ?? {};
    const line = (k: string, v: any) => (v == null ? '' : `- ${k}: ${v}\n`);

    const prompt = `
あなたは、リラクゼーションサロンのカウンセリングレポートを日本語で簡潔に作成するアシスタントです。
数値の過剰解釈は避け、生活アドバイスは具体的に1～3個に留めます。

[今回(本日)]
${current ? `日付: ${current.date}\nメニュー: ${current.menu ?? ''}\n担当: ${current.staff ?? ''}\nRMSSD(前→後): ${current?.before?.rmssd ?? '-'} → ${current?.after?.rmssd ?? '-'} ${hrvBar(current?.after?.rmssd)}
SDNN(前→後): ${current?.before?.sdnn ?? '-'} → ${current?.after?.sdnn ?? '-'}
主観スコア(睡眠/ストレス/重だるさ): ${current?.subjective?.sleep_quality ?? '-'} / ${current?.subjective?.stress ?? '-'} / ${current?.subjective?.body_heaviness ?? '-'}
` : `（フォールバック）${line('RMSSD(前)', cd.beforeRMSSD)}${line('RMSSD(後)', cd.afterRMSSD)}${line('SDNN(前)', cd.beforeSDNN)}${line('SDNN(後)', cd.afterSDNN)}`}

[前回]
${previous ? `日付: ${previous.date}\nRMSSD(前回 After): ${previous?.after?.rmssd ?? '-'}\nSDNN(前回 After): ${previous?.after?.sdnn ?? '-'}\n` : 'データなし'}

出力はJSON形式で以下の構造で返してください：
{
  "report": "見出し・要約（3～5行）、本日の変化の解釈（安全運転）、セルフケア提案（1～3個）、次回来店までの目安を含むレポート本文",
  "next_action": "次回来店までの具体的な1アクション（30文字以内の短い行動提案）"
}
`;

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.choices[0]?.message?.content ?? '';

      // JSONをパース
      let report = '';
      let nextAction = '';

      try {
        // ```json ``` で囲まれている場合に対応
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
        const parsed = JSON.parse(jsonStr);
        report = parsed.report || content;
        nextAction = parsed.next_action || '';
      } catch (e) {
        // JSONパースに失敗した場合はそのまま使用
        report = content;
        nextAction = '';
      }

      // 保存（visit_id があれば紐付け）
      let savedId: string | null = null;
      const { data: saved, error } = await supabaseAdmin
        .from('ai_reports')
        .insert({
          visit_id: current?.id ?? null,
          model: 'gpt-4o-mini',
          report_text: report,
        })
        .select('id')
        .single();

      if (!error && saved) savedId = saved.id;

      return Response.json({ report, next_action: nextAction, report_id: savedId });
    } catch (err) {
      console.error('OpenAI error', err);
      return new Response('OpenAI error', { status: 500 });
    }
  },
};