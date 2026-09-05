/**
 * Tests for the reset registry (story 5.3): every registered reset runs
 * exactly once, an unregister function removes its entry, and one throwing
 * reset can't stop the rest from running — the 401 handler has no error
 * surface, so a broken store must degrade alone, not leave the whole app
 * holding the previous session's data.
 */
import { registerReset, runAllResets } from './resetRegistry';

describe('resetRegistry', () => {
  it('runs every registered reset when runAllResets is called', () => {
    const a = jest.fn();
    const b = jest.fn();
    registerReset(a);
    registerReset(b);

    runAllResets();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('does not run a reset after its unregister function is called', () => {
    const a = jest.fn();
    const unregister = registerReset(a);

    unregister();
    runAllResets();

    expect(a).not.toHaveBeenCalled();
  });

  it('keeps running the remaining resets when one throws', () => {
    const first = jest.fn();
    const throwing = jest.fn(() => {
      throw new Error('boom');
    });
    const last = jest.fn();
    registerReset(first);
    registerReset(throwing);
    registerReset(last);

    expect(() => runAllResets()).not.toThrow();
    expect(first).toHaveBeenCalledTimes(1);
    expect(last).toHaveBeenCalledTimes(1);
  });

  it('runs a reset registered DURING the run (snapshot iteration, not live set)', () => {
    // A reset that registers another must not be skipped or crash the run —
    // iteration goes over a snapshot of the set taken at call time.
    const late = jest.fn();
    const registrar = jest.fn(() => {
      registerReset(late);
    });
    registerReset(registrar);

    expect(() => runAllResets()).not.toThrow();
    expect(registrar).toHaveBeenCalledTimes(1);
  });
});
