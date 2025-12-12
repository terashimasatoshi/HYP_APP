// api/customers.ts
import { supabaseAdmin } from './_supabase';

export const runtime = 'nodejs';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 検索: GET /api/customers?q=...
    if (request.method === 'GET') {
      const q = url.searchParams.get('q')?.trim();
      if (!q) return Response.json({ items: [] });

      const { data, error } = await supabaseAdmin
        .from('customers')
        .select('id, full_name, phone, email')
        .ilike('full_name', `%${q}%`)
        .limit(20);

      if (error) return new Response(error.message, { status: 500 });
      return Response.json({ items: data ?? [] });
    }

    // 追加/更新: POST /api/customers
    if (request.method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body?.full_name) return new Response('full_name is required', { status: 400 });

      if (body.id) {
        const { data, error } = await supabaseAdmin
          .from('customers')
          .update({
            full_name: body.full_name,
            phone: body.phone ?? null,
            email: body.email ?? null,
            gender: body.gender ?? null,
            birthdate: body.birthdate ?? null,
            notes: body.notes ?? null,
          })
          .eq('id', body.id)
          .select('id')
          .single();

        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ id: data!.id });
      } else {
        const { data, error } = await supabaseAdmin
          .from('customers')
          .insert({
            full_name: body.full_name,
            phone: body.phone ?? null,
            email: body.email ?? null,
            gender: body.gender ?? null,
            birthdate: body.birthdate ?? null,
            notes: body.notes ?? null,
          })
          .select('id')
          .single();

        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ id: data!.id });
      }
    }

    return new Response('Method Not Allowed', { status: 405 });
  },
};