// Mock blocks for /qa-unit. Copy only the blocks that step 5 of the skill names. Never copy this whole file.
// In every `vi.mock` factory, list one `name: vi.fn()` for each function the source imports from that module.
import { vi } from 'vitest'

// ---- next/navigation ----
// Under the imports of the test file:
vi.mock('next/navigation', () => ({ useRouter: vi.fn() }))
import { useRouter } from 'next/navigation'
// Inside each `it`, before `render`:
const push = vi.fn()
vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>)
// Optional check of a navigation that follows a `fetch`:
// await waitFor(() => expect(push).toHaveBeenCalledWith('/ROUTE_PATH'))
// For `redirect` and `notFound`: the real ones stop the code that calls them, so the mock must throw. Inside the `it`:
// vi.mocked(redirect).mockImplementation(() => { throw new Error('REDIRECT') })
// await expect(EXPORT_NAME()).rejects.toThrow('REDIRECT')

// ---- next/headers ----
// Under the imports of the test file:
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
import { cookies } from 'next/headers'
// Inside each `it`, before the call to the source:
const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() }
vi.mocked(cookies).mockResolvedValue(cookieStore as unknown as Awaited<ReturnType<typeof cookies>>)
// Optional, for a request that carries a cookie. Put it under the `cookieStore` line:
// cookieStore.get.mockReturnValue({ name: 'COOKIE_NAME', value: 'COOKIE_VALUE' })

// ---- fetch ----
// Inside each `it`, before `render` or the call to the source. Always give it a response:
const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(FETCH_BODY, { status: FETCH_STATUS }))
// A 204 response has no body. For that one write: new Response(null, { status: 204 })
// Optional check that nothing was sent:
// expect(fetchSpy).not.toHaveBeenCalled()

// ---- data module ----
// Under the imports of the test file:
vi.mock('DATA_IMPORT', () => ({ DATA_FUNCTION: vi.fn() }))
import { DATA_FUNCTION } from 'DATA_IMPORT'
// Inside each `it`, before `render` or the call to the source:
vi.mocked(DATA_FUNCTION).mockResolvedValue(DATA_VALUE)
