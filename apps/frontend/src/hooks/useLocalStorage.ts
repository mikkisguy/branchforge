import { useCallback, useEffect, useRef, useState } from "react";

export const STORAGE_PREFIX = "branchforge:";

type SetStateAction<T> = T | ((prev: T) => T);

export interface UseLocalStorageOptions<T> {
  serializer?: (value: T) => string;
  deserializer?: (value: string) => T;
  validate?: (value: T) => boolean;
  ssrSafe?: boolean;
}

function defaultSerializer<T>(value: T): string {
  return JSON.stringify(value);
}

function defaultDeserializer<T>(value: string): T {
  return JSON.parse(value) as T;
}

function defaultValidator<T>(_value: T): boolean {
  return true;
}

function isStorageAvailable(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function logStorageWarning(
  action: "load" | "save" | "remove",
  key: string,
  error: unknown
) {
  console.warn(`Failed to ${action} localStorage value (key: ${key})`, error);
}

export function getPrefixedStorageKey(key: string): string {
  if (key.startsWith(STORAGE_PREFIX)) {
    return key;
  }

  return `${STORAGE_PREFIX}${key}`;
}

export function readLocalStorageItem(rawKey: string): string | null {
  if (!isStorageAvailable()) {
    return null;
  }

  try {
    return window.localStorage.getItem(rawKey);
  } catch (error) {
    logStorageWarning("load", rawKey, error);
    return null;
  }
}

export function writeLocalStorageItem(rawKey: string, value: string): void {
  if (!isStorageAvailable()) {
    return;
  }

  try {
    window.localStorage.setItem(rawKey, value);
  } catch (error) {
    logStorageWarning("save", rawKey, error);
  }
}

export function removeLocalStorageItem(rawKey: string): void {
  if (!isStorageAvailable()) {
    return;
  }

  try {
    window.localStorage.removeItem(rawKey);
  } catch (error) {
    logStorageWarning("remove", rawKey, error);
  }
}

function readStorageValue<T>(
  key: string,
  defaultValue: T,
  deserializer: (value: string) => T,
  validate: (value: T) => boolean,
  ssrSafe: boolean
): T {
  if (ssrSafe && !isStorageAvailable()) {
    return defaultValue;
  }

  if (!isStorageAvailable()) {
    return defaultValue;
  }

  try {
    const item = window.localStorage.getItem(key);
    if (item === null) {
      return defaultValue;
    }

    const parsed = deserializer(item);
    if (!validate(parsed)) {
      return defaultValue;
    }

    return parsed;
  } catch (error) {
    logStorageWarning("load", key, error);
    return defaultValue;
  }
}

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  options?: UseLocalStorageOptions<T>
) {
  const prefixedKey = getPrefixedStorageKey(key);

  const serializer = options?.serializer ?? defaultSerializer<T>;
  const deserializer = options?.deserializer ?? defaultDeserializer<T>;
  const validate = options?.validate ?? defaultValidator<T>;
  const ssrSafe = options?.ssrSafe ?? true;

  const defaultValueRef = useRef(defaultValue);
  const serializerRef = useRef(serializer);
  const deserializerRef = useRef(deserializer);
  const validateRef = useRef(validate);
  const ssrSafeRef = useRef(ssrSafe);

  useEffect(() => {
    defaultValueRef.current = defaultValue;
    serializerRef.current = serializer;
    deserializerRef.current = deserializer;
    validateRef.current = validate;
    ssrSafeRef.current = ssrSafe;
  }, [defaultValue, serializer, deserializer, validate, ssrSafe]);

  const [state, setState] = useState<T>(() =>
    readStorageValue(prefixedKey, defaultValue, deserializer, validate, ssrSafe)
  );

  useEffect(() => {
    setState(
      readStorageValue(
        prefixedKey,
        defaultValueRef.current,
        deserializerRef.current,
        validateRef.current,
        ssrSafeRef.current
      )
    );
  }, [prefixedKey]);

  const setItem = useCallback(
    (value: SetStateAction<T>) => {
      setState((previousValue) => {
        const nextValue =
          typeof value === "function"
            ? (value as (prev: T) => T)(previousValue)
            : value;

        if (ssrSafe && !isStorageAvailable()) {
          return nextValue;
        }

        if (!isStorageAvailable()) {
          return nextValue;
        }

        try {
          if (nextValue === undefined) {
            window.localStorage.removeItem(prefixedKey);
          } else {
            window.localStorage.setItem(
              prefixedKey,
              serializerRef.current(nextValue)
            );
          }
        } catch (error) {
          logStorageWarning("save", prefixedKey, error);
        }

        return nextValue;
      });
    },
    [prefixedKey, ssrSafe]
  );

  const removeItem = useCallback(() => {
    if (ssrSafe && !isStorageAvailable()) {
      setState(defaultValueRef.current);
      return;
    }

    if (!isStorageAvailable()) {
      setState(defaultValueRef.current);
      return;
    }

    try {
      window.localStorage.removeItem(prefixedKey);
      setState(defaultValueRef.current);
    } catch (error) {
      logStorageWarning("remove", prefixedKey, error);
    }
  }, [prefixedKey, ssrSafe]);

  return [state, setItem, removeItem] as const;
}

export function useLocalStorageBoolean(
  key: string,
  defaultValue: boolean,
  options?: Pick<UseLocalStorageOptions<boolean>, "ssrSafe">
) {
  return useLocalStorage<boolean>(key, defaultValue, {
    serializer: (value) => String(value),
    deserializer: (value) => value === "true",
    ssrSafe: options?.ssrSafe,
  });
}

export function useLocalStorageNumber(
  key: string,
  defaultValue: number,
  options?: Omit<UseLocalStorageOptions<number>, "serializer" | "deserializer">
) {
  return useLocalStorage<number>(key, defaultValue, {
    serializer: (value) => String(value),
    deserializer: (value) => Number(value),
    validate: (value) => {
      const isValidNumber = Number.isFinite(value);
      if (!isValidNumber) {
        return false;
      }

      if (!options?.validate) {
        return true;
      }

      return options.validate(value);
    },
    ssrSafe: options?.ssrSafe,
  });
}
