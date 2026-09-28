import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Full props of the dock entry: the input-zone runtime share (session standard kit). */
export type WorkingLineProps = PropsRuntime<'conversation.input.dock'>;
/**
 * Working-line dock entry: reads the session's latest `workingActivity`
 * projection value and renders the row, or nothing when idle/absent.
 */
export declare function WorkingLine({ useProjection }: WorkingLineProps): import("react").JSX.Element | null;
