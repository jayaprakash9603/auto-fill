import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

import { resolvePortalAdapter } from './registry'

function context(html: string, url: string) {
  const dom = new JSDOM(html, { url })
  const hostname = new URL(url).hostname
  return {
    url,
    hostname,
    title: dom.window.document.title,
    document: dom.window.document,
  }
}

describe('resolvePortalAdapter', () => {
  it('picks Greenhouse on boards.greenhouse.io when the application form is present', () => {
    const picked = resolvePortalAdapter(
      context('<form id="application_form"></form>', 'https://boards.greenhouse.io/acme/jobs/1'),
    )
    expect(picked.id).toBe('greenhouse')
  })

  it('falls back to generic on unknown hosts', () => {
    const picked = resolvePortalAdapter(
      context('<form><input name="email"></form>', 'https://jobs.example.com/apply'),
    )
    expect(picked.id).toBe('generic')
  })

  it('detects Workday automation markers', () => {
    const picked = resolvePortalAdapter(
      context(
        '<input data-automation-id="legalNameSection_firstName" />',
        'https://acme.wd5.myworkdayjobs.com/en-US/careers/job/eng',
      ),
    )
    expect(picked.id).toBe('workday')
  })
})
