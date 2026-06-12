import {
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
  options: readonly SelectOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  portalContainer?: HTMLElement | null;
}

function getDefaultPortalContainer(): HTMLElement {
  const dialog = document.querySelector("dialog[open]");
  if (dialog instanceof HTMLElement) return dialog;
  return document.body;
}

export function Select<T extends string = string>({
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
  className,
  portalContainer,
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const listboxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gap = 4;

  const currentOption = options.find((opt) => opt.value === value);

  const close = useCallback(() => setIsOpen(false), []);

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

  useEffect(() => {
    if (isOpen && listboxRef.current) {
      const currentIdx = options.findIndex((opt) => opt.value === value);
      setFocusedIndex(currentIdx >= 0 ? currentIdx : 0);
      listboxRef.current.focus();
    } else {
      setFocusedIndex(-1);
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
      }
    },
    [options, focusedIndex, handleSelect]
  );

  const portalTarget = portalContainer ?? getDefaultPortalContainer();

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm",
          "bg-popover border border-border/70",
          "cursor-pointer transition-colors",
          "text-foreground",
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
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              aria-hidden="true"
              onClick={close}
            />
            <div
              ref={listboxRef}
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
                <button
                  key={option.value}
                  id={`select-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => handleSelect(option.value)}
                  tabIndex={-1}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm transition-colors",
                    option.value === value &&
                      "bg-accent text-accent-foreground font-medium",
                    option.value !== value && "hover:bg-accent/50",
                    focusedIndex === index &&
                      option.value !== value &&
                      "bg-accent/30"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </>,
          portalTarget
        )}
    </div>
  );
}
