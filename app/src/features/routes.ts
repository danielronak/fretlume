import type { MessageKey } from '@i18n/index';
import type { IconName } from '@ui/icons';

export interface Destination {
  path: string;
  icon: IconName;
  nav: MessageKey;
  title: MessageKey;
  body: MessageKey;
}

/** The seven primary destinations, in navigation order (docs/specs/05-ux.md §2). */
export const destinations: Destination[] = [
  { path: '/today', icon: 'today', nav: 'navToday', title: 'todayTitle', body: 'todayBody' },
  { path: '/learn', icon: 'learn', nav: 'navLearn', title: 'learnTitle', body: 'learnBody' },
  {
    path: '/library',
    icon: 'library',
    nav: 'navLibrary',
    title: 'libraryTitle',
    body: 'libraryBody',
  },
  { path: '/stage', icon: 'stage', nav: 'navStage', title: 'stageTitle', body: 'stageBody' },
  { path: '/tabs', icon: 'tabs', nav: 'navTabs', title: 'tabsTitle', body: 'tabsBody' },
  { path: '/tools', icon: 'tools', nav: 'navTools', title: 'toolsTitle', body: 'toolsBody' },
  {
    path: '/progress',
    icon: 'progress',
    nav: 'navProgress',
    title: 'progressTitle',
    body: 'progressBody',
  },
];

export const settingsDestination: Destination = {
  path: '/settings',
  icon: 'settings',
  nav: 'navSettings',
  title: 'settingsTitle',
  body: 'settingsBody',
};
