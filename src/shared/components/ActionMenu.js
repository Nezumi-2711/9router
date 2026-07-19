"use client";

import { useEffect, useId, useRef, useState } from "react";
import PropTypes from "prop-types";

const MENU_WIDTH = 192;
const VIEWPORT_GUTTER = 12;

/**
 * Compact, reusable overflow menu for contextual row actions.
 */
export default function ActionMenu({ ariaLabel, items, title = "More options" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [opensRight, setOpensRight] = useState(true);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();

  const updateHorizontalPlacement = () => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) return;

    setOpensRight(triggerRect.left + MENU_WIDTH <= window.innerWidth - VIEWPORT_GUTTER);
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setIsOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        menuRef.current?.querySelector("button")?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateHorizontalPlacement);
    updateHorizontalPlacement();
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateHorizontalPlacement);
    };
  }, [isOpen]);

  const handleSelect = (item) => {
    if (item.disabled) return;
    setIsOpen(false);
    item.onSelect();
  };

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        ref={triggerRef}
        onClick={() => {
          updateHorizontalPlacement();
          setIsOpen((open) => !open);
        }}
        className="inline-flex size-8 items-center justify-center rounded-md border border-border/80 bg-sidebar/60 text-text-muted shadow-[0_1px_0_rgb(255_255_255/0.03)] transition-[background-color,color,transform,box-shadow] duration-150 hover:bg-background hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 active:scale-95"
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
      >
        <span className="material-symbols-outlined text-[19px]">more_vert</span>
      </button>

      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label={ariaLabel}
          className={`absolute top-full z-30 mt-1.5 w-48 min-w-0 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-soft ${
            opensRight ? "left-0" : "right-0"
          }`}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => handleSelect(item)}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                item.dividerBefore ? "mt-1 border-t border-border pt-3" : ""
              } ${
                item.danger
                  ? "text-red-400 hover:bg-red-500/12"
                  : "text-text-main hover:bg-sidebar"
              }`}
            >
              <span
                className="material-symbols-outlined text-[17px] text-text-muted"
                style={item.spinning ? { animation: "spin 1s linear infinite" } : undefined}
              >
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

ActionMenu.propTypes = {
  ariaLabel: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    icon: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    onSelect: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
    dividerBefore: PropTypes.bool,
    danger: PropTypes.bool,
    spinning: PropTypes.bool,
  })).isRequired,
  title: PropTypes.string,
};