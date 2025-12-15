// src/components/CustomerPicker.tsx
import { useEffect, useState } from 'react';

type Customer = {
  id: string;
  customer_no?: number | string; // ✅ stringでも来る可能性あり
  full_name: string;
  phone?: string;
  email?: string;
};

export function CustomerPicker(props: {
  value?: Customer | null;
  onChange: (c: Customer | null) => void;
  apiBase?: string;
}) {
  const API_BASE = props.apiBase ?? (import.meta.env.VITE_API_BASE_URL ?? '');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let alive = true;

    const t = setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`${API_BASE}/api/customers?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
        }

        const json = await res.json();
        if (!alive) return;
        setItems(json.items ?? []);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        console.error('Customer search failed:', e);
        if (!alive) return;
        setError(e?.message ?? '検索に失敗しました');
        setItems([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }, 250);

    return () => {
      alive = false;
      clearTimeout(t);
      controller.abort();
    };
  }, [q, API_BASE]);

  return (
    <div className="space-y-2">
      <input
        className="w-full border rounded px-3 py-2"
        placeholder="お名前 / 顧客番号 / 電話番号で検索"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        inputMode="search"
      />

      {loading && <div className="text-sm text-gray-500">検索中…</div>}
      {error && <div className="text-sm text-red-500">{error}</div>}

      <div className="border rounded divide-y">
        {items.map((c) => (
          <button
            key={c.id}
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-gray-50"
            onClick={() => props.onChange(c)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {c.full_name}
                  {c.customer_no != null && (
                    <span className="ml-2 text-xs text-gray-500">
                      （顧客番号: {String(c.customer_no)}）
                    </span>
                  )}
                </div>
                {(c.phone || c.email) && (
                  <div className="text-xs text-gray-500 truncate">
                    {c.phone ?? c.email}
                  </div>
                )}
              </div>
            </div>
          </button>
        ))}

        {!loading && !error && q.trim() && items.length === 0 && (
          <div className="px-3 py-3 text-sm text-gray-400">該当する顧客が見つかりません</div>
        )}
      </div>
    </div>
  );
}
