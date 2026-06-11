export type WeatherType = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'hot_wave' | 'cool' | 'freezing';
export type SeasonType = 'spring' | 'summer' | 'autumn' | 'winter';

export type CeremonyType = 'festival' | 'banquet' | 'sacrifice' | 'imperial_audience' | 'other';
export type CeremonyLevel = 'grand' | 'major' | 'minor' | 'ordinary';
export type CeremonyStatus = 'pending' | 'active' | 'completed' | 'cancelled' | 'failed';

export interface CeremonySupplyNode {
  jianId: string;
  minIceAmount: number;
  priority: number;
}

export interface CeremonyEvent {
  id: string;
  name: string;
  type: CeremonyType;
  level: CeremonyLevel;
  startDay: number;
  durationDays: number;
  supplyNodes: CeremonySupplyNode[];
  description?: string;
  status: CeremonyStatus;
  failureReason?: string;
}

export interface CeremonyConsumptionPlan {
  ceremonyId: string;
  ceremonyName: string;
  jianId: string;
  day: number;
  amount: number;
  priority: number;
  level: CeremonyLevel;
  isCeremony: boolean;
}

export interface DailyClimate {
  id: string;
  day: number;
  temperature: number;
  weather: WeatherType;
  season: SeasonType;
  seasonEvent?: string;
  hasHeatWarning: boolean;
  heatWarningLevel?: 'yellow' | 'orange' | 'red';
  description?: string;
}

export interface ClimateImpact {
  lossRateMultiplier: number;
  travelTimeMultiplier: number;
  capacityMultiplier: number;
  demandMultiplier: number;
}

export type NodeType = 'cellar' | 'jian' | 'transit';

export interface BaseNode {
  id: string;
  name: string;
  type: NodeType;
  positionX: number;
  positionY: number;
}

export interface IceCellar extends BaseNode {
  type: 'cellar';
  maxCapacity: number;
  currentStock: number;
  dailyLossRate: number;
}

export interface IceJian extends BaseNode {
  type: 'jian';
  maxCapacity: number;
  currentStock: number;
  dailyLossRate: number;
}

export interface TransitNode extends BaseNode {
  type: 'transit';
  maxConcurrentShipments: number;
  maxCapacity: number;
  currentStock: number;
  dailyLossRate: number;
}

export type IceNode = IceCellar | IceJian | TransitNode;

export interface NodeConnection {
  id: string;
  fromId: string;
  toId: string;
  travelDays: number;
  transitLossRate: number;
}

export interface DailyConsumptionPlan {
  id: string;
  jianId: string;
  day: number;
  amount: number;
  description: string;
}

export interface Shipment {
  id: string;
  fromId: string;
  toId: string;
  amount: number;
  startDay: number;
  arrivalDay: number;
  lossAmount: number;
  receivedAmount: number;
  connectionId: string;
  status: 'pending' | 'in_transit' | 'delivered' | 'cancelled';
  multiStageId?: string;
  stageIndex?: number;
  baseArrivalDay?: number;
  weatherDelayApplied?: boolean;
}

export interface ShipmentStage {
  id: string;
  fromId: string;
  toId: string;
  connectionId: string;
  startDay: number;
  arrivalDay: number;
  amount: number;
  lossAmount: number;
  receivedAmount: number;
  status: 'pending' | 'in_transit' | 'delivered' | 'cancelled' | 'failed';
  transitStayDays?: number;
  occupancyId?: string;
  baseArrivalDay?: number;
  weatherDelayApplied?: boolean;
}

export interface TransitOccupancy {
  id: string;
  multiStageId: string;
  stageIndex: number;
  nodeId: string;
  amount: number;
  startDay: number;
  endDay: number;
  status: 'active' | 'ended' | 'cancelled';
}

export interface MultiStageShipment {
  id: string;
  name: string;
  totalAmount: number;
  stages: ShipmentStage[];
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'failed';
  currentStageIndex: number;
  failureReason?: string;
  createdAt: number;
  occupancies: TransitOccupancy[];
}

export interface DailyLog {
  day: number;
  climate?: DailyClimate;
  climateImpact?: ClimateImpact;
  cellarStocks: { [cellarId: string]: number };
  jianStocks: { [jianId: string]: number };
  transitStocks: { [nodeId: string]: number };
  activeShipments: Shipment[];
  deliveries: Shipment[];
  consumptions: { jianId: string; amount: number; success: boolean; reason?: string; isCeremony?: boolean; ceremonyId?: string; ceremonyName?: string }[];
  dailyLosses: { nodeId: string; amount: number; climateBonus?: number }[];
  warnings: string[];
  errors: string[];
  multiStageUpdates: { multiStageId: string; stageIndex: number; status: string; delayDays?: number }[];
  transitOccupancies: { occupancyId: string; nodeId: string; amount: number; status: string }[];
  weatherDelays: { shipmentId: string; delayDays: number; reason: string }[];
  ceremonyUpdates: { ceremonyId: string; ceremonyName: string; status: CeremonyStatus; failureReason?: string }[];
  ceremonyConsumptions: { ceremonyId: string; ceremonyName: string; jianId: string; amount: number; success: boolean; reason?: string }[];
  logHash: string;
}

export interface SchedulingState {
  currentDay: number;
  isRunning: boolean;
  isPaused: boolean;
  isReplaying: boolean;
  speedMultiplier: number;
  totalDays: number;
  logs: DailyLog[];
  originalLogs: DailyLog[] | null;
  warnings: string[];
  isOverAllocated: boolean;
  overAllocationReason: string | null;
  pauseReason: string | null;
  failedMultiStageId: string | null;
  replayConsistencyError: string | null;
  replayConsistencyPassed: boolean;
  heatWarningPause: boolean;
  heatWarningReason: string | null;
  ceremonyPause: boolean;
  ceremonyPauseReason: string | null;
  affectedCeremonies: string[];
  ceremonyDeficit: number;
}

export interface SchedulingConfig {
  cellars: IceCellar[];
  jians: IceJian[];
  transitNodes: TransitNode[];
  connections: NodeConnection[];
  consumptionPlans: DailyConsumptionPlan[];
  shipments: Shipment[];
  multiStageShipments: MultiStageShipment[];
  climates: DailyClimate[];
  ceremonies: CeremonyEvent[];
  totalDays: number;
}
