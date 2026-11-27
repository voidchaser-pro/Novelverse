export type ReaderTheme = 'light' | 'sepia' | 'dark';
export type ReaderFont = 'classic' | 'modern' | 'literary';
export type ReaderLineSpacing = 'compact' | 'comfortable' | 'relaxed';

export interface ReaderSettings {
  fontSize: number;
  fontFamily: ReaderFont;
  lineSpacing: ReaderLineSpacing;
  theme: ReaderTheme;
}

export const READER_FONT_SIZE_MIN = 14;
export const READER_FONT_SIZE_MAX = 28;

export const READER_FONTS: Record<ReaderFont, { label: string; stack: string }> = {
  classic: { label: 'Classic', stack: 'Georgia, "Times New Roman", serif' },
  literary: { label: 'Literary', stack: '"Palatino Linotype", Palatino, "Book Antiqua", serif' },
  modern: { label: 'Modern', stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' },
};

export const READER_LINE_SPACING: Record<ReaderLineSpacing, { label: string; value: number }> = {
  compact: { label: 'Compact', value: 1.5 },
  comfortable: { label: 'Comfortable', value: 1.8 },
  relaxed: { label: 'Relaxed', value: 2.1 },
};

export const READER_THEME_STYLES: Record<ReaderTheme, { surface: string; bar: string; text: string }> = {
  light: { surface: 'bg-white', bar: 'bg-white/90', text: 'text-slate-800' },
  sepia: { surface: 'bg-amber-50', bar: 'bg-amber-50/90', text: 'text-amber-950' },
  dark: { surface: 'bg-slate-900', bar: 'bg-slate-900/90', text: 'text-slate-200' },
};

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 18,
  fontFamily: 'classic',
  lineSpacing: 'comfortable',
  theme: 'light',
};

const STORAGE_KEY = 'nv-reader-settings';

export function loadReaderSettings(): ReaderSettings {
  if (typeof window === 'undefined') return DEFAULT_READER_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_READER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
    return {
      fontSize: clampFontSize(Number(parsed.fontSize ?? DEFAULT_READER_SETTINGS.fontSize)),
      fontFamily: parsed.fontFamily && parsed.fontFamily in READER_FONTS ? parsed.fontFamily : DEFAULT_READER_SETTINGS.fontFamily,
      lineSpacing: parsed.lineSpacing && parsed.lineSpacing in READER_LINE_SPACING ? parsed.lineSpacing : DEFAULT_READER_SETTINGS.lineSpacing,
      theme: parsed.theme && parsed.theme in READER_THEME_STYLES ? parsed.theme : DEFAULT_READER_SETTINGS.theme,
    };
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

export function saveReaderSettings(settings: ReaderSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be full or disabled; settings simply won't persist.
  }
}

export function clampFontSize(size: number): number {
  if (Number.isNaN(size)) return DEFAULT_READER_SETTINGS.fontSize;
  return Math.min(READER_FONT_SIZE_MAX, Math.max(READER_FONT_SIZE_MIN, size));
}
