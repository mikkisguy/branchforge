/**
 * Portal-rendered hover tooltip. This component only mounts when the parent
 * node is hovered, so its hooks (useState ×3, useEffectEvent, useEffect ×2) do
 * NOT run for the other 499 nodes in a large graph. This was the single
 * biggest mount-cost contributor before the split: 500 nodes × 11 hooks =
 * 5500 hook evaluations on initial render.
 */

import { useEffect, useEffectEvent, useState } from "react";
import { createPortal } from "react-dom";
import type { LabelNodeData } from "./LabelNode";
import { LabelTooltipContent } from "./label-tooltip-content";
import {
  TOOLTIP_DELAY_MS,
  TOOLTIP_ESTIMATED_WIDTH,
  TOOLTIP_GAP,
  VIEWPORT_PADDING,
} from "./label-node-constants";

export function LabelNodeTooltipPortal({
  data,
  nodeRef,
}: {
  data: LabelNodeData;
  nodeRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [portalContainer, setPortalContainer] = useState<Element | null>(null);

  // Effect event: reads the latest nodeRef on every call, but is not a
  // reactive dep, so the effects below don't re-subscribe on every parent
  // re-render.
  const syncPosition = useEffectEvent(() => {
    const el = nodeRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - TOOLTIP_ESTIMATED_WIDTH / 2;
    left = Math.max(
      VIEWPORT_PADDING,
      Math.min(
        left,
        window.innerWidth - TOOLTIP_ESTIMATED_WIDTH - VIEWPORT_PADDING
      )
    );

    let top = rect.bottom + TOOLTIP_GAP;
    if (top + 220 > window.innerHeight) {
      top = Math.max(VIEWPORT_PADDING, rect.top - TOOLTIP_GAP - 220);
    }

    setPosition((prev) => {
      if (prev.top === top && prev.left === left) return prev;
      return { top, left };
    });
  });

  // On mount: detect the portal container (dialog or body) and start the
  // hover-delay timer. The cleanup clears the timer if the node is
  // un-hovered before the delay elapses.
  useEffect(() => {
    const el = nodeRef.current;
    if (el) {
      const dialog = el.closest("dialog");
      setPortalContainer(dialog ?? document.body);
    }

    const timer = setTimeout(() => {
      // Compute position synchronously before showing so the tooltip
      // never flashes at {0,0}.
      syncPosition();
      setVisible(true);
    }, TOOLTIP_DELAY_MS);

    return () => clearTimeout(timer);
  }, [nodeRef]);

  // rAF loop — only active while visible — keeps the tooltip aligned to
  // the node during pan/zoom.
  useEffect(() => {
    if (!visible) return;
    let rafId: number;
    const tick = () => {
      syncPosition();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [visible]);

  if (!visible || !portalContainer) return null;

  return createPortal(
    <div
      role="tooltip"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width: TOOLTIP_ESTIMATED_WIDTH,
      }}
      className="z-[100] rounded-lg border border-border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-xl pointer-events-none"
    >
      <LabelTooltipContent data={data} />
    </div>,
    portalContainer
  );
}
