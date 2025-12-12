// src/components/ImprovementChart.tsx
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

type Point = { label: string; before?: number; after?: number };
type Props = {
  current?: { before?: { rmssd?: number; sdnn?: number }; after?: { rmssd?: number; sdnn?: number } };
  previous?: { after?: { rmssd?: number; sdnn?: number } } | null;
};

export function ImprovementChart({ current, previous }: Props) {
  const cur = current ?? {};
  const data1: Point[] = [
    { label: 'RMSSD', before: cur.before?.rmssd, after: cur.after?.rmssd },
    { label: 'SDNN', before: cur.before?.sdnn, after: cur.after?.sdnn },
  ];

  const data2: Point[] = [
    { label: 'RMSSD', before: previous?.after?.rmssd, after: cur.after?.rmssd },
    { label: 'SDNN', before: previous?.after?.sdnn, after: cur.after?.sdnn },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="bg-white rounded-xl p-4 shadow">
        <h3 className="font-semibold mb-2">本日: Before → After</h3>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={data1}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="before" name="Before" fill="#8884d8" />
              <Bar dataKey="after" name="After" fill="#82ca9d" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow">
        <h3 className="font-semibold mb-2">前回 After → 今回 After</h3>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={data2}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="before" name="前回 After" fill="#8884d8" />
              <Bar dataKey="after" name="今回 After" fill="#82ca9d" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}