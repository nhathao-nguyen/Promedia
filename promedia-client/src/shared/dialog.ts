export const dialogChannels = {
  chooseDirectory: 'dialog:choose-directory',
} as const

export interface DialogAPI {
  chooseDirectory(): Promise<string | null>
}
