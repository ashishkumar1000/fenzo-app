/**
 * Tests for the FlagListSheet (Story 19-5 D7, spec §5.5): the 19-4
 * deferral lands — the rows are PRESSABLE and the row press hands the row
 * to the OWNER's `onRowPress` (the dashboard closes the sheet AND
 * navigates in the same tick — the native TrueSheet would otherwise float
 * over the pushed drill-down; the close itself is the owner's business,
 * asserted at the dashboard level). The requirements these pin:
 *
 *  - every row is a button-role Pressable whose a11y label is
 *    "«name», «detail»" (the flagRowDetail composition, commas);
 *  - a press calls onRowPress with THAT row — the drill-down payload
 *    (employeeId/employeeName/workDate) comes from it;
 *  - both kinds render their rows in WIRE order, fake-location rows
 *    carrying the attempt count in their detail;
 *  - the closed-and-empty instance (kind null) renders no rows and can
 *    never fire onRowPress.
 */
jest.mock('../../../services', () => ({
  officesService: {
    list: jest.fn(),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FlagListSheet, type FlagListRow } from './FlagListSheet';
import { flagRowDetail } from './dashboardModel';

function checkoutRow(overrides: Record<string, unknown> = {}): FlagListRow {
  return {
    employeeId: 'e1',
    employeeName: 'Arya',
    workDate: '2026-09-14',
    officeName: 'Hero wala',
    ...overrides,
  };
}

function fakeRow(overrides: Record<string, unknown> = {}): FlagListRow {
  return {
    employeeId: 'e3',
    employeeName: 'Citra',
    workDate: '2026-09-16',
    officeName: 'Yuka',
    attemptCount: 2,
    ...overrides,
  };
}

function renderSheet(props: {
  visible?: boolean;
  kind?: 'checkoutMissing' | 'fakeLocationAttempt' | null;
  rows?: FlagListRow[];
}) {
  const onRowPress = jest.fn();
  const onClose = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 0, height: 0 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}>
        <FlagListSheet
          visible={props.visible ?? true}
          kind={props.kind ?? 'checkoutMissing'}
          rows={props.rows ?? [checkoutRow()]}
          onClose={onClose}
          onRowPress={onRowPress}
        />
      </SafeAreaProvider>,
    );
  });
  return { renderer, onRowPress, onClose };
}

function texts(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map(t =>
      Array.isArray(t.props.children)
        ? t.props.children.join('')
        : String(t.props.children ?? ''),
    );
}

/** The composite Pressable is mirrored by a host View in the RTR tree —
 *  require the onPress (the house idiom). */
function rowButtons(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.onPress === 'function' &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.includes(', '),
  );
}

describe('FlagListSheet — the pressable rows (19-5 D7)', () => {
  it('renders each row with its name + detail and the composed a11y label', () => {
    const { renderer } = renderSheet({
      rows: [checkoutRow(), checkoutRow({ employeeId: 'e2', employeeName: 'Ben', workDate: '2026-09-15', officeName: null })],
    });
    const shown = texts(renderer);
    expect(shown).toContain('Arya');
    expect(shown).toContain(flagRowDetail(checkoutRow()));
    expect(shown).toContain('Ben');
    expect(
      shown.includes(flagRowDetail(checkoutRow({ workDate: '2026-09-15', officeName: null }))),
    ).toBe(true);

    const buttons = rowButtons(renderer);
    expect(buttons).toHaveLength(2);
    expect(buttons[0].props.accessibilityLabel).toBe(
      `Arya, ${flagRowDetail(checkoutRow())}`,
    );
    expect(buttons[1].props.accessibilityLabel).toBe(
      `Ben, ${flagRowDetail(checkoutRow({ workDate: '2026-09-15', officeName: null }))}`,
    );
  });

  it('a row press hands THAT row to the owner (the deep-link payload source)', () => {
    const row = checkoutRow();
    const { renderer, onRowPress, onClose } = renderSheet({ rows: [row, fakeRow()] });
    const buttons = rowButtons(renderer);
    act(() => {
      buttons[1].props.onPress();
    });
    expect(onRowPress).toHaveBeenCalledTimes(1);
    expect(onRowPress).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'e3',
        employeeName: 'Citra',
        workDate: '2026-09-16',
        attemptCount: 2,
      }),
    );
    // The sheet's own close is NOT the row press's business — the owner
    // closes AND navigates in the same tick (pinned at the dashboard).
    expect(onClose).not.toHaveBeenCalled();
  });

  it('fake-location rows carry the attempt count in their detail line', () => {
    const { renderer } = renderSheet({
      kind: 'fakeLocationAttempt',
      rows: [fakeRow()],
    });
    expect(texts(renderer)).toContain(flagRowDetail(fakeRow()));
  });

  it('the closed-and-empty instance renders no rows (onRowPress unreachable)', () => {
    const { renderer, onRowPress } = renderSheet({
      visible: false,
      kind: null,
      rows: [],
    });
    expect(rowButtons(renderer)).toHaveLength(0);
    expect(onRowPress).not.toHaveBeenCalled();
  });
});
