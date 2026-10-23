const OPEN_SIDE_PANEL_COMMAND = 'open-side-panel'

chrome.runtime.onInstalled.addListener(() => {
  // The toolbar button opens the popup; the side panel opens from there or from the shortcut.
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
})

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== OPEN_SIDE_PANEL_COMMAND || tab?.windowId == null) return
  // Called synchronously so the shortcut still counts as the user gesture sidePanel.open requires.
  void chrome.sidePanel.open({ windowId: tab.windowId })
})
