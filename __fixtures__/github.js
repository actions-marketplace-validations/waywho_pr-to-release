/**
 * This file is used to mock the `@actions/github` module in tests.
 */
import { jest } from '@jest/globals'

export const context = {
  repo: { owner: 'octo', repo: 'widgets' },
  payload: {}
}
export const createRelease = jest.fn()
export const getOctokit = jest.fn(() => ({
  rest: { repos: { createRelease } }
}))
