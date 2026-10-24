const OPEN_SIDE_PANEL_COMMAND = 'open-side-panel'

function openPanelOnToolbarClick() {
  // The toolbar button opens the side panel directly. The click also grants activeTab for the tab.
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
}

chrome.runtime.onInstalled.addListener(openPanelOnToolbarClick)
chrome.runtime.onStartup.addListener(openPanelOnToolbarClick)

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== OPEN_SIDE_PANEL_COMMAND || tab?.windowId == null) return
  // Called synchronously so the shortcut still counts as the user gesture sidePanel.open requires.
  void chrome.sidePanel.open({ windowId: tab.windowId })
})
