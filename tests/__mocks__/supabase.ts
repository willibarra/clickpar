/**
 * Mock factory for Supabase client with chainable API.
 *
 * Usage in tests:
 *   const { mock, client } = createMockSupabaseClient();
 *   mock.setResponse('customers', 'select', { data: [...], error: null });
 *   // The server action will use `client` via vi.mock
 */

export interface MockResponse {
  data: any;
  error: any;
}

type Operation = 'select' | 'insert' | 'update' | 'delete' | 'rpc';

export interface MockSupabaseController {
  /**
   * Pre-configure what a given table + operation should return.
   * Calls are matched in FIFO order per table+operation pair.
   */
  setResponse(table: string, operation: Operation, response: MockResponse): void;

  /**
   * Get recorded calls for assertions.
   * Each entry has { table, operation, args }
   */
  getCalls(): Array<{ table: string; operation: Operation; method: string; args: any }>;

  /** Clear all configured responses and recorded calls */
  reset(): void;
}

export function createMockSupabaseClient() {
  const responses = new Map<string, MockResponse[]>();
  const calls: Array<{ table: string; operation: Operation; method: string; args: any }> = [];

  function getKey(table: string, operation: Operation) {
    return `${table}:${operation}`;
  }

  const controller: MockSupabaseController = {
    setResponse(table, operation, response) {
      const key = getKey(table, operation);
      if (!responses.has(key)) responses.set(key, []);
      responses.get(key)!.push(response);
    },

    getCalls() {
      return calls;
    },

    reset() {
      responses.clear();
      calls.length = 0;
    },
  };

  function popResponse(table: string, operation: Operation): MockResponse {
    const key = getKey(table, operation);
    const queue = responses.get(key);
    if (queue && queue.length > 0) {
      return queue.shift()!;
    }
    // Default: empty success
    return { data: null, error: null };
  }

  function createChain(table: string, operation: Operation) {
    let resolved = false;
    let response: MockResponse | null = null;

    const record = (method: string, args: any) => {
      calls.push({ table, operation, method, args });
    };

    const getResponse = (): MockResponse => {
      if (!response) {
        response = popResponse(table, operation);
      }
      return response;
    };

    const chain: any = {
      select(...args: any[]) { record('select', args); return chain; },
      insert(...args: any[]) { record('insert', args); return chain; },
      update(...args: any[]) { record('update', args); return chain; },
      delete(...args: any[]) { record('delete', args); return chain; },
      eq(...args: any[]) { record('eq', args); return chain; },
      neq(...args: any[]) { record('neq', args); return chain; },
      in(...args: any[]) { record('in', args); return chain; },
      gte(...args: any[]) { record('gte', args); return chain; },
      lte(...args: any[]) { record('lte', args); return chain; },
      gt(...args: any[]) { record('gt', args); return chain; },
      lt(...args: any[]) { record('lt', args); return chain; },
      order(...args: any[]) { record('order', args); return chain; },
      limit(...args: any[]) { record('limit', args); return chain; },
      is(...args: any[]) { record('is', args); return chain; },
      not(...args: any[]) { record('not', args); return chain; },
      single(...args: any[]) {
        record('single', args);
        return getResponse();
      },
      // Make the chain thenable so `await supabase.from('x').select()` works
      then(resolve: (val: any) => void, reject?: (err: any) => void) {
        if (!resolved) {
          resolved = true;
        }
        const r = getResponse();
        return Promise.resolve(r).then(resolve, reject);
      },
    };

    return chain;
  }

  const client = {
    from(table: string) {
      return {
        select(...args: any[]) {
          const chain = createChain(table, 'select');
          calls.push({ table, operation: 'select', method: 'select', args });
          return chain;
        },
        insert(...args: any[]) {
          const chain = createChain(table, 'insert');
          calls.push({ table, operation: 'insert', method: 'insert', args });
          return chain;
        },
        update(...args: any[]) {
          const chain = createChain(table, 'update');
          calls.push({ table, operation: 'update', method: 'update', args });
          return chain;
        },
        delete(...args: any[]) {
          const chain = createChain(table, 'delete');
          calls.push({ table, operation: 'delete', method: 'delete', args });
          return chain;
        },
      };
    },
    rpc(fnName: string, args?: any) {
      calls.push({ table: fnName, operation: 'rpc', method: 'rpc', args });
      return Promise.resolve(popResponse(fnName, 'rpc'));
    },
  };

  return { mock: controller, client };
}
