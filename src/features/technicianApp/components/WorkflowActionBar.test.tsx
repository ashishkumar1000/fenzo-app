/**
 * Render tests for the workflow action bar's three content shapes: the
 * advance button (with loading), the non-tappable photo-hint pill, the
 * static completed row, and the InlineError line.
 *
 * Note: react-test-renderer + React 19 can surface one host element as two
 * identical traversal entries, so prop-lookups use "at least one / none" and
 * filter by distinguishing props (onPress) rather than exact counts.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from 'react-native';
import { WorkflowActionBar } from './WorkflowActionBar';
import type { ActionBarAction } from '../workflowActionBarModel';

type Action = Exclude<ActionBarAction, { kind: 'none' }>;
type BarProps = Parameters<typeof WorkflowActionBar>[0];

const SAFE_METRICS = {
  insets: { top: 0, bottom: 34, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 0, height: 0 },
};

function renderBar(action: Action, props: Partial<BarProps> = {}) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <SafeAreaProvider initialMetrics={SAFE_METRICS}>
        <WorkflowActionBar
          action={action}
          pending={false}
          onAdvance={jest.fn()}
          error={null}
          onDismissError={jest.fn()}
          {...props}
        />
      </SafeAreaProvider>,
    );
  });
  return renderer.root;
}

/** The Pressable carries `onPress`; its inner forward view doesn't. */
function advancePressable(root: ReturnType<ReactTestRenderer['root']['findAllByProps']> extends never ? never : any) {
  const matches = root.findAllByProps({ testID: 'workflow-advance-button' });
  return matches.filter((e: any) => 'onPress' in e.props);
}

const advance: Action = { kind: 'button', step: 'on_my_way', label: 'On my way' };

describe('WorkflowActionBar', () => {
  it('renders the advance button with the step label', () => {
    const root = renderBar(advance);
    const pressable = advancePressable(root);
    expect(pressable.length).toBeGreaterThan(0);
    const label = pressable[0].findByType(Text);
    expect(label.props.children).toBe('On my way');
  });

  it('blocks pressing while pending (loading, double-tap impossible)', () => {
    const root = renderBar(advance, { pending: true });
    const pressable = advancePressable(root);
    expect(pressable.length).toBeGreaterThan(0);
    // Duplicate traversal entries can carry a stale prop snapshot; only the
    // live Pressable's `disabled` is meaningful (undefined on the others).
    const disabled = pressable
      .map((e: any) => e.props.disabled as boolean | undefined)
      .find((d: boolean | undefined) => d !== undefined);
    expect(disabled).toBe(true);
  });

  it("advances with the bar's step, not a captured label", () => {
    const onAdvance = jest.fn();
    const root = renderBar({ kind: 'button', step: 'in_progress', label: 'Start work' }, { onAdvance });
    act(() => {
      advancePressable(root)[0].props.onPress();
    });
    expect(onAdvance).toHaveBeenCalledWith('in_progress');
  });

  it('renders the non-tappable photo hint pill (no button)', () => {
    const root = renderBar({ kind: 'photoHint' });
    expect(root.findAllByProps({ testID: 'workflow-advance-button' })).toHaveLength(0);
    expect(root.findAllByProps({ accessibilityLabel: 'Upload a photo to continue' }).length).toBeGreaterThan(0);
  });

  it('renders the static Job completed row (no button)', () => {
    const root = renderBar({ kind: 'completed' });
    expect(root.findAllByProps({ testID: 'workflow-advance-button' })).toHaveLength(0);
    expect(root.findAllByProps({ accessibilityLabel: 'Job completed' }).length).toBeGreaterThan(0);
  });

  it('shows the InlineError line above the bar when error is set', () => {
    const root = renderBar(advance, { error: 'This job can no longer be updated' });
    const texts = root
      .findAllByType(Text)
      .map(t => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
      .join(' | ');
    expect(texts).toContain('This job can no longer be updated');
  });
});