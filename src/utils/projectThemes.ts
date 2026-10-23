export type ProjectColorKey =
  | 'emerald'
  | 'indigo'
  | 'violet'
  | 'amber'
  | 'rose'
  | 'cyan';

export interface ProjectThemePalette {
  key: ProjectColorKey;
  label: string;
  dotClass: string;
  swatchClass: string;
  activeTabBtn: string;
  inactiveTabBtn: string;
  heroBanner: string;
  badgeClass: string;
  cardBorder: string;
  cardSoftBg: string;
  accentText: string;
}

export const PROJECT_THEMES: Record<ProjectColorKey, ProjectThemePalette> = {
  emerald: {
    key: 'emerald',
    label: 'زمردی',
    dotClass: 'bg-emerald-500',
    swatchClass: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    activeTabBtn:
      'bg-gradient-to-l from-emerald-600 via-teal-600 to-cyan-600 text-white shadow-md shadow-emerald-600/25 ring-1 ring-emerald-400/40',
    inactiveTabBtn:
      'bg-emerald-50/80 hover:bg-emerald-100/80 text-emerald-900 border border-emerald-200/80',
    heroBanner:
      'bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 shadow-lg shadow-emerald-900/15',
    badgeClass:
      'bg-emerald-100/90 text-emerald-800 border-emerald-300/80',
    cardBorder: 'border-emerald-300',
    cardSoftBg: 'bg-gradient-to-br from-emerald-50/95 via-teal-50/70 to-white',
    accentText: 'text-emerald-700',
  },
  indigo: {
    key: 'indigo',
    label: 'لاجوردی',
    dotClass: 'bg-indigo-500',
    swatchClass: 'bg-gradient-to-br from-indigo-500 to-blue-600',
    activeTabBtn:
      'bg-gradient-to-l from-indigo-600 via-blue-600 to-sky-600 text-white shadow-md shadow-indigo-600/25 ring-1 ring-indigo-400/40',
    inactiveTabBtn:
      'bg-indigo-50/80 hover:bg-indigo-100/80 text-indigo-900 border border-indigo-200/80',
    heroBanner:
      'bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-700 shadow-lg shadow-indigo-900/15',
    badgeClass:
      'bg-indigo-100/90 text-indigo-800 border-indigo-300/80',
    cardBorder: 'border-indigo-300',
    cardSoftBg: 'bg-gradient-to-br from-indigo-50/95 via-blue-50/70 to-white',
    accentText: 'text-indigo-700',
  },
  violet: {
    key: 'violet',
    label: 'بنفش مدرن',
    dotClass: 'bg-violet-500',
    swatchClass: 'bg-gradient-to-br from-violet-500 to-purple-600',
    activeTabBtn:
      'bg-gradient-to-l from-violet-600 via-purple-600 to-fuchsia-600 text-white shadow-md shadow-violet-600/25 ring-1 ring-violet-400/40',
    inactiveTabBtn:
      'bg-violet-50/80 hover:bg-violet-100/80 text-violet-900 border border-violet-200/80',
    heroBanner:
      'bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 shadow-lg shadow-violet-900/15',
    badgeClass:
      'bg-violet-100/90 text-violet-800 border-violet-300/80',
    cardBorder: 'border-violet-300',
    cardSoftBg: 'bg-gradient-to-br from-violet-50/95 via-purple-50/70 to-white',
    accentText: 'text-violet-700',
  },
  amber: {
    key: 'amber',
    label: 'طلایی / کهربایی',
    dotClass: 'bg-amber-500',
    swatchClass: 'bg-gradient-to-br from-amber-500 to-orange-600',
    activeTabBtn:
      'bg-gradient-to-l from-amber-500 via-orange-500 to-red-500 text-white shadow-md shadow-orange-600/25 ring-1 ring-amber-400/40',
    inactiveTabBtn:
      'bg-amber-50/80 hover:bg-amber-100/80 text-amber-900 border border-amber-200/80',
    heroBanner:
      'bg-gradient-to-br from-amber-600 via-orange-600 to-rose-600 shadow-lg shadow-orange-900/15',
    badgeClass:
      'bg-amber-100/90 text-amber-900 border-amber-300/80',
    cardBorder: 'border-amber-300',
    cardSoftBg: 'bg-gradient-to-br from-amber-50/95 via-orange-50/70 to-white',
    accentText: 'text-amber-800',
  },
  rose: {
    key: 'rose',
    label: 'یاقوتی',
    dotClass: 'bg-rose-500',
    swatchClass: 'bg-gradient-to-br from-rose-500 to-pink-600',
    activeTabBtn:
      'bg-gradient-to-l from-rose-500 via-pink-600 to-fuchsia-600 text-white shadow-md shadow-rose-600/25 ring-1 ring-rose-400/40',
    inactiveTabBtn:
      'bg-rose-50/80 hover:bg-rose-100/80 text-rose-900 border border-rose-200/80',
    heroBanner:
      'bg-gradient-to-br from-rose-600 via-pink-600 to-purple-700 shadow-lg shadow-rose-900/15',
    badgeClass:
      'bg-rose-100/90 text-rose-800 border-rose-300/80',
    cardBorder: 'border-rose-300',
    cardSoftBg: 'bg-gradient-to-br from-rose-50/95 via-pink-50/70 to-white',
    accentText: 'text-rose-700',
  },
  cyan: {
    key: 'cyan',
    label: 'فیروزه‌ای',
    dotClass: 'bg-cyan-500',
    swatchClass: 'bg-gradient-to-br from-cyan-500 to-sky-600',
    activeTabBtn:
      'bg-gradient-to-l from-cyan-600 via-sky-600 to-blue-600 text-white shadow-md shadow-cyan-600/25 ring-1 ring-cyan-400/40',
    inactiveTabBtn:
      'bg-cyan-50/80 hover:bg-cyan-100/80 text-cyan-900 border border-cyan-200/80',
    heroBanner:
      'bg-gradient-to-br from-cyan-600 via-sky-600 to-indigo-700 shadow-lg shadow-cyan-900/15',
    badgeClass:
      'bg-cyan-100/90 text-cyan-800 border-cyan-300/80',
    cardBorder: 'border-cyan-300',
    cardSoftBg: 'bg-gradient-to-br from-cyan-50/95 via-sky-50/70 to-white',
    accentText: 'text-cyan-700',
  },
};

export const PROJECT_COLOR_KEYS: ProjectColorKey[] = [
  'emerald',
  'indigo',
  'violet',
  'amber',
  'rose',
  'cyan',
];

export function getProjectTheme(
  colorKey?: string | null,
  fallbackIndex = 0
): ProjectThemePalette {
  if (colorKey && colorKey in PROJECT_THEMES) {
    return PROJECT_THEMES[colorKey as ProjectColorKey];
  }
  const fallbackKey = PROJECT_COLOR_KEYS[fallbackIndex % PROJECT_COLOR_KEYS.length];
  return PROJECT_THEMES[fallbackKey];
}
