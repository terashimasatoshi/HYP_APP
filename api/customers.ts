// api/customers.ts
import { supabaseAdmin } from './_supabase';

export const runtime = 'nodejs';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // ===== 検索 =====
    // GET /api/customers?q=...
    if (request.method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').trim();
      if (!q) return Response.json({ items: [] });

      const like = `%${q}%`;
      const isNumeric = /^\d+$/.test(q);

      let query = supabaseAdmin
        .from('customers')
        .select('id, customer_no, full_name, phone, email, gender, birthdate')
        .order('customer_no', { ascending: false })
        .limit(30);

      // 数字なら customer_no も検索対象に入れる（完全一致）
      query = isNumeric
        ? query.or(`full_name.ilike.${like},phone.ilike.${like},customer_no.eq.${q}`)
        : query.or(`full_name.ilike.${like},phone.ilike.${like}`);

      const { data, error } = await query;

      if (error) return new Response(error.message, { status: 500 });
      return Response.json({ items: data ?? [] });
    }

    // ===== 登録/更新 =====
    // POST /api/customers
    if (request.method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body?.full_name) return new Response('full_name is required', { status: 400 });

      // customer_no が入力されてたら数値化（空なら undefined）
      const customerNo =
        body.customer_no === '' || body.customer_no === null || body.customer_no === undefined
          ? undefined
          : Number(body.customer_no);

      if (customerNo !== undefined && (!Number.isFinite(customerNo) || customerNo <= 0)) {
        return new Response('customer_no must be a positive number', { status: 400 });
      }

      // 更新
      if (body.id) {
        const { data, error } = await supabaseAdmin
          .from('customers')
          .update({
            customer_no: customerNo, // undefinedなら更新しない
            full_name: body.full_name,
            phone: body.phone ?? null,
            email: body.email ?? null,
            gender: body.gender ?? null,
            birthdate: body.birthdate ?? null,
          })
          .eq('id', body.id)
          .select('id, customer_no')
          .single();

        if (error) {
          // 顧客番号重複
          if ((error as any).code === '23505') {
            return new Response('顧客番号が既に使われています', { status: 409 });
          }
          return new Response(error.message, { status: 500 });
        }
        return Response.json({ id: data!.id, customer_no: data!.customer_no });
      }

      // 新規登録
      const insertPayload: any = {
        full_name: body.full_name,
        phone: body.phone ?? null,
        email: body.email ?? null,
        gender: body.gender ?? null,
        birthdate: body.birthdate ?? null,
      };

      // 入力があるときだけ customer_no をセット（空ならDB側の採番/デフォルトに任せる）
      if (customerNo !== undefined) insertPayload.customer_no = customerNo;

      const { data, error } = await supabaseAdmin
        .from('customers')
        .insert(insertPayload)
        .select('id, customer_no')
        .single();

      if (error) {
        if ((error as any).code === '23505') {
          return new Response('顧客番号が既に使われています', { status: 409 });
        }
        return new Response(error.message, { status: 500 });
      }

      return Response.json({ id: data!.id, customer_no: data!.customer_no });
    }

    return new Response('Method Not Allowed', { status: 405 });
  },
};
