import { EXPORT_NAME } from 'SOURCE_IMPORT'

afterEach(() => {
  jest.resetAllMocks()
  jest.restoreAllMocks()
})

describe('EXPORT_NAME', () => {
  it('TEST_TITLE', () => {
    expect(EXPORT_NAME(ARGUMENTS)).toEqual(EXPECTED_VALUE)
  })
})
