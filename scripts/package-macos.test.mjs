import { describe, expect, it } from 'vitest'
import { prepareMacPackagingEnvironment } from './package-macos.mjs'

const completeCredentials = {
  OMNIDESIGN_MAC_CSC_LINK: 'certificate-data',
  OMNIDESIGN_MAC_CSC_KEY_PASSWORD: 'certificate-password',
  OMNIDESIGN_APPLE_ID: 'developer@example.com',
  OMNIDESIGN_APPLE_APP_SPECIFIC_PASSWORD: 'application-password',
  OMNIDESIGN_APPLE_TEAM_ID: 'TEAM123456',
}

describe('prepareMacPackagingEnvironment', () => {
  it('omits empty GitHub secrets so electron-builder can create unsigned artifacts', () => {
    const { environment, signed } = prepareMacPackagingEnvironment({
      PATH: '/usr/bin',
      CSC_LINK: '',
      CSC_KEY_PASSWORD: '',
      ...Object.fromEntries(Object.keys(completeCredentials).map((name) => [name, ''])),
    })

    expect(signed).toBe(false)
    expect(environment).toMatchObject({ PATH: '/usr/bin', CSC_IDENTITY_AUTO_DISCOVERY: 'false' })
    expect(environment).not.toHaveProperty('CSC_LINK')
    expect(environment).not.toHaveProperty('CSC_KEY_PASSWORD')
    for (const name of Object.keys(completeCredentials)) expect(environment).not.toHaveProperty(name)
  })

  it('maps a complete credential set to electron-builder variables', () => {
    const { environment, signed } = prepareMacPackagingEnvironment({
      PATH: '/usr/bin',
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      ...completeCredentials,
    })

    expect(signed).toBe(true)
    expect(environment).toMatchObject({
      PATH: '/usr/bin',
      CSC_LINK: 'certificate-data',
      CSC_KEY_PASSWORD: 'certificate-password',
      APPLE_ID: 'developer@example.com',
      APPLE_APP_SPECIFIC_PASSWORD: 'application-password',
      APPLE_TEAM_ID: 'TEAM123456',
    })
    expect(environment).not.toHaveProperty('CSC_IDENTITY_AUTO_DISCOVERY')
    for (const name of Object.keys(completeCredentials)) expect(environment).not.toHaveProperty(name)
  })

  it('rejects partial credentials with the missing names', () => {
    expect(() => prepareMacPackagingEnvironment({
      OMNIDESIGN_MAC_CSC_LINK: 'certificate-data',
      OMNIDESIGN_MAC_CSC_KEY_PASSWORD: 'certificate-password',
    })).toThrow(
      'Incomplete macOS signing and notarization credentials. Missing: OMNIDESIGN_APPLE_ID, OMNIDESIGN_APPLE_APP_SPECIFIC_PASSWORD, OMNIDESIGN_APPLE_TEAM_ID',
    )
  })
})
