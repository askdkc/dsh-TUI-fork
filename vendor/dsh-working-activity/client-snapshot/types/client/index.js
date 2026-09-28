import { WorkingLine } from './WorkingLine.tsx';
export { WorkingLine } from './WorkingLine.tsx';
/** Required services for the dock registration. */
export const inject = ['slots'];
/**
 * Client plugin body: the working-line dock entry.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        // The pre-slots patch used the same id in ui-conversation; entries with
        // equal order render in registration order, and goal (10) / queue (20)
        // keep their seats — this row sits between them.
        id: 'activity',
        order: 15,
        registrant: 'dsh-working-activity',
    }, WorkingLine));
}
