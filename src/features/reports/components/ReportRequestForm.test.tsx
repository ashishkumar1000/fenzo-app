/**
 * ReportRequestForm — the request card's gating contract (story 12-6):
 * Generate is enabled only when `validateRange` passes (start ≤ end, ≤ 92
 * days inclusive, nothing in the future on the IST clock) and the submit
 * is not in flight; an empty technician MultiSelect means "all technicians".
 * ReportsScreen.test mocks this form, so this spec is the only place the
 * gate itself is exercised.
 */
import React from 'react';
import { Text } from 'react-native';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { Button, MultiSelect } from '../../../components/ui';
import { ReportRequestForm } from './ReportRequestForm';
import type { Technician } from '../../technicians/types';

const makeTechnician = (id: string, name: string): Technician => ({
  id,
  name,
  phone: '9876543210',
  status: 'active',
  invitedAt: '2026-08-01T06:00:00.000Z',
  skillIds: [],
});

const technicians = [
  makeTechnician('t-1', 'Ravi'),
  makeTechnician('t-2', 'Sana'),
];

const validProps = {
  startDate: '2026-09-01',
  endDate: '2026-09-20',
  selectedTechnicianIds: [] as string[],
  technicians,
  todayIso: '2026-09-20',
  isSubmitting: false,
  submitError: null as string | null,
};

type Change = {
  startDate?: string;
  endDate?: string;
  technicianIds?: string[];
};

/** Renders the form; returns the tree plus the captured change calls. */
function renderForm(props: Partial<typeof validProps> = {}) {
  const changes: Change[] = [];
  const onChange = (next: Change) => {
    changes.push(next);
  };
  let onSubmit = jest.fn();
  let renderer!: ReactTestRenderer;
  let root!: ReactTestInstance;
  act(() => {
    renderer = create(
      <ReportRequestForm
        {...validProps}
        {...props}
        onChange={onChange}
        onSubmit={onSubmit}
      />,
    );
  });
  root = renderer.root;
  return { root, changes, onSubmit: () => onSubmit };
}

/** Joins nested Text children (arrays, elements) into one string. */
function flatten(children: unknown): string {
  if (children === null || children === undefined || typeof children === 'boolean') {
    return '';
  }
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(flatten).join('');
  }
  const el = children as ReactTestInstance;
  return el.props ? flatten(el.props.children) : '';
}

/** The card's primary action, found by its fixed label. */
function generateButton(root: ReactTestInstance) {
  return root
    .findAllByType(Button)
    .find(b => flatten(b.props.children) === 'Generate report');
}

/** All Text on the card, joined — used to find the validation line. */
function allText(root: ReactTestInstance): string {
  return root
    .findAllByType(Text)
    .map(t => flatten(t.props.children))
    .join('\n');
}

describe('the Generate gate', () => {
  it('enables Generate for a valid range', () => {
    const { root } = renderForm();
    expect(generateButton(root)?.props.disabled).toBe(false);
  });

  it('disables Generate for reversed dates and says why', () => {
    const { root } = renderForm({
      startDate: '2026-09-20',
      endDate: '2026-09-01',
    });
    expect(generateButton(root)?.props.disabled).toBe(true);
    expect(allText(root)).toContain('End date is before the start date');
  });

  it('disables Generate past the 92-day cap and says why', () => {
    const { root } = renderForm({
      startDate: '2026-06-20', // 93 inclusive days to 2026-09-20
      endDate: '2026-09-20',
    });
    expect(generateButton(root)?.props.disabled).toBe(true);
    expect(allText(root)).toContain('Pick a range of 92 days or less');
  });

  it('disables Generate for a future end date on the IST clock', () => {
    const { root } = renderForm({
      todayIso: '2026-09-20',
      endDate: '2026-09-21',
    });
    expect(generateButton(root)?.props.disabled).toBe(true);
    expect(allText(root)).toContain('End date cannot be in the future');
  });

  it('disables Generate and spins while the submit is in flight', () => {
    const { root } = renderForm({ isSubmitting: true });
    const button = generateButton(root);
    expect(button?.props.disabled).toBe(true);
    expect(button?.props.loading).toBe(true);
  });

  it('fires onSubmit when the enabled button is pressed', () => {
    const { root, onSubmit } = renderForm();
    act(() => {
      generateButton(root)!.props.onPress();
    });
    expect(onSubmit().mock.calls).toHaveLength(1);
  });
});

describe('the technician MultiSelect', () => {
  it('shows the All technicians placeholder when nothing is selected', () => {
    const { root } = renderForm({ selectedTechnicianIds: [] });
    expect(root.findAllByType(MultiSelect)[0].props.placeholder).toBe(
      'All technicians',
    );
  });

  it('forwards a selection change as technicianIds', () => {
    const { root, changes } = renderForm();
    act(() => {
      root.findAllByType(MultiSelect)[0].props.onChange(['t-2']);
    });
    expect(changes).toEqual([{ technicianIds: ['t-2'] }]);
  });

  it('offers the roster as value/label options', () => {
    const { root } = renderForm();
    expect(root.findAllByType(MultiSelect)[0].props.options).toEqual([
      { value: 't-1', label: 'Ravi' },
      { value: 't-2', label: 'Sana' },
    ]);
  });
});