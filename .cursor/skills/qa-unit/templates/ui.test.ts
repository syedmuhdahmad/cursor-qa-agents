// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMPONENT_NAME } from 'SOURCE_IMPORT'

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

describe('COMPONENT_NAME', () => {
  it('TEST_TITLE', async () => {
    render(createElement(COMPONENT_NAME))

    fireEvent.change(screen.getByLabelText('FIELD_LABEL'), { target: { value: 'FIELD_VALUE' } })
    fireEvent.click(screen.getByRole('button', { name: 'BUTTON_NAME' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('TEXT_FROM_SOURCE'))
  })
})
