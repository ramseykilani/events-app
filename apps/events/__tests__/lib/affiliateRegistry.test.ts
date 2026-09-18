import { abortable, abortablePromise } from '../helpers/abortable';

const mockConfigMaybeSingle = jest.fn();
const mockConfigEq = jest.fn();
const mockConfigSelect = jest.fn();
const mockProgramsOrder = jest.fn();
const mockProgramsSelect = jest.fn();
const mockFrom = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import {
  clearAffiliateRegistryCache,
  getAffiliateRegistry,
} from '../../lib/affiliateRegistry';

// Affiliate Link Tagging: the registry read combines the global switch with
// the program rows, caches within a staleness window, and fails open to
// untagged on any error — a tagging outage must never surface on a screen.

const TM_ROW = {
  id: 'ticketmaster',
  domains: ['ticketmaster.com'],
  url_template: 'https://network.test/click?u={url}',
  enabled: true,
};

describe('getAffiliateRegistry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAffiliateRegistryCache();

    mockConfigMaybeSingle.mockResolvedValue({ data: { enabled: true }, error: null });
    mockConfigEq.mockReturnValue(abortable({ maybeSingle: mockConfigMaybeSingle }));
    mockConfigSelect.mockReturnValue({ eq: mockConfigEq });

    mockProgramsOrder.mockReturnValue(
      abortablePromise(Promise.resolve({ data: [TM_ROW], error: null }))
    );
    mockProgramsSelect.mockReturnValue({ order: mockProgramsOrder });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'affiliate_config') return { select: mockConfigSelect };
      if (table === 'affiliate_programs') return { select: mockProgramsSelect };
      return {};
    });
  });

  it('combines the global switch and the program rows', async () => {
    const registry = await getAffiliateRegistry();
    expect(registry).toEqual({ enabled: true, programs: [TM_ROW] });
  });

  it('a missing config row means globally off', async () => {
    mockConfigMaybeSingle.mockResolvedValue({ data: null, error: null });
    const registry = await getAffiliateRegistry();
    expect(registry.enabled).toBe(false);
    expect(registry.programs).toEqual([TM_ROW]);
  });

  it('fails open to the empty registry when the read errors', async () => {
    mockConfigMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'relation does not exist' },
    });
    const registry = await getAffiliateRegistry();
    expect(registry).toEqual({ enabled: false, programs: [] });
  });

  it('serves the cache within the staleness window', async () => {
    const first = await getAffiliateRegistry();
    const second = await getAffiliateRegistry();
    expect(second).toBe(first);
    expect(mockConfigSelect).toHaveBeenCalledTimes(1);
    expect(mockProgramsSelect).toHaveBeenCalledTimes(1);
  });
});
