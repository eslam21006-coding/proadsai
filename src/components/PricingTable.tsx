import { useState, useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { PLANS } from '../planconfig';

const createPaddleCheckoutFn = httpsCallable(functions, "createPaddleCheckout");

const SECTIONS = [
  { id: 'usage', label: 'Usage', defaultOpen: true },
  { id: 'engine', label: 'AI Creative Engine', defaultOpen: false },
  { id: 'visual', label: 'Visual & Creative', defaultOpen: false },
  { id: 'retargeting', label: 'Retargeting', defaultOpen: false },
  { id: 'studio', label: 'Render Studio', defaultOpen: false },
  { id: 'production', label: 'Production & Integrations', defaultOpen: false },
  { id: 'scale', label: 'Scale Exclusives', defaultOpen: false },
  { id: 'team', label: 'Team', defaultOpen: false },
] as const;

type BillingMode = 'monthly' | 'annual';

// PADDLE: CTA buttons call createPaddleCheckout callable
const plans = [
  { key: 'starter', name: 'Starter', sub: 'Get hooked', monthly: 19, annual: 15.20, badge: null, ctaLabel: 'Start Creating', micro: 'Your first 25 ads', cls: '', ctaCls: '' },
  { key: 'pro', name: 'Pro', sub: 'Full production', monthly: 79, annual: 63.20, badge: { text: 'Most Popular', cls: 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,.35)]' }, ctaLabel: 'Go Full Production', micro: 'Carousels + Meta + intelligence', cls: 'highlight-col', ctaCls: 'pro' },
  { key: 'scale', name: 'Scale', sub: 'AI runs the show', monthly: 179, annual: 143.20, badge: { text: 'AI-Powered', cls: 'bg-amber-500 text-gray-900' }, ctaLabel: 'Let AI Optimize', micro: '5 exclusives no other plan gets', cls: 'scale-col', ctaCls: 'scale' },
];

type CellValue = string | boolean | { text: string; note?: string; emphasis?: boolean; soon?: boolean };
interface FeatureRow { label: string; note?: string; section: string; values: CellValue[] }

const Y = '\u2713'; // checkmark
const N = '\u2014'; // dash

const featureRows: FeatureRow[] = [
  { section: 'usage', label: 'Credits / Month', values: ['800', '2,500', '6,500'] },
  { section: 'usage', label: 'Ads / Month', note: '~20 credits per ad', values: ['~40', '~125', '~325'] },
  { section: 'usage', label: 'Saved Projects', values: ['10', '30', 'Unlimited'] },
  { section: 'usage', label: 'Audience Avatars', note: 'Reusable brand profiles that pre-fill the form', values: ['5', '15', 'Unlimited'] },
  { section: 'usage', label: 'Credit Top-Ups', note: 'Buy extra credits anytime', values: [true, true, true] },
  { section: 'engine', label: 'Primary Text + Refinement', note: '150-word ad copy generation', values: [true, true, true] },
  { section: 'engine', label: '6 Aspect Ratios', note: '1:1 \u00b7 4:5 \u00b7 3:4 \u00b7 4:3 \u00b7 9:16 \u00b7 16:9', values: [true, true, true] },
  { section: 'engine', label: 'Hook Angles', note: 'Before/after, emotional, pain, curiosity\u2026', values: ['All 11', 'All 11', 'All 11'] },
  { section: 'engine', label: 'Hook Delivery Styles', note: 'Comedic, controversial, question\u2026', values: ['All 12', 'All 12', 'All 12'] },
  { section: 'engine', label: 'Ad Tones', note: 'Formal, bold, mentor, luxury CEO\u2026', values: ['All 11', 'All 11', 'All 11'] },
  { section: 'engine', label: 'Copywriting Strategies', note: 'Pattern interrupt, myth busting\u2026', values: ['All 8', 'All 8', 'All 8'] },
  { section: 'engine', label: 'Offer Creative Modes', note: 'Value stack, event ticket, book mockup\u2026', values: ['All 18+', 'All 18+', 'All 18+'] },
  { section: 'visual', label: 'Brand URL Scraping', note: 'Auto-extract colors, tone, and assets', values: [true, true, true] },
  { section: 'visual', label: 'Realistic Universes', values: [true, true, true] },
  { section: 'visual', label: 'Bilingual UI (Arabic + English)', note: 'Full RTL support', values: [true, true, true] },
  { section: 'visual', label: 'Fantasy Universes', note: '500+ cinematic sci-fi & fantasy worlds', values: [false, true, true] },
  { section: 'visual', label: 'Auto-Optimized Creatives', note: 'AI visual polishes applied automatically', values: [false, true, true] },
  { section: 'visual', label: 'Reference Ad Upload', note: 'Adapt style from any competitor ad', values: [false, true, true] },
  { section: 'retargeting', label: 'Retargeting Mode', note: 'Separate campaign type with objection logic', values: [false, true, true] },
  { section: 'retargeting', label: 'Objection Scripts', note: 'Price, trust, time, overwhelm, approval\u2026', values: [false, 'All 12', 'All 12'] },
  { section: 'studio', label: 'Multi-Ratio Reflow', note: 'Reflow one creative into all 6 sizes', values: [true, true, true] },
  { section: 'studio', label: 'A/B Variation Testing', note: 'Auto-generate 3 creative variants', values: [false, true, true] },
  { section: 'studio', label: 'Region Editing', note: 'Edit specific zones of the rendered image', values: [false, true, true] },
  { section: 'studio', label: 'Carousel Ads', values: [false, 'Up to 7 slides', 'Up to 10 slides'] },
  { section: 'production', label: 'Competitor Intelligence', note: 'Research competitors + differentiation angles', values: [false, true, true] },
  { section: 'production', label: 'Push to Meta Ads', note: 'One-click push creatives to your ad account', values: [false, true, true] },
  { section: 'production', label: 'Creative Memory', note: 'AI remembers your past generations', values: [false, true, true] },
  { section: 'production', label: 'Performance Dashboard', note: 'Track CTR, CPC, ROAS by dimension', values: [false, 'Overview', { text: 'Full breakdown', emphasis: true }] },
  { section: 'scale', label: 'Batch Rendering', note: 'All hooks \u00d7 concepts \u00d7 sizes in one flow', values: [false, 'Up to 4 ads / run', { text: 'Up to 36 ads / run', emphasis: true }] },
  { section: 'scale', label: 'Creative Scoring Engine', note: 'AI ranks your creatives by predicted CTR', values: [false, false, { text: '\u2713 Scale only', emphasis: true }] },
  { section: 'scale', label: 'Smart Recommendations', note: 'AI suggests your next best creative combo', values: [false, false, { text: '\u2713 Scale only', emphasis: true }] },
  { section: 'scale', label: 'Variant Exploration Engine', note: 'Multi-dimensional testing with winner tracking', values: [false, false, { text: '\u2713 Scale only', emphasis: true }] },
  { section: 'scale', label: 'Multi-Brand Workspaces', note: 'Separate environments per client brand', values: [false, false, { text: '\u2713 Scale only', emphasis: true, soon: true }] },
  { section: 'team', label: 'Team Members', note: 'Shared credit pool (owner + invitees)', values: ['1', '3', '10'] },
];

function CellContent({ val, highlight }: { val: CellValue; highlight: string }) {
  if (typeof val === 'boolean') {
    return val ? <span className="text-blue-400 font-extrabold text-base">{Y}</span> : <span className="text-slate-600 font-bold">{N}</span>;
  }
  if (typeof val === 'object') {
    return (
      <span className={val.emphasis ? 'text-amber-400 font-extrabold' : 'text-white font-extrabold'}>
        {val.text}
        {val.soon && <span className="inline-block bg-amber-500/12 text-amber-500 text-[9px] font-extrabold tracking-wide uppercase px-1.5 py-0.5 rounded ml-1 align-middle">Soon</span>}
      </span>
    );
  }
  // String — check for "All" to make strong
  if (val.startsWith('All') || val === 'Unlimited') return <span className={`font-extrabold ${highlight === 'scale-col' ? 'text-white' : highlight === 'highlight-col' ? 'text-white' : 'text-white'}`}>{val}</span>;
  return <span className="text-slate-300">{val}</span>;
}

export default function PricingTable() {
  const [billing, setBilling] = useState<BillingMode>('monthly');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    Object.fromEntries(SECTIONS.map(s => [s.id, s.defaultOpen]))
  );
  const [allExpanded, setAllExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledEnd, setScrolledEnd] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setScrolledEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
    el.addEventListener('scroll', check, { passive: true });
    check();
    return () => el.removeEventListener('scroll', check);
  }, []);

  const toggleSection = (id: string) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAll = () => {
    if (allExpanded) {
      setOpenSections(Object.fromEntries(SECTIONS.map(s => [s.id, s.id === 'usage'])));
    } else {
      setOpenSections(Object.fromEntries(SECTIONS.map(s => [s.id, true])));
    }
    setAllExpanded(!allExpanded);
  };

  return (
    <section className="pa-compare py-[60px] px-5 font-sans text-white" id="plan-comparison">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="text-center mb-7">
          <div className="inline-block text-[13px] font-bold tracking-[.08em] uppercase text-blue-400 mb-2.5">Compare Plans</div>
          <h2 className="text-[clamp(28px,4vw,42px)] leading-[1.1] font-extrabold m-0 mb-3">Every Tier Unlocks the Next Level</h2>
          <p className="text-base leading-relaxed text-slate-400 max-w-[820px] mx-auto mb-[18px]">
            Start creating on Starter. Go full-production on Pro. Let AI optimize everything on Scale.
          </p>
          <div className="flex justify-center mb-[18px]">
            <div className="inline-flex items-center bg-white/5 border border-white/[0.08] rounded-full p-[5px]">
              <button onClick={() => setBilling('monthly')} className={`border-none bg-transparent text-sm font-bold px-5 py-2.5 rounded-full cursor-pointer transition-all ${billing === 'monthly' ? 'bg-blue-600 text-white shadow-[0_8px_24px_rgba(37,99,235,.28)]' : 'text-slate-400'}`}>Monthly</button>
              <button onClick={() => setBilling('annual')} className={`border-none bg-transparent text-sm font-bold px-5 py-2.5 rounded-full cursor-pointer transition-all ${billing === 'annual' ? 'bg-blue-600 text-white shadow-[0_8px_24px_rgba(37,99,235,.28)]' : 'text-slate-400'}`}>Annual</button>
              <span className="inline-flex items-center ml-2 px-2.5 py-1.5 rounded-full bg-green-500/15 text-green-500 text-[11px] font-extrabold tracking-wide uppercase">Save 20%</span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="mt-5 bg-[#0f1c2e] border border-white/[0.08] rounded-[22px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
          <div ref={scrollRef} className={`overflow-x-auto relative ${scrolledEnd ? 'scrolled-end' : ''}`} id="compareScroll">
            <table className="w-full min-w-[1080px] border-collapse border-separate-0 relative">
              <thead>
                <tr>
                  <th className="bg-[#12233a] text-white text-[15px] font-bold p-[22px_18px] text-left border-b border-white/[0.08] sticky top-0 z-[4] min-w-[260px]">Feature</th>
                  {plans.map(p => (
                    <th key={p.key} className={`bg-[#12233a] text-white text-[15px] font-bold p-[22px_18px] text-center border-b border-white/[0.08] sticky top-0 z-[2] align-top ${p.cls}`}>
                      <div className="flex flex-col items-center gap-1.5">
                        {p.badge && <span className={`inline-flex items-center justify-center px-2.5 py-1.5 rounded-full text-[10px] font-extrabold tracking-wide uppercase whitespace-nowrap mb-0.5 ${p.badge.cls}`}>{p.badge.text}</span>}
                        <div className="text-lg font-extrabold leading-[1.1]">{p.name}</div>
                        <div className="text-xs text-slate-400 font-medium leading-snug max-w-[180px] min-h-[34px]">{p.sub}</div>
                        <div className="mt-2 text-[34px] font-black leading-none text-white">${billing === 'monthly' ? p.monthly : p.annual}<small className="text-[13px] font-semibold text-slate-400 ml-1">/mo</small></div>
                        <div className="text-xs text-green-500 font-semibold leading-snug min-h-[18px]">{billing === 'annual' ? `$${p.annual}/mo billed annually` : ''}</div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map(section => {
                  const isOpen = openSections[section.id];
                  const rows = featureRows.filter(r => r.section === section.id);
                  return (
                    <>
                      <tr key={section.id} className="cursor-pointer select-none" onClick={() => toggleSection(section.id)}>
                        <th className="text-left text-[12px] uppercase tracking-[.08em] font-extrabold text-blue-300 bg-blue-600/[0.08] py-3.5 px-[18px] border-b border-white/5">
                          {section.label}
                          <span className={`inline-block w-4 h-4 ml-2 align-middle transition-transform ${isOpen ? '' : '-rotate-90'}`}>
                            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-blue-300"><path d="M7 10l5 5 5-5z" /></svg>
                          </span>
                        </th>
                        <td className="bg-blue-600/[0.08] border-b border-white/5"></td>
                        <td className="bg-blue-600/[0.08] border-b border-white/5"></td>
                        <td className="bg-blue-600/[0.08] border-b border-white/5"></td>
                      </tr>
                      {isOpen && rows.map((row, ri) => (
                        <tr key={`${section.id}-${ri}`} className="hover:bg-white/[0.03]">
                          <th className="text-left text-sm font-semibold text-slate-200 bg-[#0f1c2e] py-4 px-[18px] border-b border-white/[0.06]">
                            {row.label}
                            {row.note && <span className="block text-xs text-slate-400 mt-1 leading-snug font-normal">{row.note}</span>}
                          </th>
                          {row.values.map((val, ci) => (
                            <td key={ci} className={`text-center text-sm text-slate-300 py-4 px-[18px] border-b border-white/[0.06] ${plans[ci].cls}`}>
                              <CellContent val={val} highlight={plans[ci].cls} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </>
                  );
                })}
              </tbody>
            </table>

            {/* Expand all */}
            <div className="text-center py-4 border-t border-white/[0.06]">
              <button onClick={toggleAll} className="inline-flex items-center gap-1.5 bg-white/[0.06] border border-white/10 text-slate-400 text-[13px] font-bold px-6 py-2.5 rounded-full cursor-pointer transition-all hover:bg-white/10 hover:text-slate-200">
                {allExpanded ? 'Collapse features' : 'Show all 40+ features'}
                <svg viewBox="0 0 24 24" className={`w-3.5 h-3.5 transition-transform ${allExpanded ? 'rotate-180' : ''}`}><path d="M7 10l5 5 5-5z" fill="currentColor" /></svg>
              </button>
            </div>

            {/* CTA Row */}
            <div className="grid min-w-[1080px] border-t border-white/[0.08] bg-[#0d1727]" style={{ gridTemplateColumns: '260px repeat(3, 1fr)' }}>
              <div className="border-r border-white/[0.06]"></div>
              {plans.map(p => {
                const planConfig = PLANS[p.key as keyof typeof PLANS];
                const priceId = billing === 'annual' ? planConfig?.paddlePriceId?.yearly : planConfig?.paddlePriceId?.monthly;
                return (
                <div key={p.key} className={`p-[18px] text-center border-r border-white/[0.06] last:border-r-0 transition-all hover:-translate-y-0.5 ${p.ctaCls === 'pro' ? 'bg-blue-600/[0.08]' : p.ctaCls === 'scale' ? 'bg-amber-500/[0.06]' : ''}`}>
                  <button
                    onClick={async () => {
                      if (!priceId) return;
                      try {
                        const result = await createPaddleCheckoutFn({ priceId });
                        const data = result.data as any;
                        if (data?.transactionId && (window as any).Paddle) {
                          (window as any).Paddle.Checkout.open({
                            settings: { displayMode: 'overlay' },
                            transactionId: data.transactionId,
                          });
                        } else if (data?.checkoutUrl) {
                          window.open(data.checkoutUrl, "_blank");
                        }
                      } catch (e: any) {
                        console.error("Checkout error:", e);
                      }
                    }}
                    className={`block w-full py-3.5 px-4 rounded-xl no-underline text-white font-extrabold transition-all hover:-translate-y-0.5 hover:opacity-95 cursor-pointer border-0 ${p.ctaCls === 'pro' ? 'bg-blue-600 shadow-[0_0_25px_rgba(37,99,235,.28)]' : p.ctaCls === 'scale' ? 'bg-amber-500 !text-gray-900 shadow-[0_0_25px_rgba(245,158,11,.22)]' : 'bg-white/[0.08]'}`}>
                    {p.ctaLabel} &rarr;
                  </button>
                  <div className="mt-2.5 text-xs text-slate-400">{p.micro}</div>
                </div>
              );
              })}
            </div>
          </div>
        </div>

        <p className="text-center mt-[18px] text-[13px] text-slate-400 leading-relaxed">
          <strong className="text-slate-200 font-bold">Free trial:</strong> 50 credits on any plan with full features. Pro Ads AI branding on trial exports only &mdash; all paid plans are completely unbranded.
        </p>
      </div>
    </section>
  );
}
