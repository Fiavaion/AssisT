/**
 * @jest-environment jsdom
 *
 * Maths Support feature orchestration — settings → mounted tools.
 *
 * The module maps the `assist_settings.maths` block onto the two page tools (calculator FAB,
 * number formatting), lazy-loading each only when it is actually switched on. These tests drive
 * the applier with injected fake loaders — no real calculator/formatter code runs.
 */

import {
  MATHS_DEFAULT_SETTINGS,
  resolveMathsState,
  createMathsApplier,
  MATHS_FORMAT_STYLE_ID,
} from '../../../src/features/maths/maths-feature.js';

describe('resolveMathsState', () => {
  it('is fully off by default (master toggle opt-in)', () => {
    expect(resolveMathsState(undefined)).toEqual({
      calculator: false,
      numberFormat: false,
      placeValue: false,
    });
    expect(resolveMathsState(MATHS_DEFAULT_SETTINGS)).toEqual({
      calculator: false,
      numberFormat: false,
      placeValue: false,
    });
  });

  it('enabling the master toggle turns the calculator on (its own default is on)', () => {
    expect(resolveMathsState({ enabled: true })).toEqual({
      calculator: true,
      numberFormat: false,
      placeValue: false,
    });
  });

  it('sub-toggles only count while the master toggle is on', () => {
    expect(resolveMathsState({ enabled: false, numberFormat: true, calculator: true })).toEqual({
      calculator: false,
      numberFormat: false,
      placeValue: false,
    });
    expect(resolveMathsState({ enabled: true, numberFormat: true, placeValue: true })).toEqual({
      calculator: true,
      numberFormat: true,
      placeValue: true,
    });
  });

  it('the calculator can be switched off independently', () => {
    expect(resolveMathsState({ enabled: true, calculator: false }).calculator).toBe(false);
  });
});

describe('createMathsApplier', () => {
  let calc;
  let fmt;
  let applier;

  beforeEach(() => {
    document.body.innerHTML = '<p>Total: 1234567</p>';
    document.getElementById(MATHS_FORMAT_STYLE_ID)?.remove();
    calc = { mountMathCalculator: jest.fn(), unmountMathCalculator: jest.fn() };
    fmt = { applyNumberFormatting: jest.fn(), removeNumberFormatting: jest.fn() };
    applier = createMathsApplier({
      loadCalculator: jest.fn(async () => calc),
      loadFormatter: jest.fn(async () => fmt),
    });
  });

  it('does nothing (and loads nothing) while disabled', async () => {
    await applier.applySettings({ enabled: false });
    expect(calc.mountMathCalculator).not.toHaveBeenCalled();
    expect(fmt.applyNumberFormatting).not.toHaveBeenCalled();
    expect(document.getElementById(MATHS_FORMAT_STYLE_ID)).toBeNull();
  });

  it('mounts the calculator when enabled and unmounts when disabled', async () => {
    await applier.applySettings({ enabled: true });
    expect(calc.mountMathCalculator).toHaveBeenCalledTimes(1);

    await applier.applySettings({ enabled: true }); // same state — no re-mount
    expect(calc.mountMathCalculator).toHaveBeenCalledTimes(1);

    await applier.applySettings({ enabled: false });
    expect(calc.unmountMathCalculator).toHaveBeenCalledTimes(1);
  });

  it('applies number formatting with the place-value option and injects its stylesheet', async () => {
    await applier.applySettings({ enabled: true, numberFormat: true, placeValue: true });
    expect(fmt.applyNumberFormatting).toHaveBeenCalledWith(document.body, { placeValue: true });
    expect(document.getElementById(MATHS_FORMAT_STYLE_ID)).toBeTruthy();
  });

  it('removes formatting and its stylesheet when the sub-toggle goes off', async () => {
    await applier.applySettings({ enabled: true, numberFormat: true });
    await applier.applySettings({ enabled: true, numberFormat: false });
    expect(fmt.removeNumberFormatting).toHaveBeenCalledWith(document.body);
    expect(document.getElementById(MATHS_FORMAT_STYLE_ID)).toBeNull();
  });

  it('re-applies formatting when the place-value option flips while on', async () => {
    await applier.applySettings({ enabled: true, numberFormat: true, placeValue: false });
    expect(fmt.applyNumberFormatting).toHaveBeenLastCalledWith(document.body, {
      placeValue: false,
    });
    await applier.applySettings({ enabled: true, numberFormat: true, placeValue: true });
    expect(fmt.removeNumberFormatting).toHaveBeenCalled();
    expect(fmt.applyNumberFormatting).toHaveBeenLastCalledWith(document.body, { placeValue: true });
  });

  it('turning the master toggle off tears down BOTH tools', async () => {
    await applier.applySettings({ enabled: true, numberFormat: true });
    await applier.applySettings({ enabled: false, numberFormat: true });
    expect(calc.unmountMathCalculator).toHaveBeenCalled();
    expect(fmt.removeNumberFormatting).toHaveBeenCalled();
    expect(document.getElementById(MATHS_FORMAT_STYLE_ID)).toBeNull();
  });

  it('exposes openCalculator on window.assistFeatures.maths only while the calculator is mounted', async () => {
    const handle = { open: jest.fn() };
    calc.mountMathCalculator.mockReturnValue(handle);
    delete window.assistFeatures;

    await applier.applySettings({ enabled: true });
    window.assistFeatures.maths.openCalculator();
    expect(handle.open).toHaveBeenCalledTimes(1);

    await applier.applySettings({ enabled: false });
    expect(window.assistFeatures.maths).toBeUndefined();
  });

  it('registers a maths entry without openCalculator while Maths Support is on and the calculator is off', async () => {
    delete window.assistFeatures;
    await applier.applySettings({ enabled: true, calculator: false });
    expect(window.assistFeatures.maths).toBeDefined();
    expect(window.assistFeatures.maths.openCalculator).toBeUndefined();

    await applier.applySettings({ enabled: false, calculator: false });
    expect(window.assistFeatures.maths).toBeUndefined();
  });

  it('a loader failure degrades quietly and never throws', async () => {
    const broken = createMathsApplier({
      loadCalculator: jest.fn(async () => {
        throw new Error('chunk failed');
      }),
      loadFormatter: jest.fn(async () => fmt),
    });
    await expect(broken.applySettings({ enabled: true, numberFormat: true })).resolves.not.toThrow();
    // The formatter half still applied despite the calculator chunk failing.
    expect(fmt.applyNumberFormatting).toHaveBeenCalled();
  });
});
