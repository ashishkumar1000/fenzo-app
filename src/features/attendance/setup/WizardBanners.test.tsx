/**
 * Tests for WizardBanners' per-surface STALE-banner mapping (15-8): on each
 * step only the banner of a surface that step actually reads may render
 * (`error && hasLoaded` per the useOffices tri-state contract), and the
 * marker-PATCH retry + completion banners render regardless of step.
 *
 * Pure render tests — no services, no navigation.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import { WizardBanners, type WizardSurfaceState } from './WizardBanners';

type BannersProps = ComponentProps<typeof WizardBanners>;

function surface(
  overrides: Partial<WizardSurfaceState> = {},
): WizardSurfaceState {
  return { hasError: false, hasLoaded: true, message: '', ...overrides };
}

function surfaceMessage(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root
    .findAll((n) => n.type === Text)
    .map((n) => String(n.props.children))
    .filter((value) =>
      [
        "Couldn't refresh offices. Showing the last loaded list.",
        "Couldn't refresh your weekly off. Showing the last loaded selection.",
        "Couldn't refresh holidays. Showing the last loaded list.",
        "Couldn't refresh your team. Showing the last loaded list.",
        "Couldn't save your progress. Check your connection and try again.",
        "Attendance couldn't be enabled yet. Check the requirements below and try again.",
      ].includes(value),
    );
}

const ALL_STALE: BannersProps['surfaces'] = {
  offices: surface({ hasError: true, message: "Couldn't refresh offices. Showing the last loaded list." }),
  weeklyOff: surface({
    hasError: true,
    message: "Couldn't refresh your weekly off. Showing the last loaded selection.",
  }),
  holidays: surface({ hasError: true, message: "Couldn't refresh holidays. Showing the last loaded list." }),
  roster: surface({ hasError: true, message: "Couldn't refresh your team. Showing the last loaded list." }),
};

function renderBanners(props: {
  step: BannersProps['step'];
  advanceError?: BannersProps['advanceError'];
  completionError?: BannersProps['completionError'];
  surfaces?: BannersProps['surfaces'];
}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <WizardBanners
        step={props.step}
        advanceError={props.advanceError ?? null}
        onRetryAdvance={() => {}}
        isAdvancing={false}
        completionError={props.completionError ?? null}
        surfaces={props.surfaces ?? ALL_STALE}
      />,
    );
  });
  return renderer.root;
}

describe('WizardBanners per-surface mapping', () => {
  it('each step announces ONLY the surfaces it reads', () => {
    expect(surfaceMessage(renderBanners({ step: 'offices' }))).toEqual([
      "Couldn't refresh offices. Showing the last loaded list.",
    ]);
    expect(surfaceMessage(renderBanners({ step: 'timings' }))).toEqual([
      "Couldn't refresh offices. Showing the last loaded list.",
    ]);
    expect(surfaceMessage(renderBanners({ step: 'weekly_off' }))).toEqual([
      "Couldn't refresh your weekly off. Showing the last loaded selection.",
    ]);
    expect(surfaceMessage(renderBanners({ step: 'holidays' }))).toEqual([
      "Couldn't refresh holidays. Showing the last loaded list.",
    ]);
    // Employees reads offices AND roster — in that order.
    expect(surfaceMessage(renderBanners({ step: 'employees' }))).toEqual([
      "Couldn't refresh offices. Showing the last loaded list.",
      "Couldn't refresh your team. Showing the last loaded list.",
    ]);
  });

  it('a surface with a first-load failure (error && !hasLoaded) renders NO stale banner', () => {
    const surfaces: BannersProps['surfaces'] = {
      ...ALL_STALE,
      offices: surface({
        hasError: true,
        hasLoaded: false,
        message: "Couldn't refresh offices. Showing the last loaded list.",
      }),
    };
    expect(
      surfaceMessage(renderBanners({ step: 'offices', surfaces })),
    ).toEqual([]);
  });

  it('the advance retry banner renders on any step, ahead of the stale banners', () => {
    const messages = surfaceMessage(
      renderBanners({
        step: 'offices',
        advanceError: {
          status: 500,
          code: 'INTERNAL_ERROR',
          message: 'boom',
          details: null,
        },
      }),
    );
    expect(messages).toEqual([
      "Couldn't save your progress. Check your connection and try again.",
      "Couldn't refresh offices. Showing the last loaded list.",
    ]);
  });

  it('the completion banner renders on the final step', () => {
    expect(
      surfaceMessage(
        renderBanners({
          step: 'employees',
          completionError: {
            status: 422,
            code: 'ATTENDANCE_SETUP_INCOMPLETE',
            message: 'gates unmet',
            details: null,
          },
        }),
      ),
    ).toContain(
      "Attendance couldn't be enabled yet. Check the requirements below and try again.",
    );
  });
});
