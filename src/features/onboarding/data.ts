/**
 * Onboarding content for Fenzit.
 *
 * Three benefit-led slides mapped to the core loop (Assign → Track → Done).
 * Copy emphasizes the owner's outcome, not the feature, per onboarding best
 * practice (sell the result, keep one idea per screen).
 */
import type { ComponentType } from 'react';
import { ClipboardList, MapPinned, CircleCheckBig } from 'lucide-react-native';
import { palette } from '../../theme';

export type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export type Slide = {
  key: string;
  Icon: ComponentType<IconProps>;
  title: string;
  body: string;
  from: string; // medallion gradient (top-left)
  to: string; // medallion gradient (bottom-right)
};

export const SLIDES: Slide[] = [
  {
    key: 'assign',
    Icon: ClipboardList,
    title: 'Assign jobs in seconds',
    body: 'Send the right worker to the right job, with arrival times your customers can count on.',
    from: palette.blue800,
    to: palette.blue600,
  },
  {
    key: 'track',
    Icon: MapPinned,
    title: 'Track your team live',
    body: 'See where everyone is on a map, so you always know what is happening in the field.',
    from: palette.blue700,
    to: palette.blue600,
  },
  {
    key: 'done',
    Icon: CircleCheckBig,
    title: 'Done, with proof',
    body: 'Every job closes with a photo and location — no more guesswork, no more callbacks.',
    from: palette.blue600,
    to: palette.green500,
  },
];
