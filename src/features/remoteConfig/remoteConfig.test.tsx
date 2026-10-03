import { Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { getVersion } from 'react-native-device-info';
import {
  ForcedUpdateScreen,
  MaintenanceBanner,
  isVersionUnsupported,
} from './index';

const renderedTexts = (element: React.ReactElement): string[] => {
  let root!: TestRenderer.ReactTestRenderer;
  TestRenderer.act(() => {
    root = TestRenderer.create(element);
  });
  return root.root.findAllByType(Text).map(text =>
    Array.isArray(text.props.children)
      ? text.props.children.join('')
      : String(text.props.children),
  );
};

describe('ForcedUpdateScreen', () => {
  it('renders the server copy and the installed version', () => {
    const texts = renderedTexts(
      <ForcedUpdateScreen message="Please update the Fenzit app to continue." />,
    );

    expect(texts).toContain('Update required');
    expect(texts).toContain('Please update the Fenzit app to continue.');
    expect(texts).toContain('Installed version: v1.0.0');
  });
});

describe('MaintenanceBanner', () => {
  it('renders nothing when the banner text is empty (shipped default)', () => {
    let root!: TestRenderer.ReactTestRenderer;
    TestRenderer.act(() => {
      root = TestRenderer.create(<MaintenanceBanner text="" />);
    });

    expect(root.root.findAllByType(Text)).toHaveLength(0);
  });

  it('renders the server copy when set', () => {
    const texts = renderedTexts(<MaintenanceBanner text="Happy Diwali!" />);

    expect(texts).toEqual(['Happy Diwali!']);
  });
});

describe('isVersionUnsupported', () => {
  const versionMock = getVersion as jest.Mock;

  afterEach(() => {
    versionMock.mockReturnValue('1.0.0');
  });

  it('is false when the running build meets the minimum', () => {
    expect(isVersionUnsupported('1.0.0')).toBe(false);
  });

  it('is true when the server minimum is newer than the running build', () => {
    versionMock.mockReturnValue('1.0.0');
    expect(isVersionUnsupported('2.0.0')).toBe(true);
  });
});
