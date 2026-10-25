// Mock blocks for /qa-rn-unit. Copy only the blocks that step 5 or the Errors table of the skill names. Never copy this whole file.
// In every `jest.mock` factory, list one `name: jest.fn()` for each function the source imports from that module.

// ---- react-navigation ----
// Under the imports of the test file:
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: jest.fn() }))
import { useNavigation } from '@react-navigation/native'
// Inside each `it`, before `render`:
const navigate = jest.fn()
jest.mocked(useNavigation).mockReturnValue({ navigate, goBack: jest.fn() } as unknown as ReturnType<typeof useNavigation>)
// Optional check of a navigation that follows a press:
// await waitFor(() => expect(navigate).toHaveBeenCalledWith('ROUTE_NAME'))

// ---- expo-router ----
// Under the imports of the test file:
jest.mock('expo-router', () => ({ useRouter: jest.fn(), useLocalSearchParams: jest.fn() }))
import { useRouter } from 'expo-router'
// Inside each `it`, before `render`:
const push = jest.fn()
jest.mocked(useRouter).mockReturnValue({ push, replace: jest.fn(), back: jest.fn() } as unknown as ReturnType<typeof useRouter>)
// Optional check of a navigation that follows a press:
// await waitFor(() => expect(push).toHaveBeenCalledWith('/ROUTE_PATH'))

// ---- async-storage ----
// Under the imports of the test file:
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}))
import AsyncStorage from '@react-native-async-storage/async-storage'
// Inside each `it`, before `render` or the call to the source, when the source reads a value:
jest.mocked(AsyncStorage.getItem).mockResolvedValue('STORED_VALUE')
// Optional check of a value the source saves:
// await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith('STORAGE_KEY', 'STORED_VALUE'))

// ---- fetch ----
// Inside each `it`, before `render` or the call to the source. Always give it a response:
const fetchMock = jest.fn().mockResolvedValue({ ok: FETCH_OK, status: FETCH_STATUS, json: async () => FETCH_BODY })
globalThis.fetch = fetchMock as unknown as typeof fetch
// Optional check that nothing was sent:
// expect(fetchMock).not.toHaveBeenCalled()

// ---- data module ----
// Under the imports of the test file:
jest.mock('DATA_IMPORT', () => ({ DATA_FUNCTION: jest.fn() }))
import { DATA_FUNCTION } from 'DATA_IMPORT'
// Inside each `it`, before `render` or the call to the source:
jest.mocked(DATA_FUNCTION).mockResolvedValue(DATA_VALUE)

// ---- timers ----
// Under the imports of the test file. findBy and userEvent move the fake clock by themselves.
beforeEach(() => {
  jest.useFakeTimers()
})
afterEach(() => {
  jest.useRealTimers()
})

// ---- native module ----
// Under the imports of the test file. NATIVE_PACKAGE is the package named in the stack lines of the error.
// List one `name: jest.fn()` for each function the source imports from it. A default export is `default: jest.fn()`.
jest.mock('NATIVE_PACKAGE', () => ({ __esModule: true, NATIVE_FUNCTION: jest.fn() }))
