import { defineProperty } from 'cosmokit'

type Prefixed<K, P extends string> = K extends string
  ? `${P}${K}`
  : never

type PrefixRemoved<PK, P extends string> = PK extends Prefixed<infer K, P>
  ? K
  : ''

type PrefixedValue<T extends object, PK extends string, P extends string> = T extends { [K in PrefixRemoved<PK, P>]: infer TValue }
  ? TValue
  : never

type PrefixedObject<T extends object, P extends string> = {
  [K in Prefixed<keyof T, P>]: PrefixedValue<T, K, P>
}

type PickMatching<T, V> = { [K in keyof T as T[K] extends V ? K : never]: T[K] }

export type CachedClass<T extends object, K extends keyof T, P extends string = '_'> = PrefixedObject<PickMatching<Pick<T, K>, Function>, P> & T

export interface Options {
  maxSize?: number
  maxAge?: number
}

export interface Cache<T> {
  stop(): void
  clear(): void
  has(key: string): boolean
  get(key: string): T
  set(key: string, value: T): void
  delete(key: string): void
}

const FUNC_ERROR_TEXT = 'Expected a function'

export interface CachedFunction<T extends any[], R, F> {
  cache: Cache<R>
  func: (...args: T) => F
  direct: (...args: T) => F
  (...args: T): F
}

function cachedAsync<T extends any[], R, C extends Cache<R>>(
  CacheClass: { new(options: Options): C },
  func: (...args: T) => Promise<R>,
  resolver: (...args: T) => string,
  options?: Options,
): CachedFunction<T, R, Promise<R>> {
  if (typeof func !== 'function' || (resolver != null && typeof resolver !== 'function')) {
    throw new TypeError(FUNC_ERROR_TEXT)
  }
  const memoized = async function (...args: T) {
    const key = resolver ? resolver.apply(this, args) : (args?.length ? JSON.stringify(args) : null),
      cache = memoized.cache
    if (cache.has(key)) return cache.get(key)
    const result: R = await func.apply(this, args)
    cache.set(key, result)
    return result
  }
  memoized.cache = new CacheClass(options)
  memoized.func = func
  memoized.direct = async function (...args: T) {
    const key = resolver ? resolver.apply(this, args) : args[0],
      cache = memoized.cache
    const result: R = await func.apply(this, args)
    cache.set(key, result)
    return result
  }
  return memoized
}

function cachedSync<T extends any[], R, C extends Cache<R>>(
  CacheClass: { new(options: Options): C },
  func: (...args: T) => R,
  resolver: (...args: T) => string,
  options?: Options,
): CachedFunction<T, R, R> {
  if (typeof func !== 'function' || (resolver != null && typeof resolver !== 'function')) {
    throw new TypeError(FUNC_ERROR_TEXT)
  }
  const memoized = function (...args: T) {
    const key = resolver ? resolver.apply(this, args) : (args?.length ? JSON.stringify(args) : null),
      cache = memoized.cache
    if (cache.has(key)) return cache.get(key)
    const result: R = func.apply(this, args)
    cache.set(key, result)
    return result
  }
  memoized.cache = new CacheClass(options)
  memoized.func = func
  memoized.direct = function (...args: T) {
    const key = resolver ? resolver.apply(this, args) : args[0],
      cache = memoized.cache
    const result: R = func.apply(this, args)
    cache.set(key, result)
    return result
  }
  return memoized
}

export function cached<T extends any[], R, C extends Cache<R>>(
  CacheClass: { new(options: Options): C },
  options: Options,
  resolver?: (...args: T) => string
): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void

export function cached<T extends any[], R, F extends (...args: T) => R, C extends Cache<R>>(
  CacheClass: { new(options: Options): C },
  options: Options,
  resolver: (...args: T) => string,
  func: F): CachedFunction<T, F extends (...args: T) => infer R ? R extends Promise<infer V> ? V : R : never, F extends (...args: T) => infer R ? R : never>

export function cached<T extends any[], R, F extends (...args: T) => R, C extends Cache<R>>(
  CacheClass: { new(options: Options): C },
  options: Options,
  resolver?: (...args: T) => string,
  func?: F,
) {
  if (func) {
    if (func.constructor.name === 'AsyncFunction') {
      return cachedAsync(CacheClass, func as any, resolver, options) as any
    } else { return cachedSync(CacheClass, func as any, resolver, options) as any }
  } else {
    return function wrapper(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
      if (descriptor.value.constructor.name === 'AsyncFunction') {
        descriptor.value = cachedAsync(CacheClass, descriptor.value, resolver, options) as any
      } else { descriptor.value = cachedSync(CacheClass, descriptor.value, resolver, options) as any }
    }
  }
}

export function cachedClass<T extends object, R, C extends Cache<R>, K extends keyof T, O = Options, P extends string = '_'>(
  CacheClass: { new(options: Options): C },
  object: T,
  cachedKeys: Record<K, O>,
  prefix?: P,
): CachedClass<T, K, P> {
  for (const [key, options] of Object.entries(cachedKeys)) {
    const _cached = cached(CacheClass, options, (arg) => arg, object[key])
    defineProperty(object, key, _cached)
    defineProperty(object, `${prefix || '_'}${key}`, _cached.direct)
  }
  return object as any
}
