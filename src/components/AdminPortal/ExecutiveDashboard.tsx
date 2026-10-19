import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, FileSpreadsheet, FileText, RefreshCw, ShieldCheck, Truck, AlertTriangle, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { fetchInspections, fetchVehicles } from '../../lib/api';
import { InspectionRecord, Vehicle } from '../../types';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type WindowKey = '7d' | '14d' | '30d' | 'all';
const dayKey = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const normalise = (s?: string) => String(s || '').trim().toUpperCase();

export const ExecutiveDashboard: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [windowKey, setWindowKey] = useState<WindowKey>('30d');
  const [depot, setDepot] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [chartMode, setChartMode] = useState<'combined' | 'compliance' | 'volume'>('combined');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [v, i] = await Promise.all([fetchVehicles(), fetchInspections()]);
      setVehicles(v); setInspections(i);
    } catch (e: any) { setError(e?.message || 'Unable to load real inspection and fleet records.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const now = new Date(); now.setHours(23,59,59,999);
    const cutoff = new Date(now);
    if (windowKey !== 'all') cutoff.setDate(cutoff.getDate() - Number(windowKey.replace('d','')) + 1);
    return inspections.filter(i => {
      const date = new Date(i.timestamp || i.formattedDate);
      if (windowKey !== 'all' && (Number.isNaN(date.getTime()) || date < cutoff || date > now)) return false;
      if (depot !== 'ALL' && normalise(i.vehicleBranch || i.driverDepot) !== depot) return false;
      if (category !== 'ALL' && i.truckCategory !== category) return false;
      return true;
    }).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [inspections, windowKey, depot, category]);

  const filteredVehicles = useMemo(() => vehicles.filter(v =>
    (depot === 'ALL' || normalise(v.branch) === depot) &&
    (category === 'ALL' || v.truckCategory === category)
  ), [vehicles, depot, category]);

  const passCount = filtered.filter(i => i.overallResult === 'Pass').length;
  const failCount = filtered.filter(i => i.overallResult === 'Fail').length;
  const compliance = filtered.length ? Math.round(passCount / filtered.length * 100) : 0;
  const inspectedVehicles = new Set(filtered.map(i => normalise(i.vehicleNo))).size;
  const coverage = filteredVehicles.length ? Math.round(inspectedVehicles / filteredVehicles.length * 100) : 0;
  const grounded = filteredVehicles.filter(v => v.currentStatus === 'Grounded').length;
  const depots = Array.from(new Set(vehicles.map(v => normalise(v.branch)).filter(Boolean))).sort();

  const trend = useMemo(() => {
    const days = windowKey === '7d' ? 7 : windowKey === '14d' ? 14 : windowKey === 'all' ? 30 : 30;
    const result: { date: string; label: string; total: number; passed: number; rate: number }[] = [];
    for (let n=days-1; n>=0; n--) {
      const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-n);
      const key = dayKey(d.toISOString());
      const items = filtered.filter(i => dayKey(i.timestamp || i.formattedDate) === key);
      result.push({ date:key, label:`${d.getDate()}/${d.getMonth()+1}`, total:items.length, passed:items.filter(i=>i.overallResult==='Pass').length, rate:items.length ? Math.round(items.filter(i=>i.overallResult==='Pass').length/items.length*100) : 0 });
    }
    return result;
  }, [filtered, windowKey]);

  const rankings = useMemo(() => depots.map(code => {
    const list = filtered.filter(i => normalise(i.vehicleBranch || i.driverDepot) === code);
    const pass = list.filter(i => i.overallResult === 'Pass').length;
    const totalVehicles = filteredVehicles.filter(v => normalise(v.branch) === code).length;
    return { depot:code, total:list.length, passed:pass, defects:list.filter(i=>i.overallResult==='Fail').length, rate:list.length ? Math.round(pass/list.length*100) : 0, fleet:totalVehicles };
  }).filter(x => depot === 'ALL' || x.depot === depot).sort((a,b)=>b.rate-a.rate || b.total-a.total), [depots, filtered, filteredVehicles, depot]);

  const hotspots = useMemo(() => {
    const counts = new Map<string, {name:string; count:number; vehicles:Set<string>; notes:string[]}>();
    filtered.forEach(record => {
      (record.items || []).filter(item => item.status === 'Fail').forEach(item => {
        const key = item.title || item.id || 'Unspecified checkpoint';
        const current = counts.get(key) || {name:key,count:0,vehicles:new Set<string>(),notes:[]};
        current.count++; current.vehicles.add(record.vehicleNo);
        if (item.defectNote && current.notes.length < 3 && !current.notes.includes(item.defectNote)) current.notes.push(item.defectNote);
        counts.set(key,current);
      });
    });
    return Array.from(counts.values()).map(x=>({...x, vehicles:Array.from(x.vehicles)})).sort((a,b)=>b.count-a.count).slice(0,8);
  }, [filtered]);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Metric:'Compliance rate', Value:`${compliance}%` },
      { Metric:'Total inspections', Value:filtered.length },
      { Metric:'Passed', Value:passCount },
      { Metric:'Defective', Value:failCount },
      { Metric:'Grounded vehicles', Value:grounded },
      { Metric:'Fleet coverage', Value:`${coverage}%` },
      { Metric:'Data source', Value:'Current fleet and inspection API records; no seeded demo records' },
    ]), 'Executive Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rankings.map(({depot,total,passed,defects,rate,fleet})=>({Depot:depot,Inspections:total,Passed:passed,Defects:defects,'Compliance %':rate,'Fleet vehicles':fleet}))), 'Depot Rankings');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filtered.map(i=>({Date:i.timestamp,Vehicle:i.vehicleNo,Depot:i.vehicleBranch || i.driverDepot,Driver:i.driverName,Result:i.overallResult,Defects:i.defectCount,Remarks:i.defectSummary || ''}))), 'Inspection Register');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hotspots.map(h=>({Checkpoint:h.name,Occurrences:h.count,Vehicles:h.vehicles.join(', '),Remarks:h.notes.join(' | ')}))), 'Defect Hotspots');
    XLSX.writeFile(wb, `Executive_Compliance_Analysis_${dayKey(new Date().toISOString())}.xlsx`);
  };

  const exportPdf = () => {
    const pdf = new jsPDF({orientation:'landscape'});
    pdf.setFontSize(18); pdf.text('Executive Compliance & Fleet Analytics', 14, 16);
    pdf.setFontSize(9); pdf.text(`APAD / JPJ Fleet Compliance Summary · Period: ${windowKey} · Generated: ${new Date().toLocaleString()}`,14,23);
    autoTable(pdf,{startY:29,head:[['Compliance','Inspections','Passed','Defective','Grounded','Fleet coverage']],body:[[ `${compliance}%`,String(filtered.length),String(passCount),String(failCount),String(grounded),`${coverage}%` ]]});
    autoTable(pdf,{startY:(pdf as any).lastAutoTable.finalY+8,head:[['Depot','Inspections','Passed','Defects','Compliance','Fleet']],body:rankings.map(r=>[r.depot,r.total,r.passed,r.defects,`${r.rate}%`,r.fleet])});
    autoTable(pdf,{startY:(pdf as any).lastAutoTable.finalY+8,head:[['Date','Vehicle','Depot','Driver','Result','Defects','Remarks']],body:filtered.slice(0,100).map(i=>[String(i.formattedDate || i.timestamp || '').slice(0,10),i.vehicleNo,i.vehicleBranch || i.driverDepot,i.driverName,i.overallResult,i.defectCount,i.defectSummary || '']),styles:{fontSize:7}});
    pdf.save(`Executive_Compliance_Analysis_${dayKey(new Date().toISOString())}.pdf`);
  };

  return <div className="space-y-5">
    <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">APAD Act 715 · Executive Reporting</p><h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Executive Compliance & Fleet Analytics</h2><p className="mt-1 text-sm text-slate-500">Management view based on current fleet and inspection records.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={exportPdf} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FileText className="h-4 w-4"/>Export PDF</button><button onClick={exportExcel} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><FileSpreadsheet className="h-4 w-4"/>Export Excel</button><button onClick={() => void load()} disabled={loading} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/></button></div>
    </header>

    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row">
      <label className="text-xs font-bold text-slate-500">Timeframe<select value={windowKey} onChange={e=>setWindowKey(e.target.value as WindowKey)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"><option value="7d">Last 7 days</option><option value="14d">Last 14 days</option><option value="30d">Last 30 days</option><option value="all">All available records</option></select></label>
      <label className="text-xs font-bold text-slate-500">Depot<select value={depot} onChange={e=>setDepot(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"><option value="ALL">All depots</option>{depots.map(d=><option key={d} value={d}>{d}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-500">Truck category<select value={category} onChange={e=>setCategory(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"><option value="ALL">All categories</option><option value="Feeder">Feeder</option><option value="Small Truck">Small Truck</option></select></label>
      <div className="flex-1 self-end text-xs text-slate-400">Filtered inspection records: {filtered.length} · No demo-data generator</div>
    </div>

    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    {loading ? <div className="rounded-2xl bg-white p-12 text-center text-sm text-slate-500">Loading real fleet and inspection data…</div> : <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[{label:'Compliance rate',value:`${compliance}%`,sub:'Passed / inspected',icon:<ShieldCheck/>},{label:'Total inspections',value:filtered.length,sub:'Within selected period',icon:<ClipboardCheck/>},{label:'Passed / defective',value:`${passCount} / ${failCount}`,sub:'Inspection outcomes',icon:<CheckCircle2/>},{label:'Grounded vehicles',value:grounded,sub:'Current filtered fleet',icon:<AlertTriangle/>},{label:'Fleet coverage',value:`${coverage}%`,sub:`${inspectedVehicles} of ${filteredVehicles.length} vehicles inspected`,icon:<Truck/>}].map(k=><div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500">{k.label}</span><span className="text-blue-600">{k.icon}</span></div><p className="mt-3 text-2xl font-black text-slate-900">{k.value}</p><p className="mt-1 text-xs text-slate-500">{k.sub}</p></div>)}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black text-slate-900">Daily compliance & inspection trend</h3><p className="text-xs text-slate-500">Daily counts and pass rate from stored inspection records.</p></div><div className="flex gap-1 rounded-xl bg-slate-100 p-1">{([{id:'combined',label:'Combined'},{id:'compliance',label:'Compliance %'},{id:'volume',label:'Volume'}] as const).map(m=><button key={m.id} onClick={()=>setChartMode(m.id)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${chartMode===m.id?'bg-white text-blue-700 shadow-sm':'text-slate-500'}`}>{m.label}</button>)}</div></div>
        <div className="mt-4 overflow-x-auto"><svg viewBox="0 0 900 230" role="img" aria-label="Daily inspection trend chart" className="min-w-[650px] w-full">
          {[0,1,2,3,4].map(n=><g key={n}><line x1="42" x2="880" y1={20+n*45} y2={20+n*45} stroke="#e2e8f0" strokeDasharray="4 4"/><text x="30" y={24+n*45} textAnchor="end" fontSize="10" fill="#64748b">{chartMode==='volume'?Math.round(Math.max(1,...trend.map(t=>t.total))* (4-n)/4):100-n*25}{chartMode==='volume'?'':'%'}</text></g>)}
          {trend.map((t,n)=>{const x=48+n*(820/Math.max(1,trend.length-1)); const barH=t.total/Math.max(1,...trend.map(z=>z.total))*160; const rateY=200-t.rate*1.6; return <g key={t.date}><rect x={x-4} y={200-barH} width="8" height={barH} rx="2" fill="#cbd5e1" opacity={chartMode==='compliance'?0.2:0.9}/>{chartMode!=='volume'&&<circle cx={x} cy={rateY} r="3" fill="#2563eb"/>}{n%Math.max(1,Math.ceil(trend.length/10))===0&&<text x={x} y="220" textAnchor="middle" fontSize="9" fill="#64748b">{t.label}</text>}</g>})}
          {chartMode!=='volume'&&<polyline fill="none" stroke="#2563eb" strokeWidth="2.5" points={trend.map((t,n)=>`${48+n*(820/Math.max(1,trend.length-1))},${200-t.rate*1.6}`).join(' ')}/>}
        </svg></div><div className="mt-2 flex gap-4 text-xs text-slate-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-600"/>Compliance rate</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-300"/>Inspection volume</span><span>95% target reference: compare against the daily rate shown.</span></div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4"><h3 className="font-black text-slate-900">Depot completion & performance rankings</h3><p className="text-xs text-slate-500">Based on inspection records in the selected timeframe.</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="p-3">Depot</th><th className="p-3">Inspections</th><th className="p-3">Defects</th><th className="p-3">Compliance</th></tr></thead><tbody>{rankings.map((r,i)=><tr key={r.depot} className="border-t border-slate-100"><td className="p-3 font-bold text-slate-800">{i+1}. {r.depot}</td><td className="p-3">{r.total}</td><td className="p-3">{r.defects}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${r.rate>=95?'bg-emerald-50 text-emerald-700':r.rate>=80?'bg-amber-50 text-amber-700':'bg-rose-50 text-rose-700'}`}>{r.rate}%</span></td></tr>)}{!rankings.length&&<tr><td colSpan={4} className="p-8 text-center text-slate-500">No matching depot records.</td></tr>}</tbody></table></div></section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4"><h3 className="font-black text-slate-900">Recurring defect hotspots</h3><p className="text-xs text-slate-500">Failed checkpoints and remarks recorded by drivers.</p></div><div className="divide-y divide-slate-100">{hotspots.map(h=><div key={h.name} className="p-4"><div className="flex items-start justify-between gap-3"><p className="font-bold text-slate-800">{h.name}</p><span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-700">{h.count} occurrence(s)</span></div><p className="mt-1 text-xs text-slate-500">Vehicles: {h.vehicles.join(', ')}</p>{h.notes.map(n=><p key={n} className="mt-1 text-xs text-slate-600">• {n}</p>)}</div>)}{!hotspots.length&&<p className="p-8 text-center text-sm text-slate-500">No failed checkpoints recorded in this period.</p>}</div></section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4"><h3 className="font-black text-slate-900">Recent defect action register</h3><p className="text-xs text-slate-500">Latest failed inspections; source fields are shown as recorded.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Vehicle</th><th className="p-3">Depot</th><th className="p-3">Driver</th><th className="p-3">Defects</th><th className="p-3">Remarks</th></tr></thead><tbody>{filtered.filter(i=>i.overallResult==='Fail').slice(0,12).map(i=><tr key={i.id} className="border-t border-slate-100"><td className="p-3">{String(i.formattedDate || i.timestamp || '').slice(0,10)}</td><td className="p-3 font-bold">{i.vehicleNo}</td><td className="p-3">{i.vehicleBranch || i.driverDepot}</td><td className="p-3">{i.driverName}</td><td className="p-3">{i.defectCount}</td><td className="max-w-xs p-3 text-xs text-slate-600">{i.defectSummary || 'No remark supplied'}</td></tr>)}{!filtered.some(i=>i.overallResult==='Fail')&&<tr><td colSpan={6} className="p-8 text-center text-slate-500">No defective inspections in this period.</td></tr>}</tbody></table></div></section>
      <p className="text-xs text-slate-400">Audit note: metrics are calculated from records returned by the current API. The dashboard does not generate demo inspections. Vehicle coverage is a unique-vehicle count divided by the currently filtered fleet; historical depot assignments are not available unless recorded on each inspection.</p>
    </>}
  </div>;
};
