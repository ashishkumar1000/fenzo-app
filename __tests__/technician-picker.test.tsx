/**
 * TechnicianPicker — both variants and the two empty states. The tiles
 * variant (New job) carries the "Invited" marker and the deselect-on-retap
 * behavior; the rows variant (Edit job sheet) is the sheet-sized list. The
 * empty-roster vs no-search-match copy split is asserted per the review
 * finding — the two mean different things to the user.
 */
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { TechnicianPicker } from '../src/components/TechnicianPicker';
import type { ProfileTechnician } from '../src/services';

const ROSTER: ProfileTechnician[] = [
  {
    id: 'tech-1',
    name: 'Suresh Kumar',
    countryCode: '+91',
    phoneNumber: '9876543210',
    status: 'active',
    skills: ['ac_technician'],
    skillIds: ['skill-1'],
    createdAt: '2026-08-01T06:00:00.000Z',
  },
  {
    id: 'tech-2',
    name: 'Anil Verma',
    countryCode: '+91',
    phoneNumber: '9800000000',
    status: 'invited',
    skills: ['fridge_repair'],
    skillIds: ['skill-2'],
    createdAt: '2026-08-02T06:00:00.000Z',
  },
];

function mount(
  props: Partial<React.ComponentProps<typeof TechnicianPicker>> = {},
): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <TechnicianPicker
        technicians={ROSTER}
        selectedId={null}
        onSelect={() => {}}
        {...props}
      />,
    );
  });
  return renderer;
}

function allText(renderer: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: ReactTestInstance) => {
    for (const child of node.children) {
      if (typeof child === 'string') parts.push(child);
      else walk(child);
    }
  };
  walk(renderer.root);
  return parts.join(' ');
}

/** The Pressable wrapping the given label (tile, row or the search input's). */
function pressableFor(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  const textNode = renderer.root.find(
    node => node.children.some(c => typeof c === 'string' && c === label),
  );
  let node: ReactTestInstance | null = textNode;
  while (node && !isPressable(node)) node = node.parent;
  if (!node) throw new Error(`No Pressable wrapping "${label}"`);
  return node;
}

function isPressable(node: ReactTestInstance): boolean {
  if (typeof node.type === 'string') return false;
  const component = node.type as { displayName?: string; name?: string };
  return component.displayName === 'Pressable' || component.name === 'Pressable';
}

async function type(renderer: ReactTestRenderer, query: string): Promise<void> {
  const input = renderer.root.find(
    node => typeof node.type !== 'string' && node.type === TextInput,
  );
  await act(async () => {
    input.props.onChangeText(query);
  });
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('TechnicianPicker (tiles)', () => {
  it('renders the roster and marks a still-invited technician', () => {
    const renderer = mount();

    const text = allText(renderer);
    expect(text).toContain('Suresh Kumar');
    expect(text).toContain('Anil Verma');
    expect(text).toContain('Invited');
  });

  it('selects on tap and deselects (null) on tapping the same tile again', async () => {
    const onSelect = jest.fn();
    const renderer = mount({ onSelect });

    await act(async () => {
      pressableFor(renderer, 'Suresh Kumar').props.onPress();
    });
    expect(onSelect).toHaveBeenLastCalledWith('tech-1');

    // Controlled component: the caller re-renders with the new selection, and
    // only then does the second tap read as a deselect.
    await act(async () => {
      renderer.update(
        <TechnicianPicker
          technicians={ROSTER}
          selectedId="tech-1"
          onSelect={onSelect}
        />,
      );
    });
    await act(async () => {
      pressableFor(renderer, 'Suresh Kumar').props.onPress();
    });
    // Second tap on the selected tile = deselect, not a re-select.
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});

describe('TechnicianPicker (rows)', () => {
  it('lists names with their skills caption', () => {
    const renderer = mount({ variant: 'rows' });

    const text = allText(renderer);
    expect(text).toContain('Suresh Kumar');
    expect(text).toContain('ac_technician');
  });

  it('filters by name as the user types', async () => {
    const renderer = mount({ variant: 'rows' });
    await type(renderer, 'anil');

    expect(allText(renderer)).toContain('Anil Verma');
    expect(allText(renderer)).not.toContain('Suresh Kumar');
  });
});

describe('TechnicianPicker empty states', () => {
  it('says the roster is empty when there are no technicians at all', () => {
    const renderer = mount({ technicians: [] });
    expect(allText(renderer)).toContain('No technicians added yet.');
  });

  it('distinguishes a no-match search from an empty roster', async () => {
    const renderer = mount();
    await type(renderer, 'zzz');

    expect(allText(renderer)).toContain('No technician matches that name.');
    expect(allText(renderer)).not.toContain('No technicians added yet.');
  });
});