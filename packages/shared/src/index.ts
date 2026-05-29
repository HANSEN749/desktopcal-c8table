export type EventKind = "duration" | "event";
export type EventShape = "circle" | "triangle" | "square" | "diamond" | "star" | "hexagon";
export type Importance = 1 | 2 | 3 | 4 | 5;
export type EntryAttachmentStorage = "local" | "teable";
export type EntryUnitId = "work" | "research" | "review" | "personal" | "other";

export interface EntryUnitProfile {
  id: EntryUnitId;
  label: string;
  shape: EventShape;
}

export interface EntryAttachment {
  id: string;
  storage: EntryAttachmentStorage;
  localBlobKey?: string;
  teableAttachmentId?: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  isCover?: boolean;

  /**
   * Compatibility and preview fields. Local attachment blobs are authoritative for the current MVP;
   * these fields are optional so future Teable/file URL previews can be introduced without another
   * domain break.
   */
  kind?: "image" | "file";
  url?: string;
  thumbUrl?: string;
  localThumbPath?: string;
  width?: number;
  height?: number;
}

export interface Entry {
  id: string;
  localId: string;
  unit: EntryUnitId;
  title: string;
  date: string;
  time?: string;
  shape: EventShape;
  kind: EventKind;
  importance: Importance;
  completed?: boolean;
  note?: string;
  attachments: EntryAttachment[];
  createdAt: string;
  updatedAt: string;
  isLegacy?: boolean;
}

export interface TeableFieldIds {
  title?: string;
  date?: string;
  time?: string;
  shape?: string;
  kind?: string;
  importance?: string;
  note?: string;
  attachments?: string;
  localId?: string;
  reminderAt?: string;
}

export interface TeableSettings {
  endpoint?: string;
  token?: string;
  pat?: string;
  tableId?: string;
  fieldIds: TeableFieldIds;
}

export interface Settings {
  theme: "light" | "dark" | "system";
  opacity: number;
  alwaysOnTop: boolean;
  upcomingRange: 3 | 7 | 14;
  startWeekday: 0 | 1;
}

export const shapeLabels: Record<EventShape, string> = {
  circle: "圆",
  triangle: "三角",
  square: "方形",
  diamond: "菱形",
  star: "星",
  hexagon: "六边形",
};

export const shapeSymbols: Record<EventShape, string> = {
  circle: "●",
  triangle: "▲",
  square: "■",
  diamond: "◆",
  star: "★",
  hexagon: "⬢",
};

export const kindLabels: Record<EventKind, string> = {
  duration: "持续",
  event: "事件",
};

export const kindShortLabels: Record<EventKind, string> = {
  duration: "实",
  event: "空",
};

export const entryUnitProfiles: Record<EntryUnitId, EntryUnitProfile> = {
  work: {
    id: "work",
    label: "单位",
    shape: "triangle",
  },
  research: {
    id: "research",
    label: "科研",
    shape: "circle",
  },
  review: {
    id: "review",
    label: "评审",
    shape: "square",
  },
  personal: {
    id: "personal",
    label: "个人",
    shape: "diamond",
  },
  other: {
    id: "other",
    label: "其他",
    shape: "hexagon",
  },
};

export function getEntryUnitProfile(unit: EntryUnitId | undefined): EntryUnitProfile {
  return unit ? entryUnitProfiles[unit] : entryUnitProfiles.work;
}

export const outlineShapeSymbols: Record<EventShape, string> = {
  circle: "○",
  triangle: "△",
  square: "□",
  diamond: "◇",
  star: "☆",
  hexagon: "⬡",
};

export function getEntryMarkerSymbol(shape: EventShape, kind: EventKind): string {
  return kind === "duration" ? shapeSymbols[shape] : outlineShapeSymbols[shape];
}
