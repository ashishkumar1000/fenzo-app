/**
 * Manual jest mock for react-native-mmkv (root __mocks__ dir is picked up
 * automatically for node_modules packages). The real library boots a native
 * TurboModule at import. The app only consumes createMMKV with the four
 * storage methods below, so a Map-backed fake is enough.
 */
type MMKVInstance = {
  getString: (key: string) => string | undefined;
  getBoolean: (key: string) => boolean | undefined;
  set: (key: string, value: string | boolean | number) => void;
  remove: (key: string) => void;
};

export function createMMKV(): MMKVInstance {
  const map = new Map<string, string | boolean | number>();
  return {
    getString: key => {
      const v = map.get(key);
      return typeof v === 'string' ? v : undefined;
    },
    getBoolean: key => {
      const v = map.get(key);
      return typeof v === 'boolean' ? v : undefined;
    },
    set: (key, value) => map.set(key, value),
    remove: key => map.delete(key),
  };
}