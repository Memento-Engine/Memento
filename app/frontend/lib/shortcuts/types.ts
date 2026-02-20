export enum ShortcutAction {
    NEW_CHAT = "newChat",
    SEARCH_MEMORIES = "searchMemories", 
}



export interface ShortcutSpec {
    key :string,
    ctrlKey?: boolean,
    shiftKey?: boolean,
}

export type ShortcutMap = Record<ShortcutAction, ShortcutSpec>
