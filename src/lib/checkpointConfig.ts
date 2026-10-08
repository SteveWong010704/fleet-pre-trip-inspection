import { isSaturdayInspection } from '../types';

export interface CheckpointSlot {
  index: number;
  name: string;
  shortLabel: string;
  description: string;
}

export interface CheckpointRequirement {
  id: string;
  minPhotos: number;
  slots?: CheckpointSlot[];
}

export const CHECKPOINT_PHOTO_CONFIG: Record<string, CheckpointRequirement> = {
  tires_wheels: {
    id: 'tires_wheels',
    minPhotos: 5,
    slots: [
      { index: 0, name: 'Front-Left Tyre', shortLabel: 'Front-L', description: 'Front Left Wheel & Tread' },
      { index: 1, name: 'Front-Right Tyre', shortLabel: 'Front-R', description: 'Front Right Wheel & Tread' },
      { index: 2, name: 'Rear-Left Tyre', shortLabel: 'Rear-L', description: 'Rear Left Dual/Single Wheel' },
      { index: 3, name: 'Rear-Right Tyre', shortLabel: 'Rear-R', description: 'Rear Right Dual/Single Wheel' },
      { index: 4, name: 'Spare Tyre', shortLabel: 'Spare', description: 'Underbody / Mounted Spare Wheel' },
    ],
  },
  body_passenger_doors: {
    id: 'body_passenger_doors',
    minPhotos: 4,
    slots: [
      { index: 0, name: 'Front View', shortLabel: 'Front', description: 'Cabin Front, Grille & Windshield' },
      { index: 1, name: 'Rear View', shortLabel: 'Rear', description: 'Cargo Rear Doors & Shutter' },
      { index: 2, name: 'Left Side View', shortLabel: 'Left Side', description: 'Full Left Cargo Side & Panel' },
      { index: 3, name: 'Right Side View', shortLabel: 'Right Side', description: 'Full Right Cargo Side & Panel' },
    ],
  },
  diesel_fuel_cap: {
    id: 'diesel_fuel_cap',
    minPhotos: 1,
    slots: [
      { index: 0, name: 'Diesel Cap & Tank', shortLabel: 'Fuel Cap', description: 'Diesel Filler Neck & Lock Cap' },
    ],
  },
  radiator_coolant: {
    id: 'radiator_coolant',
    minPhotos: 1,
    slots: [
      { index: 0, name: 'Radiator & Coolant Tank', shortLabel: 'Coolant', description: 'Radiator Core, Cap & Expansion Reservoir' },
    ],
  },
  dashboard_warnings: {
    id: 'dashboard_warnings',
    minPhotos: 1,
    slots: [
      { index: 0, name: 'Instrument Cluster', shortLabel: 'Cluster', description: 'Dashboard Guages & Warning Lamps' },
    ],
  },
  brake_system: {
    id: 'brake_system',
    minPhotos: 1,
    slots: [
      { index: 0, name: 'Brake Fluid Level', shortLabel: 'Brake Fluid', description: 'Brake Fluid Reservoir Level (Between MIN and MAX)' },
    ],
  },
  steering_handling: {
    id: 'steering_handling',
    minPhotos: 1,
    slots: [
      { index: 0, name: 'Power Steering Fluid', shortLabel: 'Steering Fluid', description: 'Power Steering Fluid Reservoir & Level' },
    ],
  },
  fluids_powertrain: {
    id: 'fluids_powertrain',
    minPhotos: 1,
    slots: [
      { index: 0, name: 'Engine Oil Level', shortLabel: 'Engine Oil', description: 'Engine Oil Dipstick Level & Cleanliness' },
    ],
  },
};

export const WEEKDAY_TIRE_SLOTS: CheckpointSlot[] = [
  { index: 0, name: 'Front-Left Tyre', shortLabel: 'Front-L', description: 'Front Left Wheel & Tread' },
  { index: 1, name: 'Front-Right Tyre', shortLabel: 'Front-R', description: 'Front Right Wheel & Tread' },
];

export const SATURDAY_TIRE_SLOTS: CheckpointSlot[] = [
  { index: 0, name: 'Front-Left Tyre', shortLabel: 'Front-L', description: 'Front Left Wheel & Tread' },
  { index: 1, name: 'Front-Right Tyre', shortLabel: 'Front-R', description: 'Front Right Wheel & Tread' },
  { index: 2, name: 'Rear-Left Tyre', shortLabel: 'Rear-L', description: 'Rear Left Dual/Single Wheel' },
  { index: 3, name: 'Rear-Right Tyre', shortLabel: 'Rear-R', description: 'Rear Right Dual/Single Wheel' },
  { index: 4, name: 'Spare Tyre', shortLabel: 'Spare', description: 'Underbody / Mounted Spare Wheel' },
];

export function getCheckpointRequiredPhotoCount(itemId: string, isSaturday: boolean = isSaturdayInspection()): number {
  if (itemId === 'tires_wheels') {
    return isSaturday ? 5 : 2;
  }
  return CHECKPOINT_PHOTO_CONFIG[itemId]?.minPhotos || 0;
}

export function getCheckpointSlots(itemId: string, isSaturday: boolean = isSaturdayInspection()): CheckpointSlot[] | null {
  if (itemId === 'tires_wheels') {
    return isSaturday ? SATURDAY_TIRE_SLOTS : WEEKDAY_TIRE_SLOTS;
  }
  return CHECKPOINT_PHOTO_CONFIG[itemId]?.slots || null;
}
