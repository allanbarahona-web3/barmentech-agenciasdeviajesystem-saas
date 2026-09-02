'use client';

import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './help-tooltip.module.css';

export interface HelpTooltipProps {
  content: ReactNode;
  label?: string;
}

export function HelpTooltip({
  content,
  label = 'Mostrar ayuda',
}: HelpTooltipProps) {
  const tooltipId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  function open() {
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (bounds) setPosition({ top: bounds.bottom + 8, left: bounds.left + bounds.width / 2 });
    setIsOpen(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') {
      setIsOpen(false);
      event.currentTarget.blur();
    }
  }

  return (
    <span
      className={`${styles.root} ${isOpen ? styles.open : ''}`}
      onMouseEnter={open}
      onMouseLeave={() => setIsOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-describedby={tooltipId}
        aria-expanded={isOpen}
        ref={triggerRef}
        onClick={() => isOpen ? setIsOpen(false) : open()}
        onFocus={open}
        onKeyDown={handleKeyDown}
      >
        ?
      </button>
      {typeof document !== 'undefined' && createPortal(<span className={`${styles.tooltip} ${isOpen ? styles.visible : ''}`} id={tooltipId} role="tooltip" style={position}>{content}</span>, document.body)}
    </span>
  );
}
