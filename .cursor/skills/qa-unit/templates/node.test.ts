import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXPORT_NAME } from 'SOURCE_IMPORT'

vi.mock('server-only', () => ({}))
vi.mock('DATA_IMPORT', () => ({ DATA_FUNCTION: vi.fn() }))

import { DATA_FUNCTION } from 'DATA_IMPORT'

afterEach(() => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

describe('EXPORT_NAME', () => {
  it('TEST_TITLE', async () => {
    vi.mocked(DATA_FUNCTION).mockResolvedValue(DATA_VALUE)

    const response = await EXPORT_NAME(
      new Request('http://test/ROUTE_PATH', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(REQUEST_BODY),
      }),
    )

    expect(response.status).toBe(STATUS_CODE)
    expect(await response.json()).toEqual(RESPONSE_BODY)
  })
})
