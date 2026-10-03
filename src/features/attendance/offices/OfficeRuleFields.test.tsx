/**
 * Tests for OfficeRuleFields' picker wiring (Story 18-4 §10 D-TP3): Start/
 * End time are DS `TimeField`s (the native picker; no keyboard), the three
 * minute-count fields stay typed Inputs, and the model's submit-time error
 * copy flows into the TimeField error slots. The model itself
 * (officeFormModel.ts) has its own suite — this pins the WIRING.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { Input, TimeField } from '../../../components/ui';
import { emptyOfficeForm } from './officeFormModel';
import OfficeRuleFields from './OfficeRuleFields';

function texts(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root.findAllByType(Text).map(t =>
    Array.isArray(t.props.children)
      ? t.props.children.join('')
      : String(t.props.children ?? ''),
  );
}

function timeField(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const field = root.findAllByType(TimeField).find(f => f.props.label === label);
  if (field == null) throw new Error(`no time field labelled "${label}"`);
  return field;
}

async function renderFields(
  overrides: Partial<React.ComponentProps<typeof OfficeRuleFields>> = {},
) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const onChange = jest.fn();
  await act(async () => {
    renderer = create(
      <OfficeRuleFields
        state={emptyOfficeForm()}
        errors={{}}
        onChange={onChange}
        isEdit={false}
        {...overrides}
      />,
    );
  });
  return { root: renderer.root, onChange };
}

describe('OfficeRuleFields picker wiring (D-TP3)', () => {
  it('Start/End render as picker fields seeded with the defaults; counts stay typed Inputs', async () => {
    const { root } = await renderFields();
    expect(timeField(root, 'Start time').props.value).toBe('09:30');
    expect(timeField(root, 'End time').props.value).toBe('18:30');
    // The minute-count fields are NOT picker fields.
    const inputs = root.findAllByType(Input).map(i => i.props.label);
    expect(inputs).toContain('Late after (minutes)');
    expect(inputs).not.toContain('Start time');
  });

  it('a picked time patches the form state through onChange', async () => {
    const { root, onChange } = await renderFields();
    await act(async () => {
      timeField(root, 'Start time').props.onChangeValue('08:15');
    });
    expect(onChange).toHaveBeenCalledWith({ startTime: '08:15' });
  });

  it('the model\'s submit-time copy flows into the picker fields\' error slots', async () => {
    const { root } = await renderFields({
      errors: {
        startTime: 'Use 24-hour time — 09:00 means 9 AM',
        endTime: 'Use 24-hour time — 18:00 means 6 PM',
      },
    });
    expect(timeField(root, 'Start time').props.error).toBe(
      'Use 24-hour time — 09:00 means 9 AM',
    );
    expect(timeField(root, 'End time').props.error).toBe(
      'Use 24-hour time — 18:00 means 6 PM',
    );
    expect(texts(root)).toContain('Use 24-hour time — 09:00 means 9 AM');
  });
});
