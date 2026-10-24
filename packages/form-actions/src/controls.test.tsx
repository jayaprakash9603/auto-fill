import { useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { fillControl } from './controls'
import { readControlValue } from './read'
import { $, $$, mount, target } from './test-utils/targets'

const quick = { optionTimeoutMs: 300 }

const text = (value: string) => ({ kind: 'text', text: value }) as const
const choose = (...values: string[]) => ({ kind: 'options', values }) as const
const checked = (value: boolean) => ({ kind: 'checked', checked: value }) as const

afterEach(() => {
  document.body.innerHTML = ''
})

describe('native text controls', () => {
  it('writes the value and announces it with input and change events', async () => {
    mount('<input id="name" />')
    const input = $<HTMLInputElement>('#name')
    const seen: string[] = []
    for (const type of ['focus', 'input', 'change', 'blur'])
      input.addEventListener(type, () => seen.push(type))

    expect(await fillControl(target(input, 'text'), text('Ada'), quick)).toEqual({
      ok: true,
      verified: true,
      reason: null,
    })
    expect(input.value).toBe('Ada')
    expect(seen).toEqual(['focus', 'input', 'change', 'blur'])
  })

  it('refuses text longer than the field allows instead of truncating it', async () => {
    mount('<textarea id="bio" maxlength="5"></textarea>')
    const outcome = await fillControl(target($('#bio'), 'textarea'), text('Too long'), quick)
    expect(outcome).toMatchObject({ ok: false, reason: expect.stringContaining('5 characters') })
    expect($<HTMLTextAreaElement>('#bio').value).toBe('')
  })

  it('fails when the page throws the value away', async () => {
    mount('<input id="locked" />')
    const input = $<HTMLInputElement>('#locked')
    input.addEventListener('input', () => {
      input.value = ''
    })
    expect(await fillControl(target(input, 'text'), text('Ada'), quick)).toEqual({
      ok: false,
      verified: false,
      reason: 'The page did not keep the value.',
    })
  })

  it('accepts a phone number the page formats, and flags other reformatting for review', async () => {
    mount('<input id="phone" type="tel" /><input id="code" />')
    const phone = $<HTMLInputElement>('#phone')
    phone.addEventListener('input', () => {
      phone.value = phone.value.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')
    })
    expect(await fillControl(target(phone, 'tel'), text('5551234567'), quick)).toMatchObject({
      ok: true,
      verified: true,
    })
    expect(phone.value).toBe('(555) 123-4567')

    const code = $<HTMLInputElement>('#code')
    code.addEventListener('input', () => {
      code.value = code.value.toUpperCase()
    })
    expect(await fillControl(target(code, 'text'), text('ab12'), quick)).toEqual({
      ok: true,
      verified: false,
      reason: 'The page reformatted the value; check it.',
    })
  })

  it('fills a contenteditable editor and verifies its text', async () => {
    mount('<div id="cover" contenteditable="true"></div>')
    const editor = $('#cover')
    let inputs = 0
    editor.addEventListener('input', () => (inputs += 1))
    const outcome = await fillControl(
      target(editor, 'contenteditable'),
      text('Dear team, I would like to apply.'),
      quick,
    )
    expect(outcome).toMatchObject({ ok: true, verified: true })
    expect(editor.textContent).toBe('Dear team, I would like to apply.')
    expect(inputs).toBeGreaterThan(0)
  })

  it('never writes into file, password or unknown controls', async () => {
    mount('<input id="cv" type="file" /><input id="pw" type="password" />')
    for (const [selector, type] of [
      ['#cv', 'file'],
      ['#pw', 'password'],
    ] as const) {
      expect(await fillControl(target($(selector), type), text('x'), quick)).toMatchObject({
        ok: false,
        reason: 'This kind of control is never filled.',
      })
    }
    expect($<HTMLInputElement>('#pw').value).toBe('')
  })

  it('rejects a value of the wrong kind', async () => {
    mount('<input id="name" />')
    expect(await fillControl(target($('#name'), 'text'), checked(true), quick)).toMatchObject({
      ok: false,
      reason: 'The value does not fit a text field.',
    })
  })
})

describe('native choice controls', () => {
  it('selects an option and waits for options that load late', async () => {
    mount('<select id="state"><option value="">Select…</option></select>')
    const select = $<HTMLSelectElement>('#state')
    const field = target(select, 'select')
    let changes = 0
    select.addEventListener('change', () => (changes += 1))
    setTimeout(() => select.add(new Option('Karnataka', 'KA')), 60)

    expect(await fillControl(field, choose('KA'), { optionTimeoutMs: 1_000 })).toMatchObject({
      ok: true,
      verified: true,
    })
    expect(select.value).toBe('KA')
    expect(changes).toBe(1)
  })

  it('reports an option that never appears or is disabled', async () => {
    mount(
      '<select id="country"><option value="">Select…</option><option value="IN" disabled>India</option></select>',
    )
    const field = target($('#country'), 'select')
    expect(await fillControl(field, choose('GB'), quick)).toMatchObject({
      ok: false,
      reason: 'That option is not on the page.',
    })
    expect(await fillControl(field, choose('IN'), quick)).toMatchObject({
      ok: false,
      reason: 'That option is disabled.',
    })
  })

  it('sets exactly the wanted options of a multi-select', async () => {
    mount(
      '<select id="skills" multiple><option value="ts" selected>TypeScript</option><option value="go">Go</option><option value="rust">Rust</option></select>',
    )
    const select = $<HTMLSelectElement>('#skills')
    expect(await fillControl(target(select, 'multiselect'), choose('go', 'rust'), quick)).toMatchObject(
      { ok: true, verified: true },
    )
    expect(Array.from(select.selectedOptions, (option) => option.value)).toEqual(['go', 'rust'])
  })

  it('checks and unchecks a checkbox by clicking it', async () => {
    mount('<input id="alerts" type="checkbox" />')
    const box = $<HTMLInputElement>('#alerts')
    let clicks = 0
    box.addEventListener('click', () => (clicks += 1))
    const field = target(box, 'checkbox')

    expect(await fillControl(field, checked(true), quick)).toMatchObject({ ok: true })
    expect(box.checked).toBe(true)
    expect(await fillControl(field, checked(true), quick)).toMatchObject({ ok: true })
    expect(clicks).toBe(1)
    expect(await fillControl(field, checked(false), quick)).toMatchObject({ ok: true })
    expect(box.checked).toBe(false)
  })

  it('picks a radio by its value and refuses values that are not offered', async () => {
    mount(`
      <label><input type="radio" name="sponsor" value="yes" /> Yes</label>
      <label><input type="radio" name="sponsor" value="no" /> No</label>`)
    const radios = $$<HTMLInputElement>('input[name="sponsor"]')
    const field = target(radios[0] as Element, 'radio-group', { members: radios })

    expect(await fillControl(field, choose('no'), quick)).toMatchObject({ ok: true, verified: true })
    expect(radios.map((radio) => radio.checked)).toEqual([false, true])
    expect(await fillControl(field, choose('maybe'), quick)).toMatchObject({
      ok: false,
      reason: 'That option is not on the page.',
    })
    expect(await fillControl(field, choose('yes', 'no'), quick)).toMatchObject({
      ok: false,
      reason: 'Only one option can be chosen.',
    })
  })

  it('brings a checkbox group to exactly the wanted set', async () => {
    mount(`
      <input type="checkbox" name="days" value="mon" checked />
      <input type="checkbox" name="days" value="tue" />
      <input type="checkbox" name="days" value="wed" />`)
    const boxes = $$<HTMLInputElement>('input[name="days"]')
    const field = target(boxes[0] as Element, 'checkbox-group', { members: boxes })
    expect(await fillControl(field, choose('tue', 'wed'), quick)).toMatchObject({ ok: true })
    expect(boxes.map((box) => box.checked)).toEqual([false, true, true])
  })
})

describe('ARIA widgets', () => {
  it('toggles a role=switch by clicking, and falls back to the Space key', async () => {
    mount(`
      <div id="remote" role="switch" aria-checked="false" tabindex="0"></div>
      <div id="keyboard-only" role="checkbox" aria-checked="false" tabindex="0"></div>`)
    const remote = $('#remote')
    remote.addEventListener('click', () =>
      remote.setAttribute('aria-checked', String(remote.getAttribute('aria-checked') !== 'true')),
    )
    expect(await fillControl(target(remote, 'checkbox'), checked(true), quick)).toMatchObject({
      ok: true,
    })
    expect(remote.getAttribute('aria-checked')).toBe('true')

    const keyboard = $('#keyboard-only')
    keyboard.addEventListener('keydown', (event) => {
      if (event.key === ' ') keyboard.setAttribute('aria-checked', 'true')
    })
    expect(await fillControl(target(keyboard, 'checkbox'), checked(true), quick)).toMatchObject({
      ok: true,
    })
  })

  it('reports a custom checkbox that ignores every attempt', async () => {
    mount('<div id="dead" role="checkbox" aria-checked="false"></div>')
    expect(await fillControl(target($('#dead'), 'checkbox'), checked(true), quick)).toMatchObject({
      ok: false,
      reason: 'The page did not keep the change.',
    })
  })

  it('chooses a role=radio member by data-value', async () => {
    mount(`
      <div role="radiogroup" id="relocate">
        <div role="radio" aria-checked="false" data-value="yes">Yes</div>
        <div role="radio" aria-checked="true" data-value="no">No</div>
      </div>`)
    const members = $$('[role="radio"]')
    for (const member of members) {
      member.addEventListener('click', () => {
        for (const entry of members) entry.setAttribute('aria-checked', String(entry === member))
      })
    }
    const field = target($('#relocate'), 'radio-group', { members })
    expect(await fillControl(field, choose('yes'), quick)).toMatchObject({ ok: true, verified: true })
    expect(members.map((member) => member.getAttribute('aria-checked'))).toEqual(['true', 'false'])
  })

  it('toggles the options of a multi-select listbox', async () => {
    mount(`
      <div id="places" role="listbox" aria-multiselectable="true">
        <div role="option" aria-selected="true">Remote</div>
        <div role="option" aria-selected="false">Hybrid</div>
        <div role="option" aria-selected="false" aria-disabled="true">On-site</div>
      </div>`)
    for (const option of $$('[role="option"]')) {
      option.addEventListener('click', () =>
        option.setAttribute('aria-selected', String(option.getAttribute('aria-selected') !== 'true')),
      )
    }
    const field = target($('#places'), 'multiselect')
    expect(await fillControl(field, choose('Hybrid'), quick)).toMatchObject({ ok: true })
    expect(readControlValue(field)).toEqual(choose('Hybrid'))
    expect(await fillControl(field, choose('On-site'), quick)).toMatchObject({
      ok: false,
      reason: 'That option is disabled.',
    })
  })

  function selectOnlyCombobox(loadDelayMs: number | null) {
    mount(`
      <div id="experience" role="combobox" tabindex="0" aria-expanded="false" aria-controls="experience-options">Select…</div>
      <ul id="experience-options" role="listbox" hidden></ul>`)
    const combobox = $('#experience')
    const listbox = $('#experience-options')
    const render = () => {
      listbox.innerHTML = ['0–2 years', '3–5 years', '6 or more years']
        .map((label) => `<li role="option" aria-selected="false">${label}</li>`)
        .join('')
    }
    if (loadDelayMs === null) render()
    // Like many menus, it opens on mousedown rather than click.
    combobox.addEventListener('mousedown', () => {
      combobox.setAttribute('aria-expanded', 'true')
      listbox.hidden = false
      if (loadDelayMs !== null) setTimeout(render, loadDelayMs)
    })
    listbox.addEventListener('click', (event) => {
      const option = (event.target as Element).closest('[role="option"]')
      if (!option) return
      for (const entry of listbox.querySelectorAll('[role="option"]'))
        entry.setAttribute('aria-selected', String(entry === option))
      combobox.textContent = option.textContent
      combobox.setAttribute('aria-expanded', 'false')
      listbox.hidden = true
    })
    return { combobox, listbox }
  }

  it('opens a select-only combobox and clicks the matching option', async () => {
    const { combobox } = selectOnlyCombobox(null)
    const field = target(combobox, 'combobox')
    expect(await fillControl(field, text('3–5 years'), quick)).toEqual({
      ok: true,
      verified: true,
      reason: null,
    })
    expect(combobox.textContent).toBe('3–5 years')
    expect(readControlValue(field)).toEqual(text('3–5 years'))
  })

  it('waits for options that load after the combobox opens', async () => {
    const { combobox } = selectOnlyCombobox(150)
    const outcome = await fillControl(target(combobox, 'combobox'), text('6 or more years'), {
      optionTimeoutMs: 1_000,
    })
    expect(outcome).toMatchObject({ ok: true, verified: true })
    expect(combobox.textContent).toBe('6 or more years')
  })

  it('closes the menu and fails when no option matches', async () => {
    const { combobox } = selectOnlyCombobox(null)
    const keys: string[] = []
    combobox.addEventListener('keydown', (event) => keys.push(event.key))
    expect(await fillControl(target(combobox, 'combobox'), text('20 years'), quick)).toEqual({
      ok: false,
      verified: false,
      reason: 'None of the listed options match.',
    })
    expect(keys).toContain('Escape')
    expect(combobox.textContent).toBe('Select…')
  })

  it('types into an autocomplete and picks the single suggestion that starts with the answer', async () => {
    mount(`
      <input id="city" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="city-options" />
      <ul id="city-options" role="listbox"></ul>`)
    const input = $<HTMLInputElement>('#city')
    const listbox = $('#city-options')
    input.addEventListener('input', () => {
      const query = input.value.toLowerCase()
      // Suggestions arrive later, as if from a server.
      setTimeout(() => {
        listbox.innerHTML = ['Bengaluru, Karnataka, India', 'Bengal, India', 'London, UK']
          .filter((label) => label.toLowerCase().startsWith(query))
          .map((label) => `<li role="option">${label}</li>`)
          .join('')
      }, 80)
    })
    listbox.addEventListener('click', (event) => {
      const option = (event.target as Element).closest('[role="option"]')
      if (option) input.value = option.textContent ?? ''
    })

    expect(
      await fillControl(target(input, 'combobox'), text('Bengaluru'), { optionTimeoutMs: 1_000 }),
    ).toMatchObject({ ok: true, verified: true })
    expect(input.value).toBe('Bengaluru, Karnataka, India')
  })

  it('keeps free text in an autocomplete that offers nothing', async () => {
    mount('<input id="city" role="combobox" aria-autocomplete="list" />')
    const input = $<HTMLInputElement>('#city')
    expect(await fillControl(target(input, 'combobox'), text('Pune'), quick)).toMatchObject({
      ok: true,
      verified: true,
    })
    expect(input.value).toBe('Pune')
  })
})

describe('React-controlled inputs', () => {
  let root: Root | null = null
  afterEach(() => {
    root?.unmount()
    root = null
  })

  function render(element: ReactNode) {
    const container = mount('<div id="app"></div>').firstElementChild as HTMLElement
    root = createRoot(container)
    flushSync(() => root?.render(element))
  }

  function Application() {
    const [name, setName] = useState('')
    const [country, setCountry] = useState('')
    const [alerts, setAlerts] = useState(false)
    const [sponsor, setSponsor] = useState('')
    return (
      <form>
        <input id="name" value={name} onChange={(event) => setName(event.target.value)} />
        <select id="country" value={country} onChange={(event) => setCountry(event.target.value)}>
          <option value="">Select…</option>
          <option value="IN">India</option>
        </select>
        <input
          id="alerts"
          type="checkbox"
          checked={alerts}
          onChange={(event) => setAlerts(event.target.checked)}
        />
        {['yes', 'no'].map((value) => (
          <input
            key={value}
            type="radio"
            name="sponsor"
            value={value}
            checked={sponsor === value}
            onChange={() => setSponsor(value)}
          />
        ))}
        <output id="state">{JSON.stringify({ name, country, alerts, sponsor })}</output>
      </form>
    )
  }

  const reactState = () => JSON.parse($('#state').textContent ?? '{}') as Record<string, unknown>

  it('updates component state, so a re-render keeps the filled values', async () => {
    render(<Application />)
    const radios = $$<HTMLInputElement>('input[name="sponsor"]')

    await fillControl(target($('#name'), 'text'), text('Ada'), quick)
    await fillControl(target($('#country'), 'select'), choose('IN'), quick)
    await fillControl(target($('#alerts'), 'checkbox'), checked(true), quick)
    await fillControl(
      target(radios[0] as Element, 'radio-group', { members: radios }),
      choose('no'),
      quick,
    )

    expect(reactState()).toEqual({ name: 'Ada', country: 'IN', alerts: true, sponsor: 'no' })
    expect($<HTMLInputElement>('#name').value).toBe('Ada')
    expect($<HTMLSelectElement>('#country').value).toBe('IN')
  })

  it('needs the native setter: plain assignment leaves React state behind', async () => {
    render(<Application />)
    const input = $<HTMLInputElement>('#name')
    input.value = 'Ada'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reactState()).toMatchObject({ name: '' })

    await fillControl(target(input, 'text'), text('Grace'), quick)
    expect(reactState()).toMatchObject({ name: 'Grace' })
  })

  it('reports a controlled input whose component rejects the change', async () => {
    function Locked() {
      const [value] = useState('')
      return <input id="locked" value={value} onChange={() => undefined} />
    }
    render(<Locked />)
    expect(await fillControl(target($('#locked'), 'text'), text('Ada'), quick)).toEqual({
      ok: false,
      verified: false,
      reason: 'The page did not keep the value.',
    })
  })
})
