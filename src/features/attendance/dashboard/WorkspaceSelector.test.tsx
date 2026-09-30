/**
 * WorkspaceSelector per-component tests (Story 19-4, BMAD review
 * verification-gap): the Sites pill is the count's job (the CALLER passes
 * null when a filter is active, "single source" — no hidden logic
 * client-side), singularises at 1, renders the current selection, and
 * opens the filter sheet on press.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { WorkspaceSelector } from './WorkspaceSelector';

function render(label: string, officesCount: number | null) {
  const onPress = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <WorkspaceSelector label={label} officesCount={officesCount} onPress={onPress} />,
    );
  });
  return { onPress, renderer };
}

function textContents(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map(t =>
      Array.isArray(t.props.children)
        ? t.props.children.join('')
        : String(t.props.children ?? ''),
    );
}

/** The composite mirrors accessibility onto host Views — match the label
 *  AND require the onPress (the house idiom). */
function pressCarrier(renderer: ReactTestRenderer.ReactTestRenderer): ReactTestRenderer.ReactTestInstance {
  const matches = renderer.root.findAll(
    node => typeof node.props.onPress === 'function' &&
      String(node.props.accessibilityLabel ?? '').includes('Filter by office'),
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe('WorkspaceSelector', () => {
  it('shows the selection and fires the sheet open on press', () => {
    const { onPress, renderer } = render('All offices', 3);
    expect(textContents(renderer)).toContain('All offices');
    const carries = pressCarrier(renderer);
    expect(carries.props.accessibilityLabel).toBe('Filter by office, currently All offices');
    act(() => {
      carries.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('the pill hide/show is the count\'s job (null hides — the CALLER passes null when filtered)', () => {
    expect(textContents(render('All offices', 3).renderer)).toContain('3 Sites');
    expect(textContents(render('All offices', null).renderer)).not.toContain('3 Sites');
  });

  it('the pill singularises at 1 office', () => {
    expect(textContents(render('All offices', 1).renderer)).toContain('1 Site');
    expect(textContents(render('All offices', 1).renderer)).not.toContain('1 Sites');
  });
});