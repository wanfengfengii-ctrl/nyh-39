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
  cellarStocks: { [cellarId: string]: number };
  jianStocks: { [jianId: string]: number };
  transitStocks: { [nodeId: string]: number };
  activeShipments: Shipment[];
  deliveries: Shipment[];
  consumptions: { jianId: string; amount: number; success: boolean; reason?: string }[];
  dailyLosses: { nodeId: string; amount: number }[];
  warnings: string[];
  errors: string[];
  multiStageUpdates: { multiStageId: string; stageIndex: number; status: string }[];
  transitOccupancies: { occupancyId: string; nodeId: string; amount: number; status: string }[];
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
}

export interface SchedulingConfig {
  cellars: IceCellar[];
  jians: IceJian[];
  transitNodes: TransitNode[];
  connections: NodeConnection[];
  consumptionPlans: DailyConsumptionPlan[];
  shipments: Shipment[];
  multiStageShipments: MultiStageShipment[];
  totalDays: number;
}
