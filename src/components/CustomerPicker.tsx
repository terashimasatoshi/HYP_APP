// src/components/CustomerPicker.tsx
import { useEffect, useState } from 'react';

type Customer = { id: string; full_name: string; phone?: string; email?: string };

export function CustomerPicker(props: {
  value?: Customer | null;
  onChange: (c: Customer | null) => void;
  apiBase?: string;
}) {
  const API_BASE = props.apiBase ?? (import.meta.env.VITE_API_BASE_URL ?? '');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignore = false;
    if (!q) { setItems([]); return; }
    setLoading(true);
    fetch(`${API_BASE}/api/customers?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(res => { if (!ignore) setItems(res.items ?? []); })
      .finally(() => setLoading(false));
    return () => { ignore = true; };
  }, [q, API_BASE]);

  return (
    <div className="space-y-2">
      <input
        className="w-full border rounded px-3 py-2"
        placeholder="お客様名で検索"
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      {loading && <div className="text-sm text-gray-500">検索中…</div>}
      <div className="border rounded divide-y">
        {items.map((c) => (
          <button
            key={c.id}
            className="w-full text-left px-3 py-2 hover:bg-gray-50"
            onClick={() => props.onChange(c)}
          >
            {c.full_name} <span className="text-xs text-gray-500">{c.phone ?? c.email ?? ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}