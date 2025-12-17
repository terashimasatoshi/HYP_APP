import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin as supabase } from './_supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORSヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { visit_id } = req.query;

  if (!visit_id || typeof visit_id !== 'string') {
    return res.status(400).json({ error: 'visit_id is required' });
  }

  try {
    // visitデータを取得（顧客名も含む）
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select(`
        id,
        visit_date,
        menu,
        staff,
        customer_id,
        customers (
          full_name
        )
      `)
      .eq('id', visit_id)
      .single();

    if (visitError || !visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    // HRV測定データを取得
    const { data: measurements } = await supabase
      .from('hrv_measurements')
      .select('timing, rmssd, sdnn, heart_rate')
      .eq('visit_id', visit_id);

    const before = measurements?.find((m) => m.timing === 'before');
    const after = measurements?.find((m) => m.timing === 'after');

    // 診断データを取得
    const { data: diagnosis } = await supabase
      .from('diagnoses')
      .select('report_text, next_action')
      .eq('visit_id', visit_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // RMSSD改善率を計算
    let improvementRate = 0;
    if (before?.rmssd && after?.rmssd && before.rmssd > 0) {
      improvementRate = Math.round(((after.rmssd - before.rmssd) / before.rmssd) * 100);
    }

    // 顧客名を取得（JOINの結果から）
    const customerName = (visit.customers as any)?.full_name || '顧客';

    return res.status(200).json({
      visit_id: visit.id,
      visit_date: visit.visit_date,
      customer_name: customerName,
      menu: visit.menu,
      before_rmssd: before?.rmssd || null,
      after_rmssd: after?.rmssd || null,
      improvement_rate: improvementRate,
      report_text: diagnosis?.report_text || null,
      next_action: diagnosis?.next_action || null,
    });
  } catch (err) {
    console.error('get-report error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
