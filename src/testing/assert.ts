import { expect } from "vitest";

type ErrorClass<E extends Error = Error> = new (...args: never[]) => E;

export function assert(expr: unknown, msg = "Assertion failed"): asserts expr {
  expect(Boolean(expr), msg).toBe(true);
}

export function assertEquals<T>(actual: unknown, expected: T, msg?: string) {
  expect(actual, msg).toStrictEqual(expected);
}

export function assertNotEquals(actual: unknown, expected: unknown, msg?: string) {
  expect(actual, msg).not.toStrictEqual(expected);
}

export function assertStrictEquals<T>(actual: unknown, expected: T, msg?: string) {
  expect(actual, msg).toBe(expected);
}

export function assertStringIncludes(actual: string, expected: string, msg?: string) {
  expect(actual, msg).toContain(expected);
}

export function assertMatch(actual: string, expected: RegExp, msg?: string) {
  expect(actual, msg).toMatch(expected);
}

function checkError(
  error: unknown,
  errorClass?: ErrorClass,
  msgIncludes?: string,
) {
  if (errorClass) expect(error).toBeInstanceOf(errorClass);
  if (msgIncludes !== undefined) {
    expect(error instanceof Error ? error.message : String(error)).toContain(
      msgIncludes,
    );
  }
}

export function assertThrows<E extends Error>(
  fn: () => unknown,
  errorClass: ErrorClass<E>,
  msgIncludes?: string,
): E;
export function assertThrows(
  fn: () => unknown,
  errorClass?: ErrorClass,
  msgIncludes?: string,
): unknown;
export function assertThrows(
  fn: () => unknown,
  errorClass?: ErrorClass,
  msgIncludes?: string,
) {
  try {
    fn();
  } catch (error) {
    checkError(error, errorClass, msgIncludes);
    return error;
  }
  throw new Error("Expected function to throw");
}

export function assertRejects<E extends Error>(
  fn: () => PromiseLike<unknown>,
  errorClass: ErrorClass<E>,
  msgIncludes?: string,
): Promise<E>;
export function assertRejects(
  fn: () => PromiseLike<unknown>,
  errorClass?: ErrorClass,
  msgIncludes?: string,
): Promise<unknown>;
export async function assertRejects(
  fn: () => PromiseLike<unknown>,
  errorClass?: ErrorClass,
  msgIncludes?: string,
) {
  try {
    await fn();
  } catch (error) {
    checkError(error, errorClass, msgIncludes);
    return error;
  }
  throw new Error("Expected promise to reject");
}
