import {
  QueryClient,
  type DefaultOptions,
  type QueryClientConfig,
} from "@tanstack/react-query";

const TEST_QUERY_DEFAULTS: DefaultOptions = {
  queries: {
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    staleTime: Number.POSITIVE_INFINITY,
  },
  mutations: {
    retry: false,
  },
};

export function createTestQueryClient(
  defaultOptions?: QueryClientConfig["defaultOptions"]
): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        ...TEST_QUERY_DEFAULTS.queries,
        ...defaultOptions?.queries,
      },
      mutations: {
        ...TEST_QUERY_DEFAULTS.mutations,
        ...defaultOptions?.mutations,
      },
    },
  });
}
