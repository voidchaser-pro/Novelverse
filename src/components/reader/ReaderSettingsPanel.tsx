import { Sun, Moon, BookOpen, Type, Minus, Plus, Check } from 'lucide-react';
import {
  READER_FONTS,
  READER_LINE_SPACING,
  READER_FONT_SIZE_MIN,
  READER_FONT_SIZE_MAX,
  type ReaderFont,
  type ReaderLineSpacing,
  type ReaderSettings,
  type ReaderTheme,
} from '@/lib/readerSettings';
import { ReaderDrawer } from '@/components/reader/ReaderDrawer';

const STEP = 2;

const THEME_OPTIONS: { id: ReaderTheme; label: string; icon: typeof Sun; swatch: string; text: string }[] = [
  { id: 'light', label: 'Light', icon: Sun, swatch: 'bg-white border-slate-300', text: 'text-slate-700' },
  { id: 'sepia', label: 'Sepia', icon: BookOpen, swatch: 'bg-amber-50 border-amber-300', text: 'text-amber-900' },
  { id: 'dark', label: 'Dark', icon: Moon, swatch: 'bg-slate-900 border-slate-700', text: 'text-slate-200' },
];

interface ReaderSettingsPanelProps {
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
  onClose: () => void;
}

export function ReaderSettingsPanel({ settings, onChange, onClose }: ReaderSettingsPanelProps) {
  return (
    <ReaderDrawer title="Reader Settings" onClose={onClose}>
      <div className="p-5 space-y-7">
        <section>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-3">
            <Type className="w-4 h-4" /> Font Size
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onChange({ fontSize: Math.max(READER_FONT_SIZE_MIN, settings.fontSize - STEP) })}
              disabled={settings.fontSize <= READER_FONT_SIZE_MIN}
              className="btn-ghost !px-3 !py-2 disabled:opacity-30"
              aria-label="Decrease font size"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold w-14 text-center tabular-nums">{settings.fontSize}px</span>
            <button
              onClick={() => onChange({ fontSize: Math.min(READER_FONT_SIZE_MAX, settings.fontSize + STEP) })}
              disabled={settings.fontSize >= READER_FONT_SIZE_MAX}
              className="btn-ghost !px-3 !py-2 disabled:opacity-30"
              aria-label="Increase font size"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </section>

        <section>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Font</p>
          <div className="space-y-2">
            {(Object.keys(READER_FONTS) as ReaderFont[]).map((id) => (
              <button
                key={id}
                onClick={() => onChange({ fontFamily: id })}
                className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                  settings.fontFamily === id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <span className="text-sm text-slate-700 dark:text-slate-200" style={{ fontFamily: READER_FONTS[id].stack }}>
                  {READER_FONTS[id].label}
                </span>
                {settings.fontFamily === id && <Check className="w-4 h-4 text-primary-500" />}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Line Spacing</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(READER_LINE_SPACING) as ReaderLineSpacing[]).map((id) => (
              <button
                key={id}
                onClick={() => onChange({ lineSpacing: id })}
                className={`py-2.5 rounded-xl border-2 text-xs font-semibold transition-all ${
                  settings.lineSpacing === id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                {READER_LINE_SPACING[id].label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Reader Theme</p>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = settings.theme === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => onChange({ theme: opt.id })}
                  className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1.5 ${opt.swatch} ${opt.text} ${
                    active ? 'ring-2 ring-primary-500' : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs font-semibold">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </ReaderDrawer>
  );
}
