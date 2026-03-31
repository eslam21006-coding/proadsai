import { useState, useRef, useCallback, useEffect } from 'react';

export interface SelectionRegion {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}
export type EditMode = 'text' | 'erase' | 'style' | 'describe' | null;
export interface EditRequest {
  mode: EditMode;
  region: SelectionRegion;
  payload: {
    newText?: string;
    action?: 'remove' | 'replace';
    styleAction?: string;
    colorHex?: string;
    freeInstruction?: string;
  };
}

interface MagicSelectorProps {
  imageUrl: string;
  onEditRequest: (req: EditRequest) => Promise<void>;
  onClose: () => void;
  isProcessing: boolean;
}

const STYLE_OPTIONS = [
  { id: 'change_color', label: 'Change Color', icon: 'fa-palette', needsColor: true },
  { id: 'brighten', label: 'Brighten', icon: 'fa-sun' },
  { id: 'darken', label: 'Darken', icon: 'fa-moon' },
  { id: 'blur_bg', label: 'Blur', icon: 'fa-water' },
  { id: 'make_bigger', label: 'Bigger', icon: 'fa-up-right-and-down-left-from-center' },
  { id: 'make_smaller', label: 'Smaller', icon: 'fa-down-left-and-up-right-to-center' },
];

export default function MagicSelector({ imageUrl, onEditRequest, onClose, isProcessing }: MagicSelectorProps) {
  const [selection, setSelection] = useState<SelectionRegion | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lassoPath, setLassoPath] = useState<{ xPct: number; yPct: number }[]>([]);
  const [activeAction, setActiveAction] = useState<'text' | 'erase' | 'style' | 'describe' | null>(null);
  const [editText, setEditText] = useState('');
  const [styleColor, setStyleColor] = useState('#d4b15d');
  const [describeText, setDescribeText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const toPercent = useCallback((clientX: number, clientY: number): { xPct: number; yPct: number } => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { xPct: 0, yPct: 0 };
    return {
      xPct: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      yPct: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isProcessing || activeAction) return;
    e.preventDefault();
    const pos = toPercent(e.clientX, e.clientY);
    setIsDrawing(true);
    setLassoPath([pos]);
    setSelection(null);
    setActiveAction(null);
  }, [isProcessing, activeAction, toPercent]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    setLassoPath(prev => [...prev, toPercent(e.clientX, e.clientY)]);
  }, [isDrawing, toPercent]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    setIsDrawing(false);
    if (lassoPath.length < 2) {
      const p = lassoPath[0] || toPercent(e.clientX, e.clientY);
      setSelection({ xPct: Math.max(0, p.xPct - 8), yPct: Math.max(0, p.yPct - 5), wPct: 16, hPct: 10 });
    } else {
      const xs = lassoPath.map(p => p.xPct);
      const ys = lassoPath.map(p => p.yPct);
      setSelection({
        xPct: Math.min(...xs), yPct: Math.min(...ys),
        wPct: Math.max(...xs) - Math.min(...xs), hPct: Math.max(...ys) - Math.min(...ys),
      });
    }
  }, [isDrawing, lassoPath, toPercent]);

  const resetSelection = useCallback(() => {
    setSelection(null);
    setLassoPath([]);
    setActiveAction(null);
    setEditText('');
    setDescribeText('');
  }, []);

  const handleTextSubmit = useCallback((action: 'replace' | 'remove') => {
    if (!selection) return;
    onEditRequest({ mode: 'text', region: selection, payload: { action, newText: action === 'replace' ? editText : undefined } });
    resetSelection();
  }, [selection, editText, onEditRequest, resetSelection]);

  const handleEraseSubmit = useCallback(() => {
    if (!selection) return;
    onEditRequest({ mode: 'erase', region: selection, payload: { action: 'remove' } });
    resetSelection();
  }, [selection, onEditRequest, resetSelection]);

  const handleStyleSubmit = useCallback((styleAction: string, color?: string) => {
    if (!selection) return;
    onEditRequest({ mode: 'style', region: selection, payload: { styleAction, colorHex: color } });
    resetSelection();
  }, [selection, onEditRequest, resetSelection]);

  const handleDescribeSubmit = useCallback(() => {
    if (!selection || !describeText.trim()) return;
    onEditRequest({ mode: 'describe', region: selection, payload: { freeInstruction: describeText.trim() } });
    resetSelection();
  }, [selection, describeText, onEditRequest, resetSelection]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeAction) setActiveAction(null);
        else if (selection) resetSelection();
        else onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, activeAction, selection, resetSelection]);

  const selRect = selection ? {
    left: `${selection.xPct}%`, top: `${selection.yPct}%`,
    width: `${selection.wPct}%`, height: `${selection.hPct}%`,
  } : null;

  const popupStyle = selection ? (() => {
    const centerX = selection.xPct + selection.wPct / 2;
    const belowY = selection.yPct + selection.hPct + 2;
    // If popup would go off bottom, place it ABOVE the selection instead
    const fitsBelow = belowY < 65;
    const top = fitsBelow ? belowY : Math.max(2, selection.yPct - 35);
    // Clamp left so the ~260px popup stays within the image
    const left = Math.max(5, Math.min(centerX, 55));
    return { left: `${left}%`, top: `${top}%` };
  })() : {};

  return (
    <div className="absolute inset-0 z-50">

      {/* Top bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 bg-slate-950/90 backdrop-blur-xl border border-slate-700/60 rounded-2xl px-3 py-2 shadow-2xl shadow-black/50">
        <i className="fa-solid fa-wand-magic-sparkles text-violet-400 text-[11px]"></i>
        <span className="text-[10px] font-bold text-white uppercase tracking-wider">Magic Edit</span>
        <div className="w-px h-5 bg-slate-700 mx-1"></div>
        {!selection && (
          <button onClick={() => { setSelection({ xPct: 0, yPct: 0, wPct: 100, hPct: 100 }); setLassoPath([]); }}
            className="px-3 py-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-300 text-[9px] font-bold hover:bg-violet-600/40 transition-all flex items-center gap-1.5">
            <i className="fa-solid fa-expand text-[8px]"></i>Full Image
          </button>
        )}
        <span className="text-[9px] text-slate-400">{selection ? 'Choose an action' : 'Draw or tap to select'}</span>
        <div className="w-px h-5 bg-slate-700 mx-1"></div>
        <button onClick={onClose} className="px-2 py-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-all text-[10px]">
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      {/* Hint */}
      {!selection && !isProcessing && !isDrawing && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[60] bg-slate-950/80 backdrop-blur border border-slate-700/40 rounded-xl px-4 py-2 text-[10px] text-slate-400 font-medium animate-pulse">
          ✏️ Draw a freehand lasso or tap on any area to select it
        </div>
      )}

      {/* Canvas overlay */}
      <div ref={containerRef}
        className={`absolute inset-0 ${!activeAction ? 'cursor-crosshair' : 'cursor-default'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ touchAction: 'none' }}>

        <div className="absolute inset-0 bg-black/20 pointer-events-none"></div>

        {/* Live lasso */}
        {isDrawing && lassoPath.length > 1 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={lassoPath.map(p => `${p.xPct},${p.yPct}`).join(' ')}
              fill="none" stroke="#a78bfa" strokeWidth="0.4" strokeDasharray="1,0.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}

        {/* Completed lasso */}
        {!isDrawing && lassoPath.length > 3 && selection && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points={lassoPath.map(p => `${p.xPct},${p.yPct}`).join(' ')}
              fill="rgba(167,139,250,0.15)" stroke="#a78bfa" strokeWidth="0.35" strokeLinejoin="round" />
          </svg>
        )}

        {/* Tap selection */}
        {!isDrawing && lassoPath.length <= 3 && selRect && (
          <div className="absolute border-2 border-violet-400 pointer-events-none rounded shadow-lg" style={selRect}>
            <div className="absolute inset-0 bg-violet-500/15"></div>
          </div>
        )}
      </div>

      {/* Processing */}
      {isProcessing && (
        <div className="absolute inset-0 z-[65] bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <div className="animate-spin w-10 h-10 border-3 border-violet-500 border-t-transparent rounded-full"></div>
          <p className="text-[10px] font-bold text-white uppercase tracking-wider animate-pulse">Applying magic edit...</p>
        </div>
      )}

      {/* ═══ ACTION MENU ═══ */}
      {selection && !activeAction && !isProcessing && (
        <div className="absolute z-[65] bg-slate-950/95 backdrop-blur-xl border border-violet-500/30 rounded-2xl p-3 shadow-2xl shadow-black/60 w-64 animate-in zoom-in-95 duration-200"
          style={popupStyle}>
          <div className="grid grid-cols-2 gap-1.5">
            <button onClick={() => setActiveAction('text')}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-500 transition-all shadow-md">
              <i className="fa-solid fa-font text-[11px]"></i>Edit Text
            </button>
            <button onClick={handleEraseSubmit}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-600 text-white text-[11px] font-bold hover:bg-red-500 transition-all shadow-md">
              <i className="fa-solid fa-eraser text-[11px]"></i>Remove & Fill
            </button>
            <button onClick={() => setActiveAction('style')}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-violet-600 text-white text-[11px] font-bold hover:bg-violet-500 transition-all shadow-md">
              <i className="fa-solid fa-palette text-[11px]"></i>Restyle
            </button>
            <button onClick={() => setActiveAction('describe')}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-500 transition-all shadow-md">
              <i className="fa-solid fa-comment-dots text-[11px]"></i>Describe Edit
            </button>
          </div>
          <button onClick={resetSelection}
            className="w-full mt-2 py-1.5 rounded-lg text-slate-600 text-[8px] font-bold hover:text-slate-400 transition-all">
            Cancel selection
          </button>
        </div>
      )}

      {/* ═══ TEXT PANEL ═══ */}
      {activeAction === 'text' && selection && (
        <div className="absolute z-[65] bg-slate-950/95 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-4 shadow-2xl shadow-black/60 w-72 animate-in slide-in-from-bottom-2 duration-200"
          style={popupStyle}>
          <h4 className="text-[9px] font-bold text-blue-400 uppercase tracking-wider mb-2">
            <i className="fa-solid fa-font mr-1.5"></i>Edit Text
          </h4>
          <textarea value={editText} onChange={e => setEditText(e.target.value)}
            placeholder="Type the replacement text..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white h-16 outline-none focus:ring-1 focus:ring-blue-500 resize-none mb-3"
            autoFocus dir="rtl" />
          <div className="flex gap-2">
            <button onClick={() => handleTextSubmit('replace')} disabled={!editText.trim()}
              className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-[9px] font-bold uppercase hover:bg-blue-500 transition-all disabled:opacity-30">
              <i className="fa-solid fa-check mr-1"></i>Replace
            </button>
            <button onClick={() => handleTextSubmit('remove')}
              className="flex-1 py-2 rounded-xl bg-red-600/80 text-white text-[9px] font-bold uppercase hover:bg-red-500 transition-all">
              <i className="fa-solid fa-trash mr-1"></i>Remove
            </button>
            <button onClick={() => setActiveAction(null)}
              className="px-3 py-2 rounded-xl bg-slate-800 text-slate-400 text-[9px] font-bold hover:text-white transition-all">
              <i className="fa-solid fa-arrow-left"></i>
            </button>
          </div>
        </div>
      )}

      {/* ═══ STYLE PANEL ═══ */}
      {activeAction === 'style' && selection && (
        <div className="absolute z-[65] bg-slate-950/95 backdrop-blur-xl border border-violet-500/30 rounded-2xl p-3 shadow-2xl shadow-black/60 w-56 animate-in slide-in-from-bottom-2 duration-200"
          style={popupStyle}>
          <h4 className="text-[9px] font-bold text-violet-400 uppercase tracking-wider mb-2">
            <i className="fa-solid fa-palette mr-1.5"></i>Restyle
          </h4>
          <div className="grid grid-cols-3 gap-1.5">
            {STYLE_OPTIONS.filter(o => !o.needsColor).map(opt => (
              <button key={opt.id} onClick={() => handleStyleSubmit(opt.id)}
                className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[8px] font-bold text-slate-300 hover:bg-violet-600/20 hover:text-white transition-all border border-slate-800/50 hover:border-violet-500/30">
                <i className={`fa-solid ${opt.icon} text-[10px] text-violet-400`}></i>
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2 p-2 bg-slate-900/60 rounded-lg border border-slate-800/40">
            <input type="color" value={styleColor} onChange={e => setStyleColor(e.target.value)}
              className="w-7 h-6 rounded border-0 cursor-pointer shrink-0" />
            <button onClick={() => handleStyleSubmit('change_color', styleColor)}
              className="flex-1 py-1.5 rounded-lg bg-violet-600/30 text-violet-300 text-[8px] font-bold uppercase hover:bg-violet-600/50 transition-all">
              Apply Color
            </button>
          </div>
          <button onClick={() => setActiveAction(null)}
            className="w-full mt-2 py-1.5 rounded-lg text-slate-600 text-[8px] font-bold hover:text-slate-400 transition-all flex items-center justify-center gap-1">
            <i className="fa-solid fa-arrow-left text-[7px]"></i> Back
          </button>
        </div>
      )}

      {/* ═══ DESCRIBE PANEL ═══ */}
      {activeAction === 'describe' && selection && (
        <div className="absolute z-[65] bg-slate-950/95 backdrop-blur-xl border border-emerald-500/30 rounded-2xl p-4 shadow-2xl shadow-black/60 w-72 animate-in slide-in-from-bottom-2 duration-200"
          style={popupStyle}>
          <h4 className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider mb-2">
            <i className="fa-solid fa-comment-dots mr-1.5"></i>Describe What to Change
          </h4>
          <textarea value={describeText} onChange={e => setDescribeText(e.target.value)}
            placeholder="e.g. Make this gold, remove the shadow, change text to X... (Note: cannot move or reposition elements)"
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white h-20 outline-none focus:ring-1 focus:ring-emerald-500 resize-none mb-3"
            autoFocus />
          <div className="flex gap-2">
            <button onClick={handleDescribeSubmit} disabled={!describeText.trim()}
              className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-[9px] font-bold uppercase hover:bg-emerald-500 transition-all disabled:opacity-30">
              <i className="fa-solid fa-wand-magic-sparkles mr-1"></i>Apply
            </button>
            <button onClick={() => setActiveAction(null)}
              className="px-3 py-2 rounded-xl bg-slate-800 text-slate-400 text-[9px] font-bold hover:text-white transition-all">
              <i className="fa-solid fa-arrow-left"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
