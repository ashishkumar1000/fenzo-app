/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import App from '../src/App';

// The App mount effect fires refreshRemoteConfig(); pin the network down so
// the suite never depends on whether the jest env polyfills fetch (BMAD
// review P3) — a raised prod min_supported_version must not flip this render.
(global as Record<string, unknown>).fetch = jest.fn(() =>
  Promise.reject(new Error('no network in tests')),
);

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
