import { Dict } from 'cosmokit'
import { Cache, cached, CachedClass, cachedClass, CachedFunction, Options } from './cache'

interface Entry<T> {
  value: T
  timer?: NodeJS.Timeout
}

export class TTLCache<T> implements Cache<T> {
  private table: Dict<Entry<T>> = Object.create(null)

  constructor(private options?: Options) { }

  stop() {
    this.clear()
  }

  clear() {
    for (const key in this.table) {
      clearTimeout(this.table[key].timer)
    }
    delete this.table
    this.table = Object.create(null)
  }

  has(key: string) {
    return key in this.table
  }

  get(key: string) {
    return this.table[key]?.value
  }

  set(key: string, value: T) {
    this.delete(key)
    this.table[key] = { value }
    if (this.options?.maxAge) {
      this.table[key].timer = setTimeout(() => delete this.table[key], this.options.maxAge * 1000)
    }
  }

  delete(key: string) {
    if (this.table[key]) {
      clearTimeout(this.table[key].timer)
      delete this.table[key]
    }
  }
}

export function ttlcached<T extends any[]>(options: Options, resolver?: (...args: T) => string):
  (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void

export function ttlcached<T extends any[], R, F extends (...args: T) => R>(options: Options, resolver: (...args: T) => string, func: F):
  CachedFunction<T, F extends (...args: T) => infer R ? R extends Promise<infer V> ? V : R : never, F extends (...args: T) => infer R ? R : never>

export function ttlcached<T extends any[], R, F extends (...args: T) => R>(options: Options, resolver?: (...args: T) => string, func?: F) {
  return cached(TTLCache, options, resolver, func)
}

export function ttlcachedClass<T extends object, K extends keyof T, O = Options, P extends string = '_'>(
  object: T, cachedKeys: Record<K, O>, prefix?: P,
): CachedClass<T, K, P> {
  return cachedClass(TTLCache, object, cachedKeys, prefix)
}
