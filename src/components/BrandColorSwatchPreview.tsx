// src/components/BrandColorSwatchPreview.tsx — brand color swatch preview component

import React from 'react';

interface BrandColorSwatchPreviewProps {
    primary?: string | null;
    secondary?: string | null;
    ctaTextColor?: '#FFFFFF' | '#1A1A1A' | null;
}

const BrandColorSwatchPreview: React.FC<BrandColorSwatchPreviewProps> = ({ primary, secondary, ctaTextColor }) => {
    if (!primary && !secondary) {
        return (
            <div className="w-20 h-16 rounded-md border-2 border-dashed border-slate-600 flex items-center justify-center">
                <span className="text-[8px] text-slate-500">No colors</span>
            </div>
        );
    }

    return (
        <div className="w-20 h-16 rounded-md overflow-hidden flex flex-col border border-slate-700">
            <div
                className="flex-1 flex items-center justify-center"
                style={{ backgroundColor: primary || '#333333' }}
            >
                {primary && (
                    <span
                        className="text-[7px] font-bold px-2 py-0.5 rounded-sm"
                        style={{
                            backgroundColor: primary,
                            color: ctaTextColor || '#FFFFFF',
                            border: '1px solid rgba(255,255,255,0.3)',
                        }}
                    >
                        CTA
                    </span>
                )}
            </div>
            {secondary && (
                <div className="h-3" style={{ backgroundColor: secondary }} />
            )}
        </div>
    );
};

export default BrandColorSwatchPreview;
