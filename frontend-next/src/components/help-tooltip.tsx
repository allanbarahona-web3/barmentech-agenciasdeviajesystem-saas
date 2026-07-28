'use client';

import { type KeyboardEvent, type ReactNode, useId, useState } from 'react';
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

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') {
      setIsOpen(false);
      event.currentTarget.blur();
    }
  }

  return (
    <span
      className={`${styles.root} ${isOpen ? styles.open : ''}`}
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
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        ?
      </button>
      <span className={styles.tooltip} id={tooltipId} role="tooltip">
        {content}
      </span>
    </span>
  );
}
