import {
  useId,
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string = string> {
  id?: string;
  options: readonly SelectOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  portalContainer?: HTMLElement | null;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-required"?: boolean | "true" | "false";
}

function getDefaultPortalContainer(from: Element | null): HTMLElement {
  // Walk up from the trigger itself rather than querying the document
  // for *any* open dialog: with nested dialogs, the first
  // `dialog[open]` in document order is the outer one, not necessarily
  // the one actually containing this select. Portaling into the wrong
  // dialog renders the menu behind the (later, higher top-layer)
  // dialog that really contains it.
  const dialog = from?.closest("dialog[open]");
  if (dialog instanceof HTMLElement) return dialog;
  return document.body;
}

export function Select<T extends string = string>({
  id,
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
  className,
  portalContainer,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-required": ariaRequired,
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const listboxId = useId();
  const listboxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitializedFocus = useRef(false);
  const gap = 4;

  // Mirror the trigger node into state (in addition to the ref used by
  // the positioning effect below). Refs must not be read during render
  // (react-hooks/refs), so the render-time portal-target lookup below
  // reads this state value instead of `triggerRef.current`.
  const [triggerNode, setTriggerNode] = useState<HTMLButtonElement | null>(
    null
  );
  const setTriggerRef = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
    setTriggerNode(node);
  }, []);

  const currentOption = options.find((opt) => opt.value === value);

  const close = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
    hasInitializedFocus.current = false;
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const estimatedMenuHeight = 240;
    const spaceBelow = window.innerHeight - rect.bottom - gap;

    if (spaceBelow >= estimatedMenuHeight || spaceBelow >= rect.top) {
      setMenuStyle({
        top: rect.bottom + gap,
        left: rect.left,
        width: rect.width,
      });
    } else {
      setMenuStyle({
        top: rect.top - gap,
        left: rect.left,
        width: rect.width,
        transform: "translateY(-100%)",
      });
    }
  }, []);

  // react-doctor-disable-next-line react-doctor/advanced-event-handler-refs
  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  // Compute the portal target directly during render so the portal
  // content mounts in the same commit as isOpen turning true.
  const portalTarget =
    isOpen && typeof document !== "undefined"
      ? (portalContainer ?? getDefaultPortalContainer(triggerNode))
      : null;

  useEffect(() => {
    if (isOpen && listboxRef.current && !hasInitializedFocus.current) {
      hasInitializedFocus.current = true;
      const currentIdx = options.findIndex((opt) => opt.value === value);
      // react-doctor-disable-next-line react-doctor/no-derived-state, react-doctor/no-chain-state-updates
      setFocusedIndex(currentIdx >= 0 ? currentIdx : 0);
      listboxRef.current.focus();
    }
  }, [isOpen, options, value]);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        listboxRef.current &&
        !listboxRef.current.contains(target)
      ) {
        close();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
    // react-doctor-disable-next-line react-doctor/prefer-use-effect-event
  }, [isOpen, close]);

  const handleSelect = useCallback(
    (optionValue: T) => {
      onChange(optionValue);
      close();
    },
    [onChange, close]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, options.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < options.length) {
            handleSelect(options[focusedIndex].value);
          }
          break;
        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case "End":
          e.preventDefault();
          setFocusedIndex(options.length - 1);
          break;
        case "Tab":
          close();
          break;
      }
    },
    [options, focusedIndex, handleSelect, close]
  );

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        ref={setTriggerRef}
        id={id}
        type="button"
        role="combobox"
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-describedby={ariaDescribedby}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-required={ariaRequired}
        aria-invalid={ariaInvalid}
        data-invalid={ariaInvalid || undefined}
        className={cn(
          "w-full flex items-center justify-between gap-2 min-h-11 px-3 py-2 rounded-lg text-sm",
          "bg-popover border border-border/70",
          "cursor-pointer transition-colors",
          "text-foreground focus-ring",
          !disabled && "hover:bg-popover hover:border-[var(--theme-color)]/40",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span
          className={cn("truncate", !currentOption && "text-muted-foreground")}
        >
          {currentOption?.label ?? placeholder}
        </span>
        <svg
          className={cn(
            "size-3.5 flex-shrink-0 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen &&
        portalTarget &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              aria-hidden="true"
              onClick={close}
            />
            {/* react-doctor-disable-next-line react-doctor/prefer-tag-over-role */}
            <div
              ref={listboxRef}
              id={listboxId}
              role="listbox"
              tabIndex={0}
              aria-label="Select option"
              aria-activedescendant={
                focusedIndex >= 0 ? `select-option-${focusedIndex}` : undefined
              }
              className={cn(
                "fixed z-50",
                "bg-popover border border-border/70 rounded-lg",
                "shadow-xl shadow-black/25 ring-1 ring-white/5",
                "max-h-60 overflow-y-auto",
                "animate-in fade-in-0 zoom-in-95 duration-150"
              )}
              style={menuStyle}
              onKeyDown={handleKeyDown}
            >
              {options.map((option, index) => (
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- Listbox handles keyboard navigation via aria-activedescendant
                <div
                  key={option.value}
                  id={`select-option-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => handleSelect(option.value)}
                  tabIndex={-1}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer",
                    option.value === value &&
                      "bg-accent text-accent-foreground font-medium",
                    option.value !== value && "hover:bg-accent/50",
                    focusedIndex === index &&
                      option.value !== value &&
                      "bg-accent/30"
                  )}
                >
                  {option.label}
                </div>
              ))}
            </div>
          </>,
          portalTarget
        )}
    </div>
  );
}
