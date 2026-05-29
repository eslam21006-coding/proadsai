// src/components/ReflowPreview.tsx — CSS-only resize preview with object-fit cover

import React from "react";
import { useT } from "../i18n";
import type { AspectRatio } from "../types";

const RATIO_CLASSES: Record<AspectRatio, string> = {
  "1:1": "aspect-square max-w-[560px]",
  "4:5": "aspect-[4/5] max-w-[480px]",
  "3:4": "aspect-[3/4] max-w-[450px]",
  "4:3": "aspect-[4/3] max-w-[600px]",
  "9:16": "aspect-[9/16] max-w-[340px]",
  "16:9": "aspect-video max-w-[640px]",
};

interface ReflowPreviewProps {
  sourceImageUrl: string;
  targetRatio: AspectRatio;
}

const ReflowPreview: React.FC<ReflowPreviewProps> = ({ sourceImageUrl, targetRatio }) => {
  const { t } = useT();

  return (
    <div className="space-y-3">
      <div className={`relative rounded-2xl overflow-hidden border border-slate-700/50 shadow-xl mx-auto w-full ${RATIO_CLASSES[targetRatio]}`}>
        <img
          src={sourceImageUrl}
          alt="Resize preview"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
        <div className="absolute inset-0 flex items-end justify-center pb-2 pointer-events-none">
          <span className="text-[8px] bg-black/50 text-white/70 px-2 py-0.5 rounded backdrop-blur-sm">
            {targetRatio}
          </span>
        </div>
      </div>
      <p className="text-[9px] text-slate-500 text-center">{t("studio.reflow.preview_label")}</p>
    </div>
  );
};

export default ReflowPreview;
