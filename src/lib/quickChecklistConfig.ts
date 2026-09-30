export interface QuickCheckQuestion {
  key: string;
  label: string;
  subtext?: string;
}

export const LIGHTS_CHECKS: QuickCheckQuestion[] = [
  { key: 'headlights', label: 'Headlights (Low & High Beam)', subtext: 'Both lamps illuminate clearly' },
  { key: 'brake_lamps', label: 'Brake Lamps (Rear Red Stop Lights)', subtext: 'Operates when foot brake pressed' },
  { key: 'turn_signals', label: 'Turn Signal Flashers (Left & Right)', subtext: 'Front, side, and rear blinkers' },
  { key: 'hazard_flashers', label: 'Hazard Warning Double Flashers', subtext: 'Simultaneous 4-way flasher operation' },
  { key: 'reverse_buzzer', label: 'Reverse Warning Buzzer & Reverse Light', subtext: 'Audible alarm and clear white lamp' },
];

export const BRAKES_CHECKS: QuickCheckQuestion[] = [
  { key: 'foot_brake', label: 'Service Foot Brake', subtext: 'Firm pedal resistance, prompt stopping power' },
  { key: 'handbrake', label: 'Parking Handbrake', subtext: 'Holds vehicle securely on incline/gradient' },
  { key: 'air_pressure', label: 'Air / Vacuum Pressure System', subtext: 'Pressure builds and maintains normal operating range' },
];

export const STEERING_CHECKS: QuickCheckQuestion[] = [
  { key: 'free_play', label: 'Steering Wheel Free Play', subtext: 'Normal tolerance (<30mm free play at rim)' },
  { key: 'power_steering', label: 'Power Steering Smoothness', subtext: 'Smooth turning with no stiffness, binding, or pump whining' },
  { key: 'alignment', label: 'Front-End Stability', subtext: 'No vibration, wheel wobble, or pulling to one side' },
];

export const FLUIDS_CHECKS: QuickCheckQuestion[] = [
  { key: 'engine_oil', label: 'Engine Oil Dipstick Level', subtext: 'Safe level between Min and Max markers' },
  { key: 'brake_fluid', label: 'Brake & Clutch Fluid Reservoirs', subtext: 'Adequate level, cap securely sealed' },
  { key: 'battery', label: 'Battery Terminals & Hold-Down', subtext: 'Clean terminals, tight connections, corrosion-free' },
  { key: 'no_leaks', label: 'No Fluid Puddles or Leaks', subtext: 'No oil, fuel, or fluid dripping under engine/gearbox' },
];

export const FEEDER_APAD_SAFETY_EQUIPMENT: QuickCheckQuestion[] = [
  { key: 'fire_extinguisher_9kg', label: '1x Fire Extinguisher 9kg (Dry Powder)', subtext: 'Valid inspection tag, gauge needle in green' },
  { key: 'warning_triangle', label: '1x Emergency Warning Triangle', subtext: 'Reflective red folding triangle' },
  { key: 'first_aid_kit', label: '1x First Aid Kit (Peti Kecemasan)', subtext: 'Complete statutory dressings & antiseptic' },
  { key: 'safety_vest', label: '1x High-Visibility Safety Vest', subtext: 'Reflective stripes for roadside safety' },
  { key: 'flashlight', label: '1x Heavy-Duty Flashlight / Torch', subtext: 'Functional battery & bright beam' },
  { key: 'reflective_line', label: '1x 50m Reflective Line (Rentetan Reflektif 50m)', subtext: 'Required under APAD heavy feeder standards' },
  { key: 'safety_cones', label: '5x Safety Warning Cones (Kon Keselamatan)', subtext: 'Statutory warning cones on board' },
];

export const SMALL_TRUCK_SAFETY_EQUIPMENT: QuickCheckQuestion[] = [
  { key: 'fire_extinguisher', label: '1x Fire Extinguisher', subtext: 'Valid inspection tag, gauge needle in green' },
  { key: 'warning_triangle', label: '1x Emergency Warning Triangle', subtext: 'Reflective red folding triangle' },
];

export function getCheckpointSystemChecks(itemId: string, isFeeder: boolean = false): QuickCheckQuestion[] {
  if (itemId === 'lights_indicators') return LIGHTS_CHECKS;
  if (itemId === 'emergency_equipment') return isFeeder ? FEEDER_APAD_SAFETY_EQUIPMENT : SMALL_TRUCK_SAFETY_EQUIPMENT;
  if (itemId === 'brake_system') return BRAKES_CHECKS;
  if (itemId === 'steering_handling') return STEERING_CHECKS;
  if (itemId === 'fluids_powertrain') return FLUIDS_CHECKS;
  return [];
}

export function getDefaultSystemChecks(itemId: string, isFeeder: boolean = false): Record<string, boolean> {
  const list = getCheckpointSystemChecks(itemId, isFeeder);
  const result: Record<string, boolean> = {};
  for (const item of list) {
    result[item.key] = true;
  }
  return result;
}
