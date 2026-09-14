/**
 * Render tests for the technician SignatureTile's viewer affordance
 * (Story 9-1, Task 4): the captured tile's image branch is an imagebutton
 * that fires `onView`; the null/failed placeholder branch stays inert.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SignatureTile } from './SignatureTile';

type Props = Parameters<typeof SignatureTile>[0];

function attachment(url: string | null) {
  return { id: 'att-1', type: 'signature' as const, url, createdAt: '2026-09-05T01:00:00.000Z' };
}

async function render(props: Partial<Props> & { url: string | null }) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<SignatureTile attachment={attachment(props.url)} {...props} />);
  });
  return renderer;
}

function imagebuttons(renderer: ReactTestRenderer) {
  return renderer.root.findAll(
    t => t.props.accessibilityRole === 'imagebutton' && typeof t.props.onPress === 'function',
    { deep: true },
  );
}

describe('SignatureTile — viewer affordance (Story 9-1)', () => {
  it('the captured tile is an imagebutton labelled "View customer signature"', async () => {
    const onView = jest.fn();
    const renderer = await render({ url: 'https://r2.example.com/signature', onView });
    const tile = imagebuttons(renderer)[0];
    expect(tile).toBeTruthy();
    expect(tile.props.accessibilityLabel).toBe('View customer signature');
    await act(async () => {
      tile.props.onPress();
    });
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it('the placeholder branch (null url) is not an imagebutton', async () => {
    const onView = jest.fn();
    const renderer = await render({ url: null, onView });
    expect(imagebuttons(renderer)).toHaveLength(0);
  });

  it('without onView the captured tile stays a plain tile (no crash, no press)', async () => {
    const renderer = await render({ url: 'https://r2.example.com/signature' });
    expect(
      renderer.root.findAll(
        t => t.props.accessibilityRole === 'imagebutton' && typeof t.props.onPress === 'function',
        { deep: true },
      ),
    ).toHaveLength(0);
  });
});
