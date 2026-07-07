import type { ComponentType } from 'react';

/**
 * Generic Wizard Step Definition
 * 
 * Describes the metadata and behavior of a single wizard step.
 * Designed to be reusable across different wizard types (Contracts, Operations, Internal Tourism).
 * 
 * @template TProps - The props type for the step component
 */
export interface WizardStepDefinition<TProps = any> {
  /**
   * Unique identifier for the step.
   * Used for navigation, tracking, and conditional logic.
   * 
   * @example "travel", "holder", "companions"
   */
  id: string;

  /**
   * Display title for the step.
   * Shown in navigation UI, breadcrumbs, or progress indicators.
   * 
   * @example "Viaje", "Titular", "Acompañantes"
   */
  title: string;

  /**
   * Sequential order of the step in the wizard flow.
   * Lower numbers appear first.
   * 
   * @example 1, 2, 3
   */
  order: number;

  /**
   * React component to render for this step.
   * Must accept TProps as its props.
   */
  component: ComponentType<TProps>;

  /**
   * Optional validation function.
   * Determines if the step data is valid before allowing progression.
   * 
   * Function-based (not boolean) to support future conditional validation logic
   * based on wizard state, user permissions, or external factors.
   * 
   * @param props - Current step props (contains state and handlers)
   * @returns true if step is valid, false otherwise
   * 
   * @default () => true (always valid)
   */
  validate?: (props: TProps) => boolean;

  /**
   * Optional visibility function.
   * Determines if the step should be shown in the wizard flow.
   * 
   * Function-based (not boolean) to support future conditional visibility logic
   * based on wizard state, configuration, or user selections.
   * 
   * @param props - Current step props (contains state and context)
   * @returns true if step is visible, false otherwise
   * 
   * @default () => true (always visible)
   */
  isVisible?: (props: TProps) => boolean;

  /**
   * Optional "optional step" function.
   * Determines if the step can be skipped without completing it.
   * 
   * Function-based (not boolean) to support future conditional logic
   * based on wizard configuration or business rules.
   * 
   * @param props - Current step props (contains state and context)
   * @returns true if step is optional, false if required
   * 
   * @default () => false (required by default)
   */
  isOptional?: (props: TProps) => boolean;
}

/**
 * Wizard Step Registry
 * 
 * A collection of step definitions for a specific wizard type.
 * Serves as the single source of truth for step metadata, order, and components.
 * 
 * @template TProps - The common props type shared by all steps in this wizard
 */
export type WizardStepRegistry<TProps = any> = WizardStepDefinition<TProps>[];
