import { createElement } from 'react'
import { render, screen, userEvent } from '@testing-library/react-native'
import { COMPONENT_NAME } from 'SOURCE_IMPORT'

afterEach(() => {
  jest.resetAllMocks()
  jest.restoreAllMocks()
})

describe('COMPONENT_NAME', () => {
  it('TEST_TITLE', async () => {
    const user = userEvent.setup()
    await render(createElement(COMPONENT_NAME))

    await user.type(screen.getByLabelText('FIELD_LABEL'), 'FIELD_VALUE')
    await user.press(screen.getByRole('button', { name: 'BUTTON_NAME' }))

    expect(await screen.findByText('TEXT_FROM_SOURCE')).toBeOnTheScreen()
  })
})
