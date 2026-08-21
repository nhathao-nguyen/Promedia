import { dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'

import { dialogChannels } from '../shared/dialog.ts'

export function registerDialogIPC(): () => void {
  const handleChooseDirectory = async (_event: IpcMainInvokeEvent): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  }

  ipcMain.handle(dialogChannels.chooseDirectory, handleChooseDirectory)
  return () => ipcMain.removeHandler(dialogChannels.chooseDirectory)
}
