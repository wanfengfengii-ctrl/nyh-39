import { Injectable, signal, computed, effect } from '@angular/core';
import {
  IceCellar,
  IceJian,
  TransitNode,
  NodeConnection,
  DailyConsumptionPlan,
  Shipment,
  DailyLog,
  SchedulingState,
  SchedulingConfig,
  IceNode,
  MultiStageShipment,
  ShipmentStage,
  TransitOccupancy,
  DailyClimate,
  ClimateImpact,
  WeatherType,
  SeasonType,
  CeremonyEvent,
  CeremonySupplyNode,
  CeremonyConsumptionPlan,
  CeremonyType,
  CeremonyLevel,
  CeremonyStatus,
} from '../models/ice.models';

@Injectable({
  providedIn: 'root',
})
export class SchedulingService {
  private _cellars = signal<IceCellar[]>([]);
  private _jians = signal<IceJian[]>([]);
  private _transitNodes = signal<TransitNode[]>([]);
  private _connections = signal<NodeConnection[]>([]);
  private _consumptionPlans = signal<DailyConsumptionPlan[]>([]);
  private _shipments = signal<Shipment[]>([]);
  private _multiStageShipments = signal<MultiStageShipment[]>([]);
  private _transitOccupancies = signal<TransitOccupancy[]>([]);
  private _climates = signal<DailyClimate[]>([]);
  private _ceremonies = signal<CeremonyEvent[]>([]);
  private _ceremonyConsumptions = signal<CeremonyConsumptionPlan[]>([]);

  private _state = signal<SchedulingState>({
    currentDay: 0,
    isRunning: false,
    isPaused: false,
    isReplaying: false,
    speedMultiplier: 1,
    totalDays: 30,
    logs: [],
    originalLogs: null,
    warnings: [],
    isOverAllocated: false,
    overAllocationReason: null,
    pauseReason: null,
    failedMultiStageId: null,
    replayConsistencyError: null,
    replayConsistencyPassed: false,
    heatWarningPause: false,
    heatWarningReason: null,
    ceremonyPause: false,
    ceremonyPauseReason: null,
    affectedCeremonies: [],
    ceremonyDeficit: 0,
  });

  private timerInterval: ReturnType<typeof setInterval> | null = null;

  readonly cellars = computed(() => this._cellars());
  readonly jians = computed(() => this._jians());
  readonly transitNodes = computed(() => this._transitNodes());
  readonly connections = computed(() => this._connections());
  readonly consumptionPlans = computed(() => this._consumptionPlans());
  readonly shipments = computed(() => this._shipments());
  readonly multiStageShipments = computed(() => this._multiStageShipments());
  readonly transitOccupancies = computed(() => this._transitOccupancies());
  readonly climates = computed(() => this._climates());
  readonly ceremonies = computed(() => this._ceremonies());
  readonly ceremonyConsumptions = computed(() => this._ceremonyConsumptions());
  readonly state = computed(() => this._state());

  readonly allNodes = computed<IceNode[]>(() => [
    ...this._cellars(),
    ...this._jians(),
    ...this._transitNodes(),
  ]);

  private generateId(): string {
    return Math.random().toString(36).substring(2, 11);
  }

  getClimateForDay(day: number): DailyClimate | null {
    return this._climates().find(c => c.day === day) || null;
  }

  calculateClimateImpact(climate: DailyClimate | null): ClimateImpact {
    if (!climate) {
      return {
        lossRateMultiplier: 1,
        travelTimeMultiplier: 1,
        capacityMultiplier: 1,
        demandMultiplier: 1,
      };
    }

    let lossMultiplier = 1;
    let travelMultiplier = 1;
    let capacityMultiplier = 1;
    let demandMultiplier = 1;

    if (climate.temperature > 35) {
      lossMultiplier *= 1.8;
      demandMultiplier *= 1.5;
      capacityMultiplier *= 0.9;
    } else if (climate.temperature > 28) {
      lossMultiplier *= 1.4;
      demandMultiplier *= 1.2;
    } else if (climate.temperature > 20) {
      lossMultiplier *= 1.1;
    } else if (climate.temperature < -5) {
      lossMultiplier *= 0.6;
      demandMultiplier *= 0.8;
      capacityMultiplier *= 1.1;
    } else if (climate.temperature < 5) {
      lossMultiplier *= 0.8;
      demandMultiplier *= 0.9;
    }

    switch (climate.weather) {
      case 'hot_wave':
        lossMultiplier *= 1.5;
        demandMultiplier *= 1.3;
        break;
      case 'sunny':
        lossMultiplier *= 1.1;
        break;
      case 'rainy':
        travelMultiplier *= 1.3;
        lossMultiplier *= 0.95;
        break;
      case 'snowy':
        travelMultiplier *= 1.5;
        lossMultiplier *= 0.7;
        break;
      case 'freezing':
        travelMultiplier *= 1.2;
        lossMultiplier *= 0.5;
        break;
      case 'cloudy':
        lossMultiplier *= 0.95;
        break;
      case 'cool':
        lossMultiplier *= 0.85;
        break;
    }

    switch (climate.season) {
      case 'summer':
        lossMultiplier *= 1.2;
        demandMultiplier *= 1.2;
        break;
      case 'winter':
        lossMultiplier *= 0.8;
        demandMultiplier *= 0.9;
        break;
      case 'spring':
        lossMultiplier *= 1.05;
        break;
      case 'autumn':
        lossMultiplier *= 0.95;
        break;
    }

    if (climate.hasHeatWarning) {
      switch (climate.heatWarningLevel) {
        case 'yellow':
          lossMultiplier *= 1.2;
          demandMultiplier *= 1.1;
          break;
        case 'orange':
          lossMultiplier *= 1.4;
          demandMultiplier *= 1.2;
          capacityMultiplier *= 0.85;
          break;
        case 'red':
          lossMultiplier *= 1.8;
          demandMultiplier *= 1.4;
          capacityMultiplier *= 0.7;
          travelMultiplier *= 1.2;
          break;
      }
    }

    return {
      lossRateMultiplier: Math.max(0.1, lossMultiplier),
      travelTimeMultiplier: Math.max(0.5, travelMultiplier),
      capacityMultiplier: Math.max(0.3, Math.min(1.5, capacityMultiplier)),
      demandMultiplier: Math.max(0.5, demandMultiplier),
    };
  }

  addClimate(data: Omit<DailyClimate, 'id'>): DailyClimate {
    const climate: DailyClimate = {
      ...data,
      id: this.generateId(),
    };
    this._climates.update((prev) => [...prev, climate]);
    return climate;
  }

  updateClimate(id: string, changes: Partial<Omit<DailyClimate, 'id'>>): void {
    this._climates.update((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...changes } : c))
    );
  }

  removeClimate(id: string): void {
    this._climates.update((prev) => prev.filter((c) => c.id !== id));
  }

  getClimateSummary(day: number): string {
    const climate = this.getClimateForDay(day);
    if (!climate) return '第 ' + day + ' 天：暂无气候数据';
    
    const weatherMap: Record<WeatherType, string> = {
      sunny: '晴',
      cloudy: '多云',
      rainy: '雨',
      snowy: '雪',
      hot_wave: '热浪',
      cool: '凉爽',
      freezing: '严寒',
    };
    
    const seasonMap: Record<SeasonType, string> = {
      spring: '春',
      summer: '夏',
      autumn: '秋',
      winter: '冬',
    };

    let result = `第 ${day} 天：${seasonMap[climate.season]}季 · ${climate.temperature}°C · ${weatherMap[climate.weather]}`;
    if (climate.hasHeatWarning) {
      const levelMap = { yellow: '黄色', orange: '橙色', red: '红色' };
      result += ` · ⚠${levelMap[climate.heatWarningLevel || 'yellow']}高温预警`;
    }
    if (climate.seasonEvent) {
      result += ` · ${climate.seasonEvent}`;
    }
    return result;
  }

  private generateLogHash(log: DailyLog): string {
    const hashContent = JSON.stringify({
      day: log.day,
      climate: log.climate,
      climateImpact: log.climateImpact,
      cellarStocks: log.cellarStocks,
      jianStocks: log.jianStocks,
      transitStocks: log.transitStocks,
      deliveries: log.deliveries.map(d => ({ id: d.id, status: d.status, receivedAmount: d.receivedAmount })),
      consumptions: log.consumptions,
      dailyLosses: log.dailyLosses,
      multiStageUpdates: log.multiStageUpdates,
      transitOccupancies: log.transitOccupancies,
      weatherDelays: log.weatherDelays,
      ceremonyUpdates: log.ceremonyUpdates,
      ceremonyConsumptions: log.ceremonyConsumptions,
    });
    let hash = 0;
    for (let i = 0; i < hashContent.length; i++) {
      const char = hashContent.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  getTransitOccupancyAtNode(nodeId: string, day: number): TransitOccupancy[] {
    return this._transitOccupancies().filter(o =>
      o.nodeId === nodeId &&
      o.status === 'active' &&
      o.startDay <= day &&
      o.endDay >= day
    );
  }

  getTotalOccupiedAmountAtNode(nodeId: string, day: number): number {
    return this.getTransitOccupancyAtNode(nodeId, day)
      .reduce((sum, o) => sum + o.amount, 0);
  }

  getAvailableCapacityAtNode(nodeId: string, day: number): number {
    const node = this.allNodes().find(n => n.id === nodeId);
    if (!node || node.type === 'cellar') return Number.MAX_SAFE_INTEGER;
    const occupied = this.getTotalOccupiedAmountAtNode(nodeId, day);
    const currentStock = node.currentStock;
    
    const climate = this.getClimateForDay(day);
    const impact = this.calculateClimateImpact(climate);
    const effectiveCapacity = Math.floor(node.maxCapacity * impact.capacityMultiplier);
    
    return effectiveCapacity - currentStock - occupied;
  }

  private refundShipmentStock(shipment: Shipment): void {
    if (shipment.status !== 'pending') return;
    const fromNode = this.allNodes().find((n) => n.id === shipment.fromId);
    if (!fromNode) return;
    if (fromNode.type === 'cellar') {
      this.updateCellar(fromNode.id, {
        currentStock: Math.min(
          fromNode.maxCapacity,
          fromNode.currentStock + shipment.amount
        ),
      });
    } else if (fromNode.type === 'jian') {
      this.updateJian(fromNode.id, {
        currentStock: Math.min(
          fromNode.maxCapacity,
          fromNode.currentStock + shipment.amount
        ),
      });
    } else if (fromNode.type === 'transit') {
      this.updateTransitNode(fromNode.id, {
        currentStock: Math.min(
          fromNode.maxCapacity,
          fromNode.currentStock + shipment.amount
        ),
      });
    }
  }

  private refundShipmentsFromNode(nodeId: string): void {
    for (const s of this._shipments()) {
      if (s.status === 'pending' && s.fromId === nodeId) {
        this.refundShipmentStock(s);
      }
    }
  }

  addCellar(data: Omit<IceCellar, 'id' | 'type'>): IceCellar {
    if (data.dailyLossRate < 0) {
      throw new Error('损耗率不能小于 0');
    }
    const cellar: IceCellar = {
      ...data,
      id: this.generateId(),
      type: 'cellar',
    };
    this._cellars.update((prev) => [...prev, cellar]);
    return cellar;
  }

  updateCellar(id: string, changes: Partial<Omit<IceCellar, 'id' | 'type'>>): void {
    if (changes.dailyLossRate !== undefined && changes.dailyLossRate < 0) {
      throw new Error('损耗率不能小于 0');
    }
    this._cellars.update((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...changes } : c))
    );
  }

  removeCellar(id: string): void {
    const relatedConnections = this._connections().filter(
      (c) => c.fromId === id || c.toId === id
    );

    this.refundShipmentsFromNode(id);
    this._shipments.update((prev) =>
      prev.filter((s) => s.fromId !== id && s.toId !== id)
    );

    this._removeMultiStageShipmentsForNode(id);

    if (relatedConnections.length > 0) {
      this._connections.update((prev) =>
        prev.filter((c) => c.fromId !== id && c.toId !== id)
      );
    }

    this._cellars.update((prev) => prev.filter((c) => c.id !== id));
  }

  addJian(data: Omit<IceJian, 'id' | 'type'>): IceJian {
    if (data.dailyLossRate < 0) {
      throw new Error('损耗率不能小于 0');
    }
    const jian: IceJian = {
      ...data,
      id: this.generateId(),
      type: 'jian',
    };
    this._jians.update((prev) => [...prev, jian]);
    return jian;
  }

  updateJian(id: string, changes: Partial<Omit<IceJian, 'id' | 'type'>>): void {
    if (changes.dailyLossRate !== undefined && changes.dailyLossRate < 0) {
      throw new Error('损耗率不能小于 0');
    }
    this._jians.update((prev) =>
      prev.map((j) => (j.id === id ? { ...j, ...changes } : j))
    );
  }

  removeJian(id: string): void {
    this.refundShipmentsFromNode(id);
    this._shipments.update((prev) =>
      prev.filter((s) => s.fromId !== id && s.toId !== id)
    );

    this._removeMultiStageShipmentsForNode(id);

    this._connections.update((prev) =>
      prev.filter((c) => c.fromId !== id && c.toId !== id)
    );
    this._consumptionPlans.update((prev) => prev.filter((p) => p.jianId !== id));
    this._jians.update((prev) => prev.filter((j) => j.id !== id));
  }

  addTransitNode(data: Omit<TransitNode, 'id' | 'type'>): TransitNode {
    if (data.dailyLossRate < 0) {
      throw new Error('损耗率不能小于 0');
    }
    if (data.maxCapacity < 0) {
      throw new Error('容量不能小于 0');
    }
    const node: TransitNode = {
      ...data,
      id: this.generateId(),
      type: 'transit',
    };
    this._transitNodes.update((prev) => [...prev, node]);
    return node;
  }

  updateTransitNode(
    id: string,
    changes: Partial<Omit<TransitNode, 'id' | 'type'>>
  ): void {
    if (changes.dailyLossRate !== undefined && changes.dailyLossRate < 0) {
      throw new Error('损耗率不能小于 0');
    }
    if (changes.maxCapacity !== undefined && changes.maxCapacity < 0) {
      throw new Error('容量不能小于 0');
    }
    this._transitNodes.update((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...changes } : n))
    );
  }

  removeTransitNode(id: string): void {
    this.refundShipmentsFromNode(id);
    this._shipments.update((prev) =>
      prev.filter((s) => s.fromId !== id && s.toId !== id)
    );

    this._removeMultiStageShipmentsForNode(id);

    this._connections.update((prev) =>
      prev.filter((c) => c.fromId !== id && c.toId !== id)
    );
    this._transitNodes.update((prev) => prev.filter((n) => n.id !== id));
  }

  addConnection(data: Omit<NodeConnection, 'id'>): NodeConnection {
    if (data.transitLossRate < 0) {
      throw new Error('运输损耗率不能小于 0');
    }
    const fromExists = this.allNodes().some((n) => n.id === data.fromId);
    const toExists = this.allNodes().some((n) => n.id === data.toId);
    if (!fromExists || !toExists) {
      throw new Error('连接的节点不存在');
    }
    const connection: NodeConnection = {
      ...data,
      id: this.generateId(),
    };
    this._connections.update((prev) => [...prev, connection]);
    return connection;
  }

  removeConnection(id: string): void {
    this._connections.update((prev) => prev.filter((c) => c.id !== id));
  }

  addConsumptionPlan(
    data: Omit<DailyConsumptionPlan, 'id'>
  ): DailyConsumptionPlan {
    const plan: DailyConsumptionPlan = {
      ...data,
      id: this.generateId(),
    };
    this._consumptionPlans.update((prev) => [...prev, plan]);
    return plan;
  }

  removeConsumptionPlan(id: string): void {
    this._consumptionPlans.update((prev) => prev.filter((p) => p.id !== id));
  }

  addCeremony(data: Omit<CeremonyEvent, 'id' | 'status'>): CeremonyEvent {
    if (data.startDay < 0) {
      throw new Error('活动开始日期不能小于 0');
    }
    if (data.durationDays <= 0) {
      throw new Error('活动持续天数必须大于 0');
    }
    if (data.supplyNodes.length === 0) {
      throw new Error('至少需要配置一个保供节点');
    }
    for (const node of data.supplyNodes) {
      if (node.minIceAmount <= 0) {
        throw new Error('最低冰量必须大于 0');
      }
      const jian = this._jians().find(j => j.id === node.jianId);
      if (!jian) {
        throw new Error(`保供节点 ${node.jianId} 不存在`);
      }
    }

    const ceremony: CeremonyEvent = {
      ...data,
      id: this.generateId(),
      status: 'pending',
    };
    this._ceremonies.update((prev) => [...prev, ceremony]);
    this._generateCeremonyConsumptionPlans(ceremony);
    return ceremony;
  }

  updateCeremony(id: string, changes: Partial<Omit<CeremonyEvent, 'id' | 'status'>>): void {
    const ceremony = this._ceremonies().find(c => c.id === id);
    if (!ceremony) return;

    const updated = { ...ceremony, ...changes };
    if (updated.startDay < 0) {
      throw new Error('活动开始日期不能小于 0');
    }
    if (updated.durationDays <= 0) {
      throw new Error('活动持续天数必须大于 0');
    }

    this._ceremonies.update((prev) =>
      prev.map((c) => (c.id === id ? updated : c))
    );

    this._removeCeremonyConsumptionPlans(id);
    this._generateCeremonyConsumptionPlans(updated);
  }

  removeCeremony(id: string): void {
    this._removeCeremonyConsumptionPlans(id);
    this._ceremonies.update((prev) => prev.filter((c) => c.id !== id));
  }

  private _generateCeremonyConsumptionPlans(ceremony: CeremonyEvent): void {
    const plans: CeremonyConsumptionPlan[] = [];
    const levelPriorityMap: Record<CeremonyLevel, number> = {
      grand: 100,
      major: 75,
      minor: 50,
      ordinary: 25,
    };
    const basePriority = levelPriorityMap[ceremony.level];

    for (let day = ceremony.startDay; day < ceremony.startDay + ceremony.durationDays; day++) {
      for (const node of ceremony.supplyNodes) {
        plans.push({
          ceremonyId: ceremony.id,
          ceremonyName: ceremony.name,
          jianId: node.jianId,
          day,
          amount: node.minIceAmount,
          priority: basePriority + node.priority,
          level: ceremony.level,
          isCeremony: true,
        });
      }
    }

    this._ceremonyConsumptions.update((prev) => [...prev, ...plans]);
  }

  private _removeCeremonyConsumptionPlans(ceremonyId: string): void {
    this._ceremonyConsumptions.update((prev) =>
      prev.filter((p) => p.ceremonyId !== ceremonyId)
    );
  }

  getCeremonyById(id: string): CeremonyEvent | undefined {
    return this._ceremonies().find(c => c.id === id);
  }

  getCeremoniesForDay(day: number): CeremonyEvent[] {
    return this._ceremonies().filter(c =>
      c.status !== 'cancelled' &&
      c.status !== 'failed' &&
      day >= c.startDay &&
      day < c.startDay + c.durationDays
    );
  }

  getCeremonyConsumptionsForDay(day: number): CeremonyConsumptionPlan[] {
    return this._ceremonyConsumptions()
      .filter(p => p.day === day)
      .sort((a, b) => b.priority - a.priority);
  }

  addShipment(data: Omit<Shipment, 'id' | 'status'>): {
    success: boolean;
    shipment?: Shipment;
    error?: string;
  } {
    const connection = this._connections().find(
      (c) => c.id === data.connectionId
    );
    if (!connection) {
      return { success: false, error: '未找到对应的运输连接' };
    }
    if (connection.fromId !== data.fromId || connection.toId !== data.toId) {
      return { success: false, error: '运输连接与起止节点不匹配' };
    }

    const hasPath = this.hasDirectConnection(data.fromId, data.toId);
    if (!hasPath) {
      return { success: false, error: '未连接的节点之间不能直接运输' };
    }

    const fromNode = this.allNodes().find((n) => n.id === data.fromId);
    if (!fromNode) {
      return { success: false, error: '起始节点不存在' };
    }
    const toNode = this.allNodes().find((n) => n.id === data.toId);
    if (!toNode) {
      return { success: false, error: '目标节点不存在' };
    }

    const fromConflict = this.checkShipmentConflict(
      data.fromId,
      data.startDay,
      data.arrivalDay
    );
    if (fromConflict) {
      return {
        success: false,
        error: `节点 [${fromNode.name}] 在第 ${data.startDay}-${data.arrivalDay} 日已被占用，同一节点不能同时承载两批冰`,
      };
    }

    const toConflict = this.checkShipmentConflict(
      data.toId,
      data.startDay,
      data.arrivalDay
    );
    if (toConflict) {
      return {
        success: false,
        error: `节点 [${toNode.name}] 在第 ${data.startDay}-${data.arrivalDay} 日已被占用，同一节点不能同时承载两批冰`,
      };
    }

    if (fromNode.type === 'cellar' || fromNode.type === 'jian') {
      if (fromNode.currentStock < data.amount) {
        return { success: false, error: '库存不足，无法发起运输' };
      }
    }

    const lossAmount = Math.floor(data.amount * connection.transitLossRate);
    const shipment: Shipment = {
      ...data,
      id: this.generateId(),
      lossAmount,
      receivedAmount: data.amount - lossAmount,
      status: 'pending',
      baseArrivalDay: data.arrivalDay,
      weatherDelayApplied: false,
    };

    this._shipments.update((prev) => [...prev, shipment]);

    if (fromNode.type === 'cellar') {
      this.updateCellar(fromNode.id, {
        currentStock: fromNode.currentStock - data.amount,
      });
    } else if (fromNode.type === 'jian') {
      this.updateJian(fromNode.id, {
        currentStock: fromNode.currentStock - data.amount,
      });
    }

    return { success: true, shipment };
  }

  removeShipment(id: string): void {
    const shipment = this._shipments().find((s) => s.id === id);
    if (shipment) {
      this.refundShipmentStock(shipment);
    }
    this._shipments.update((prev) => prev.filter((s) => s.id !== id));
  }

  addMultiStageShipment(data: {
    name: string;
    totalAmount: number;
    nodeIds: string[];
    startDay: number;
    transitStayDays?: number;
  }): {
    success: boolean;
    multiStageShipment?: MultiStageShipment;
    error?: string;
  } {
    if (data.nodeIds.length < 2) {
      return { success: false, error: '多段联运至少需要 2 个节点' };
    }
    if (data.totalAmount <= 0) {
      return { success: false, error: '运输量必须大于 0' };
    }

    const stayDays = data.transitStayDays ?? 1;
    const validation = this.validateMultiStageRoute(data.nodeIds, data.totalAmount, data.startDay, stayDays);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }

    const stages: ShipmentStage[] = [];
    const occupancies: TransitOccupancy[] = [];
    let currentDay = data.startDay;
    let currentAmount = data.totalAmount;

    for (let i = 0; i < data.nodeIds.length - 1; i++) {
      const fromId = data.nodeIds[i];
      const toId = data.nodeIds[i + 1];
      const connection = this._connections().find(
        (c) =>
          (c.fromId === fromId && c.toId === toId) ||
          (c.fromId === toId && c.toId === fromId)
      );
      if (!connection) {
        return { success: false, error: `节点 ${fromId} 到 ${toId} 之间没有连接` };
      }

      const lossAmount = Math.floor(currentAmount * connection.transitLossRate);
      const receivedAmount = currentAmount - lossAmount;
      const arrivalDay = currentDay + connection.travelDays;

      const occupancyId = this.generateId();
      const isLastStage = i === data.nodeIds.length - 2;

      if (!isLastStage) {
        const toNode = this.allNodes().find(n => n.id === toId);
        if (toNode && (toNode.type === 'transit' || toNode.type === 'jian' || toNode.type === 'cellar')) {
          occupancies.push({
            id: occupancyId,
            multiStageId: '',
            stageIndex: i,
            nodeId: toId,
            amount: receivedAmount,
            startDay: arrivalDay,
            endDay: arrivalDay + stayDays,
            status: 'active',
          });
        }
      }

      stages.push({
        id: this.generateId(),
        fromId,
        toId,
        connectionId: connection.id,
        startDay: currentDay,
        arrivalDay,
        amount: currentAmount,
        lossAmount,
        receivedAmount,
        status: 'pending',
        transitStayDays: stayDays,
        occupancyId: isLastStage ? undefined : occupancyId,
        baseArrivalDay: arrivalDay,
        weatherDelayApplied: false,
      });

      currentDay = arrivalDay + (isLastStage ? 0 : stayDays);
      currentAmount = receivedAmount;
    }

    const multiStageId = this.generateId();
    occupancies.forEach(o => o.multiStageId = multiStageId);

    const multiStageShipment: MultiStageShipment = {
      id: multiStageId,
      name: data.name,
      totalAmount: data.totalAmount,
      stages,
      status: 'pending',
      currentStageIndex: 0,
      createdAt: Date.now(),
      occupancies,
    };

    this._transitOccupancies.update(prev => [...prev, ...occupancies]);
    this._multiStageShipments.update((prev) => [...prev, multiStageShipment]);
    return { success: true, multiStageShipment };
  }

  private validateMultiStageRoute(
    nodeIds: string[],
    totalAmount: number,
    startDay: number,
    transitStayDays: number = 1
  ): { success: boolean; error?: string } {
    let currentDay = startDay;
    let currentAmount = totalAmount;

    for (let i = 0; i < nodeIds.length - 1; i++) {
      const fromId = nodeIds[i];
      const toId = nodeIds[i + 1];
      const fromNode = this.allNodes().find((n) => n.id === fromId);
      const toNode = this.allNodes().find((n) => n.id === toId);

      if (!fromNode || !toNode) {
        return { success: false, error: '节点不存在' };
      }

      const connection = this._connections().find(
        (c) =>
          (c.fromId === fromId && c.toId === toId) ||
          (c.fromId === toId && c.toId === fromId)
      );
      if (!connection) {
        return {
          success: false,
          error: `路线断开：节点 [${fromNode.name}] 到 [${toNode.name}] 之间没有运输连接`,
        };
      }

      const arrivalDay = currentDay + connection.travelDays;
      const isLastStage = i === nodeIds.length - 2;

      if (i === 0) {
        if (fromNode.type === 'cellar' || fromNode.type === 'jian' || fromNode.type === 'transit') {
          if (fromNode.currentStock < currentAmount) {
            return {
              success: false,
              error: `节点 [${fromNode.name}] 库存不足，当前库存 ${fromNode.currentStock}，需要 ${currentAmount}`,
            };
          }
        }
      }

      const fromConflict = this.checkShipmentConflict(fromId, currentDay, arrivalDay);
      if (fromConflict) {
        return {
          success: false,
          error: `并发超限：节点 [${fromNode.name}] 在第 ${currentDay}-${arrivalDay} 日并发运输数已达上限，无法安排运输`,
        };
      }

      const toConflict = this.checkShipmentConflict(toId, currentDay, arrivalDay);
      if (toConflict) {
        return {
          success: false,
          error: `并发超限：节点 [${toNode.name}] 在第 ${currentDay}-${arrivalDay} 日并发运输数已达上限，无法安排运输`,
        };
      }

      const receivedAmount = currentAmount - Math.floor(currentAmount * connection.transitLossRate);

      if (toNode.type === 'cellar' || toNode.type === 'jian' || toNode.type === 'transit') {
        const occupancyEndDay = isLastStage ? arrivalDay : arrivalDay + transitStayDays;
        for (let d = arrivalDay; d <= occupancyEndDay; d++) {
          const availableCapacity = this.getAvailableCapacityAtNode(toId, d);
          if (availableCapacity < receivedAmount) {
            const occupied = this.getTotalOccupiedAmountAtNode(toId, d);
            return {
              success: false,
              error: `中转容量不足：节点 [${toNode.name}] 在第 ${d} 日容量不足，已占用 ${occupied}，当前库存 ${toNode.currentStock}，总容量 ${toNode.maxCapacity}，需要 ${receivedAmount}`,
            };
          }
        }
      }

      if (!isLastStage) {
        const nextToId = nodeIds[i + 2];
        const nextConnection = this._connections().find(
          (c) =>
            (c.fromId === toId && c.toId === nextToId) ||
            (c.fromId === nextToId && c.toId === toId)
        );
        if (!nextConnection) {
          const nextToNode = this.allNodes().find((n) => n.id === nextToId);
          return {
            success: false,
            error: `后续路线断开：节点 [${toNode.name}] 到 [${nextToNode?.name || nextToId}] 之间没有连接，无法继续后续运输`,
          };
        }

        const nextStartDay = arrivalDay + transitStayDays;
        const nextArrivalDay = nextStartDay + nextConnection.travelDays;
        const nextFromConflict = this.checkShipmentConflict(toId, nextStartDay, nextArrivalDay);
        if (nextFromConflict) {
          return {
            success: false,
            error: `并发超限：中转节点 [${toNode.name}] 在第 ${nextStartDay}-${nextArrivalDay} 日并发超限，无法启运下一段`,
          };
        }

        const nextToNode = this.allNodes().find((n) => n.id === nextToId);
        if (nextToNode && (nextToNode.type === 'cellar' || nextToNode.type === 'jian' || nextToNode.type === 'transit')) {
          const nextReceivedAmount = receivedAmount - Math.floor(receivedAmount * nextConnection.transitLossRate);
          const nextAvailableCapacity = this.getAvailableCapacityAtNode(nextToId, nextArrivalDay);
          if (nextAvailableCapacity < nextReceivedAmount) {
            return {
              success: false,
              error: `后续节点无法接收：节点 [${nextToNode.name}] 在第 ${nextArrivalDay} 日容量不足，无法接收 ${nextReceivedAmount} 单位冰`,
            };
          }
        }
      }

      currentDay = arrivalDay + (isLastStage ? 0 : transitStayDays);
      currentAmount = receivedAmount;
    }

    return { success: true };
  }

  removeMultiStageShipment(id: string): void {
    const multiStage = this._multiStageShipments().find((m) => m.id === id);
    if (!multiStage) return;

    for (const stage of multiStage.stages) {
      if (stage.status === 'pending') {
        const fromNode = this.allNodes().find((n) => n.id === stage.fromId);
        if (fromNode && (fromNode.type === 'cellar' || fromNode.type === 'jian' || fromNode.type === 'transit')) {
          const updateFn =
            fromNode.type === 'cellar'
              ? this.updateCellar.bind(this)
              : fromNode.type === 'jian'
              ? this.updateJian.bind(this)
              : this.updateTransitNode.bind(this);
          updateFn(fromNode.id, {
            currentStock: Math.min(fromNode.maxCapacity, fromNode.currentStock + stage.amount),
          });
        }
      }
    }

    this._transitOccupancies.update(prev =>
      prev.filter(o => o.multiStageId !== id)
    );

    this._shipments.update((prev) => prev.filter((s) => s.multiStageId !== id));
    this._multiStageShipments.update((prev) => prev.filter((m) => m.id !== id));
  }

  private _removeMultiStageShipmentsForNode(nodeId: string): void {
    const relatedMultiStages = this._multiStageShipments().filter((m) =>
      m.stages.some((s) => s.fromId === nodeId || s.toId === nodeId)
    );
    for (const multiStage of relatedMultiStages) {
      this.removeMultiStageShipment(multiStage.id);
    }
  }

  private processMultiStageShipments(day: number, log: DailyLog): void {
    for (const multiStage of this._multiStageShipments()) {
      if (multiStage.status === 'completed' || multiStage.status === 'cancelled' || multiStage.status === 'failed') {
        continue;
      }

      const currentStage = multiStage.stages[multiStage.currentStageIndex];
      if (!currentStage) continue;

      const runtimeCheck = this.checkRuntimeAvailability(multiStage, currentStage, day);
      if (!runtimeCheck.success) {
        this.failMultiStageShipment(multiStage, runtimeCheck.error!, log);
        return;
      }

      if (currentStage.status === 'pending' && currentStage.startDay === day) {
        const startResult = this.startMultiStageStage(multiStage, currentStage, day, log);
        if (!startResult.success) {
          this.failMultiStageShipment(multiStage, startResult.error!, log);
          return;
        }
      }

      if (currentStage.status === 'in_transit' && currentStage.arrivalDay === day) {
        const arriveResult = this.arriveMultiStageStage(multiStage, currentStage, day, log);
        if (!arriveResult.success) {
          this.failMultiStageShipment(multiStage, arriveResult.error!, log);
          return;
        }
      }

      this.updateTransitOccupancyStatus(multiStage, day, log);
    }
  }

  private checkRuntimeAvailability(
    multiStage: MultiStageShipment,
    currentStage: ShipmentStage,
    day: number
  ): { success: boolean; error?: string } {
    const connection = this._connections().find(
      (c) =>
        (c.fromId === currentStage.fromId && c.toId === currentStage.toId) ||
        (c.fromId === currentStage.toId && c.toId === currentStage.fromId)
    );
    if (!connection) {
      const fromNode = this.allNodes().find((n) => n.id === currentStage.fromId);
      const toNode = this.allNodes().find((n) => n.id === currentStage.toId);
      return {
        success: false,
        error: `路线断开：节点 [${fromNode?.name || currentStage.fromId}] 到 [${toNode?.name || currentStage.toId}] 的运输连接已被删除，无法继续运输`,
      };
    }

    if (currentStage.status === 'pending' && currentStage.startDay >= day) {
      const isLastStage = multiStage.currentStageIndex === multiStage.stages.length - 1;
      if (!isLastStage) {
        const nextStage = multiStage.stages[multiStage.currentStageIndex + 1];
        const nextConnection = this._connections().find(
          (c) =>
            (c.fromId === nextStage.fromId && c.toId === nextStage.toId) ||
            (c.fromId === nextStage.toId && c.toId === nextStage.fromId)
        );
        if (!nextConnection) {
          const fromNode = this.allNodes().find((n) => n.id === nextStage.fromId);
          const toNode = this.allNodes().find((n) => n.id === nextStage.toId);
          return {
            success: false,
            error: `后续路线断开：节点 [${fromNode?.name || nextStage.fromId}] 到 [${toNode?.name || nextStage.toId}] 的运输连接已不存在，无法完成后续运输`,
          };
        }

        const nextToNode = this.allNodes().find((n) => n.id === nextStage.toId);
        if (nextToNode && (nextToNode.type === 'cellar' || nextToNode.type === 'jian' || nextToNode.type === 'transit')) {
          const availableCapacity = this.getAvailableCapacityAtNode(nextToNode.id, nextStage.arrivalDay);
          if (availableCapacity < nextStage.receivedAmount) {
            return {
              success: false,
              error: `后续节点无法接收：节点 [${nextToNode.name}] 在第 ${nextStage.arrivalDay} 日容量不足，无法接收 ${nextStage.receivedAmount} 单位冰`,
            };
          }
        }
      }
    }

    return { success: true };
  }

  private updateTransitOccupancyStatus(
    multiStage: MultiStageShipment,
    day: number,
    log: DailyLog
  ): void {
    for (const occupancy of multiStage.occupancies) {
      if (occupancy.status === 'active') {
        if (day > occupancy.endDay) {
          this._transitOccupancies.update(prev =>
            prev.map(o =>
              o.id === occupancy.id ? { ...o, status: 'ended' } : o
            )
          );
        }
        log.transitOccupancies.push({
          occupancyId: occupancy.id,
          nodeId: occupancy.nodeId,
          amount: occupancy.amount,
          status: occupancy.status,
        });
      }
    }
  }

  private startMultiStageStage(
    multiStage: MultiStageShipment,
    stage: ShipmentStage,
    day: number,
    log: DailyLog
  ): { success: boolean; error?: string } {
    const fromNode = this.allNodes().find((n) => n.id === stage.fromId);
    const toNode = this.allNodes().find((n) => n.id === stage.toId);
    if (!fromNode || !toNode) {
      return { success: false, error: '节点不存在' };
    }

    const fromConflict = this.checkShipmentConflict(stage.fromId, stage.startDay, stage.arrivalDay);
    const toConflict = this.checkShipmentConflict(stage.toId, stage.startDay, stage.arrivalDay);
    if (fromConflict || toConflict) {
      const conflictNode = fromConflict ? fromNode.name : toNode.name;
      return { success: false, error: `并发超限：节点 [${conflictNode}] 在第 ${stage.startDay}-${stage.arrivalDay} 日并发运输数已达上限，无法启运` };
    }

    if (stage.occupancyId && multiStage.currentStageIndex > 0) {
      const prevOccupancy = multiStage.occupancies.find(o => o.id === stage.occupancyId);
      if (prevOccupancy) {
        this._transitOccupancies.update(prev =>
          prev.map(o =>
            o.id === prevOccupancy.id ? { ...o, status: 'ended' } : o
          )
        );
      }
    }

    if (fromNode.type === 'cellar' || fromNode.type === 'jian' || fromNode.type === 'transit') {
      if (fromNode.currentStock < stage.amount) {
        return { success: false, error: `节点 [${fromNode.name}] 库存不足，当前库存 ${fromNode.currentStock}，需要 ${stage.amount}，无法启运` };
      }
      const updateFn =
        fromNode.type === 'cellar'
          ? this.updateCellar.bind(this)
          : fromNode.type === 'jian'
          ? this.updateJian.bind(this)
          : this.updateTransitNode.bind(this);
      updateFn(fromNode.id, {
        currentStock: fromNode.currentStock - stage.amount,
      });
    }

    const shipment: Shipment = {
      id: this.generateId(),
      fromId: stage.fromId,
      toId: stage.toId,
      amount: stage.amount,
      startDay: stage.startDay,
      arrivalDay: stage.arrivalDay,
      lossAmount: stage.lossAmount,
      receivedAmount: stage.receivedAmount,
      connectionId: stage.connectionId,
      status: 'in_transit',
      multiStageId: multiStage.id,
      stageIndex: multiStage.currentStageIndex,
      baseArrivalDay: stage.baseArrivalDay ?? stage.arrivalDay,
      weatherDelayApplied: false,
    };
    this._shipments.update((prev) => [...prev, shipment]);

    this._multiStageShipments.update((prev) =>
      prev.map((m) =>
        m.id === multiStage.id
          ? {
              ...m,
              status: 'in_progress',
              stages: m.stages.map((s, i) =>
                i === m.currentStageIndex ? { ...s, status: 'in_transit' } : s
              ),
            }
          : m
      )
    );

    log.multiStageUpdates.push({
      multiStageId: multiStage.id,
      stageIndex: multiStage.currentStageIndex,
      status: 'in_transit',
    });

    return { success: true };
  }

  private arriveMultiStageStage(
    multiStage: MultiStageShipment,
    stage: ShipmentStage,
    day: number,
    log: DailyLog
  ): { success: boolean; error?: string } {
    const toNode = this.allNodes().find((n) => n.id === stage.toId);
    if (!toNode) {
      return { success: false, error: '目标节点不存在' };
    }

    if (toNode.type === 'cellar' || toNode.type === 'jian' || toNode.type === 'transit') {
      const availableCapacity = this.getAvailableCapacityAtNode(toNode.id, day);
      if (availableCapacity < stage.receivedAmount) {
        const occupied = this.getTotalOccupiedAmountAtNode(toNode.id, day);
        return {
          success: false,
          error: `中转容量不足：节点 [${toNode.name}] 在第 ${day} 日容量不足，已占用 ${occupied}，当前库存 ${toNode.currentStock}，总容量 ${toNode.maxCapacity}，需要 ${stage.receivedAmount}`,
        };
      }
      const updateFn =
        toNode.type === 'cellar'
          ? this.updateCellar.bind(this)
          : toNode.type === 'jian'
          ? this.updateJian.bind(this)
          : this.updateTransitNode.bind(this);
      updateFn(toNode.id, {
        currentStock: toNode.currentStock + stage.receivedAmount,
      });
    }

    const isLastStage = multiStage.currentStageIndex === multiStage.stages.length - 1;

    if (stage.occupancyId && !isLastStage) {
      this._transitOccupancies.update(prev =>
        prev.map(o =>
          o.id === stage.occupancyId ? { ...o, status: 'active' } : o
        )
      );
    }

    this._shipments.update((prev) =>
      prev.map((s) =>
        s.multiStageId === multiStage.id && s.stageIndex === multiStage.currentStageIndex
          ? { ...s, status: 'delivered' }
          : s
      )
    );

    this._multiStageShipments.update((prev) =>
      prev.map((m) =>
        m.id === multiStage.id
          ? {
              ...m,
              status: isLastStage ? 'completed' : 'in_progress',
              currentStageIndex: isLastStage ? m.currentStageIndex : m.currentStageIndex + 1,
              stages: m.stages.map((s, i) =>
                i === m.currentStageIndex ? { ...s, status: 'delivered' } : s
              ),
            }
          : m
      )
    );

    log.multiStageUpdates.push({
      multiStageId: multiStage.id,
      stageIndex: multiStage.currentStageIndex,
      status: 'delivered',
    });

    log.deliveries.push({
      id: stage.id,
      fromId: stage.fromId,
      toId: stage.toId,
      amount: stage.amount,
      startDay: stage.startDay,
      arrivalDay: stage.arrivalDay,
      lossAmount: stage.lossAmount,
      receivedAmount: stage.receivedAmount,
      connectionId: stage.connectionId,
      status: 'delivered',
      multiStageId: multiStage.id,
      stageIndex: multiStage.currentStageIndex,
    });

    return { success: true };
  }

  private failMultiStageShipment(
    multiStage: MultiStageShipment,
    reason: string,
    log: DailyLog
  ): void {
    this._multiStageShipments.update((prev) =>
      prev.map((m) =>
        m.id === multiStage.id
          ? { ...m, status: 'failed', failureReason: reason }
          : m
      )
    );

    for (let i = multiStage.currentStageIndex; i >= 0; i--) {
      const stage = multiStage.stages[i];
      if (stage.status === 'in_transit' || stage.status === 'delivered') {
        const fromNode = this.allNodes().find((n) => n.id === stage.fromId);
        const toNode = this.allNodes().find((n) => n.id === stage.toId);

        if (stage.status === 'delivered' && toNode) {
          if (toNode.type === 'cellar' || toNode.type === 'jian' || toNode.type === 'transit') {
            const updateFn =
              toNode.type === 'cellar'
                ? this.updateCellar.bind(this)
                : toNode.type === 'jian'
                ? this.updateJian.bind(this)
                : this.updateTransitNode.bind(this);
            updateFn(toNode.id, {
              currentStock: Math.max(0, toNode.currentStock - stage.receivedAmount),
            });
          }
        }

        if (fromNode) {
          if (fromNode.type === 'cellar' || fromNode.type === 'jian' || fromNode.type === 'transit') {
            const updateFn =
              fromNode.type === 'cellar'
                ? this.updateCellar.bind(this)
                : fromNode.type === 'jian'
                ? this.updateJian.bind(this)
                : this.updateTransitNode.bind(this);
            updateFn(fromNode.id, {
              currentStock: Math.min(fromNode.maxCapacity, fromNode.currentStock + stage.amount),
            });
          }
        }
      }
    }

    this._transitOccupancies.update(prev =>
      prev.map(o =>
        o.multiStageId === multiStage.id && o.status === 'active'
          ? { ...o, status: 'cancelled' }
          : o
      )
    );

    this._shipments.update((prev) =>
      prev.map((s) =>
        s.multiStageId === multiStage.id
          ? { ...s, status: s.status === 'delivered' ? 'cancelled' : s.status }
          : s
      )
    );

    log.errors.push(`多段联运 [${multiStage.name}] 失败：${reason}`);
    this._state.update((s) => ({
      ...s,
      isPaused: true,
      pauseReason: reason,
      failedMultiStageId: multiStage.id,
    }));
    this.stopTimer();
  }

  private hasDirectConnection(fromId: string, toId: string): boolean {
    return this._connections().some(
      (c) =>
        (c.fromId === fromId && c.toId === toId) ||
        (c.fromId === toId && c.toId === fromId)
    );
  }

  private checkShipmentConflict(
    nodeId: string,
    startDay: number,
    arrivalDay: number
  ): boolean {
    const node = this.allNodes().find((n) => n.id === nodeId);
    if (!node) return true;

    const maxConcurrent =
      node.type === 'transit' ? node.maxConcurrentShipments : 1;

    const overlapping = this._shipments().filter((s) => {
      if (s.status === 'cancelled' || s.status === 'delivered') return false;
      if (s.fromId !== nodeId && s.toId !== nodeId) return false;

      const sStart = s.startDay;
      const sEnd = s.arrivalDay;
      const overlap = startDay <= sEnd && arrivalDay >= sStart;
      return overlap;
    });

    return overlapping.length >= maxConcurrent;
  }

  checkOverAllocation(): { hasRisk: boolean; reason: string | null } {
    const totalDays = this._state().totalDays;

    for (let day = 1; day <= totalDays; day++) {
      const dayConsumptions = this._consumptionPlans().filter(
        (p) => p.day === day
      );
      const climate = this.getClimateForDay(day);
      const impact = this.calculateClimateImpact(climate);
      
      for (const plan of dayConsumptions) {
        const jian = this._jians().find((j) => j.id === plan.jianId);
        if (!jian) continue;

        const adjustedDemand = Math.floor(plan.amount * impact.demandMultiplier);
        const simulatedResult = this.simulateJianStockAtDay(jian.id, day);
        if (simulatedResult < adjustedDemand) {
          return {
            hasRisk: true,
            reason: `第 ${day} 天 [${jian.name}] 气候影响后需求 ${adjustedDemand} 单位冰，但预测库存仅有 ${simulatedResult.toFixed(0)} 单位，存在超配风险！`,
          };
        }
      }
      
      if (climate?.hasHeatWarning && climate.heatWarningLevel === 'red') {
        return {
          hasRisk: true,
          reason: `第 ${day} 天发布红色高温预警（${climate.temperature}°C），存在损耗失控风险，请注意调整计划！`,
        };
      }
    }

    return { hasRisk: false, reason: null };
  }

  checkAllCeremoniesFeasibility(): { feasible: boolean; issues: string[] } {
    const allIssues: string[] = [];

    for (const ceremony of this._ceremonies()) {
      if (ceremony.status === 'cancelled') continue;

      const result = this.checkCeremonyFeasibility({
        name: ceremony.name,
        type: ceremony.type,
        level: ceremony.level,
        startDay: ceremony.startDay,
        durationDays: ceremony.durationDays,
        supplyNodes: ceremony.supplyNodes,
        description: ceremony.description,
      });

      if (!result.feasible) {
        allIssues.push(`活动「${ceremony.name}」：${result.issues.join('；')}`);
      }
    }

    return { feasible: allIssues.length === 0, issues: allIssues };
  }

  private simulateJianStockAtDay(jianId: string, targetDay: number): number {
    const jian = this._jians().find((j) => j.id === jianId);
    if (!jian) return 0;

    let stock = jian.currentStock;
    const consumptionByDay = new Map<number, number>();
    for (const p of this._consumptionPlans()) {
      if (p.jianId === jianId) {
        const climate = this.getClimateForDay(p.day);
        const impact = this.calculateClimateImpact(climate);
        const adjustedAmount = Math.floor(p.amount * impact.demandMultiplier);
        consumptionByDay.set(p.day, (consumptionByDay.get(p.day) || 0) + adjustedAmount);
      }
    }

    for (const p of this._ceremonyConsumptions()) {
      if (p.jianId === jianId) {
        const climate = this.getClimateForDay(p.day);
        const impact = this.calculateClimateImpact(climate);
        const adjustedAmount = Math.floor(p.amount * impact.demandMultiplier);
        consumptionByDay.set(p.day, (consumptionByDay.get(p.day) || 0) + adjustedAmount);
      }
    }

    const incomingShipments = this._shipments()
      .filter((s) => s.toId === jianId && s.status !== 'cancelled')
      .sort((a, b) => a.arrivalDay - b.arrivalDay);

    for (let day = 1; day <= targetDay; day++) {
      const climate = this.getClimateForDay(day);
      const impact = this.calculateClimateImpact(climate);
      const loss = Math.floor(stock * jian.dailyLossRate * impact.lossRateMultiplier);
      stock = Math.max(0, stock - loss);

      for (const shipment of incomingShipments) {
        if (shipment.arrivalDay === day) {
          stock += shipment.receivedAmount;
        }
      }

      const dayConsumption = consumptionByDay.get(day) || 0;
      stock = Math.max(0, stock - dayConsumption);
    }

    return stock;
  }

  resetState(): void {
    this.stop();
    this._state.update((s) => ({
      ...s,
      currentDay: 0,
      isRunning: false,
      isPaused: false,
      isReplaying: false,
      logs: [],
      originalLogs: null,
      warnings: [],
      isOverAllocated: false,
      overAllocationReason: null,
      pauseReason: null,
      failedMultiStageId: null,
      replayConsistencyError: null,
      replayConsistencyPassed: false,
      heatWarningPause: false,
      heatWarningReason: null,
      ceremonyPause: false,
      ceremonyPauseReason: null,
      affectedCeremonies: [],
      ceremonyDeficit: 0,
    }));
    this._shipments.update((prev) =>
      prev.map((s) => ({ ...s, status: 'pending' as const }))
    );
    this._multiStageShipments.update((prev) =>
      prev.map((m) => ({
        ...m,
        status: 'pending' as const,
        currentStageIndex: 0,
        stages: m.stages.map((s) => ({ ...s, status: 'pending' as const })),
        occupancies: [],
      }))
    );
    this._transitOccupancies.set([]);
    this._ceremonies.update(prev =>
      prev.map(c => ({ ...c, status: 'pending' as const, failureReason: undefined }))
    );
  }

  start(): void {
    if (this._state().isRunning && !this._state().isPaused) return;

    const overAllocCheck = this.checkOverAllocation();
    if (overAllocCheck.hasRisk) {
      this._state.update((s) => ({
        ...s,
        isOverAllocated: true,
        overAllocationReason: overAllocCheck.reason,
        isPaused: true,
      }));
      return;
    }

    const ceremonyCheck = this.checkAllCeremoniesFeasibility();
    if (!ceremonyCheck.feasible) {
      this._state.update((s) => ({
        ...s,
        ceremonyPause: true,
        ceremonyPauseReason: ceremonyCheck.issues[0],
        pauseReason: ceremonyCheck.issues[0],
        isPaused: true,
      }));
      return;
    }

    if (this._state().logs.length === 0) {
      const initialLog = this.createDailyLog(0);
      this._state.update((s) => ({
        ...s,
        logs: [initialLog],
        currentDay: 0,
      }));
    }

    this._state.update((s) => ({
      ...s,
      isRunning: true,
      isPaused: false,
      isOverAllocated: false,
      overAllocationReason: null,
      heatWarningPause: false,
      heatWarningReason: null,
      ceremonyPause: false,
      ceremonyPauseReason: null,
      affectedCeremonies: [],
      ceremonyDeficit: 0,
    }));

    this.startTimer();
  }

  pause(): void {
    this._state.update((s) => ({ ...s, isPaused: true }));
    this.stopTimer();
  }

  resume(): void {
    if (!this._state().isRunning) return;
    this._state.update((s) => ({ ...s, isPaused: false }));
    this.startTimer();
  }

  stop(): void {
    this.stopTimer();
    this._state.update((s) => ({ ...s, isRunning: false, isPaused: false }));
  }

  setSpeed(multiplier: number): void {
    this._state.update((s) => ({ ...s, speedMultiplier: multiplier }));
    if (this._state().isRunning && !this._state().isPaused) {
      this.stopTimer();
      this.startTimer();
    }
  }

  setTotalDays(days: number): void {
    this._state.update((s) => ({ ...s, totalDays: days }));
  }

  private startTimer(): void {
    this.stopTimer();
    const baseInterval = 1000;
    const interval = baseInterval / this._state().speedMultiplier;

    this.timerInterval = setInterval(() => {
      this.advanceOneDay();
    }, interval);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private advanceOneDay(): void {
    const currentState = this._state();
    if (currentState.currentDay >= currentState.totalDays) {
      this.stop();
      return;
    }

    const nextDay = currentState.currentDay + 1;
    const log = this.createDailyLog(nextDay);

    const climate = this.getClimateForDay(nextDay);
    if (climate?.hasHeatWarning && climate.heatWarningLevel === 'red') {
      const heatWarningReason = `第 ${nextDay} 天发布红色高温预警，气温 ${climate.temperature}°C，损耗失控风险极高，调度已自动暂停！`;
      log.warnings.push(heatWarningReason);
      log.errors.push(heatWarningReason);
      this._state.update((s) => ({
        ...s,
        currentDay: nextDay,
        logs: [...s.logs, log],
        isPaused: true,
        heatWarningPause: true,
        heatWarningReason,
        pauseReason: heatWarningReason,
        warnings: [...s.warnings, heatWarningReason].filter(
          (v, i, a) => a.indexOf(v) === i
        ),
      }));
      this.stopTimer();
      return;
    }

    if (climate?.hasHeatWarning) {
      const levelMap = { yellow: '黄色', orange: '橙色', red: '红色' };
      log.warnings.push(
        `第 ${nextDay} 天发布${levelMap[climate.heatWarningLevel || 'yellow']}高温预警，气温 ${climate.temperature}°C，请注意损耗增加`
      );
    }

    this.processDailyLoss(nextDay, log);
    this.processShipmentTransits(nextDay, log);
    this.processWeatherDelays(nextDay, log);
    this.processMultiStageShipments(nextDay, log);
    this.processDeliveries(nextDay, log);
    this.processCeremonyStatusUpdates(nextDay, log);
    this.processConsumptions(nextDay, log);
    this.processCeremonyConsumptions(nextDay, log);

    log.logHash = this.generateLogHash(log);

    this._state.update((s) => ({
      ...s,
      currentDay: nextDay,
      logs: [...s.logs, log],
      warnings: [...s.warnings, ...log.warnings].filter(
        (v, i, a) => a.indexOf(v) === i
      ),
    }));

    if (nextDay >= currentState.totalDays) {
      this.stop();
      this._state.update((s) => ({
        ...s,
        originalLogs: JSON.parse(JSON.stringify(s.logs)),
      }));
    }
  }

  private createDailyLog(day: number): DailyLog {
    const cellarStocks: { [id: string]: number } = {};
    for (const c of this._cellars()) cellarStocks[c.id] = c.currentStock;

    const jianStocks: { [id: string]: number } = {};
    for (const j of this._jians()) jianStocks[j.id] = j.currentStock;

    const transitStocks: { [id: string]: number } = {};
    for (const t of this._transitNodes()) transitStocks[t.id] = t.currentStock;

    const climate = this.getClimateForDay(day);
    const climateImpact = this.calculateClimateImpact(climate);

    return {
      day,
      climate: climate ? { ...climate } : undefined,
      climateImpact: { ...climateImpact },
      cellarStocks,
      jianStocks,
      transitStocks,
      activeShipments: JSON.parse(JSON.stringify(this._shipments().filter(s => s.status === 'in_transit' || s.status === 'pending'))),
      deliveries: [],
      consumptions: [],
      dailyLosses: [],
      warnings: [],
      errors: [],
      multiStageUpdates: [],
      transitOccupancies: [],
      weatherDelays: [],
      ceremonyUpdates: [],
      ceremonyConsumptions: [],
      logHash: '',
    };
  }

  private processDailyLoss(day: number, log: DailyLog): void {
    const impact = log.climateImpact || { lossRateMultiplier: 1, travelTimeMultiplier: 1, capacityMultiplier: 1, demandMultiplier: 1 };

    for (const cellar of this._cellars()) {
      const baseLoss = cellar.currentStock * cellar.dailyLossRate;
      const adjustedLoss = baseLoss * impact.lossRateMultiplier;
      const loss = Math.floor(adjustedLoss);
      const climateBonus = loss - Math.floor(baseLoss);
      if (loss > 0) {
        this.updateCellar(cellar.id, {
          currentStock: Math.max(0, cellar.currentStock - loss),
        });
        log.dailyLosses.push({ nodeId: cellar.id, amount: loss, climateBonus });
        log.cellarStocks[cellar.id] = Math.max(0, cellar.currentStock - loss);
      }
    }

    for (const jian of this._jians()) {
      const baseLoss = jian.currentStock * jian.dailyLossRate;
      const adjustedLoss = baseLoss * impact.lossRateMultiplier;
      const loss = Math.floor(adjustedLoss);
      const climateBonus = loss - Math.floor(baseLoss);
      if (loss > 0) {
        this.updateJian(jian.id, {
          currentStock: Math.max(0, jian.currentStock - loss),
        });
        log.dailyLosses.push({ nodeId: jian.id, amount: loss, climateBonus });
        log.jianStocks[jian.id] = Math.max(0, jian.currentStock - loss);
      }
    }

    for (const transit of this._transitNodes()) {
      const baseLoss = transit.currentStock * transit.dailyLossRate;
      const adjustedLoss = baseLoss * impact.lossRateMultiplier;
      const loss = Math.floor(adjustedLoss);
      const climateBonus = loss - Math.floor(baseLoss);
      if (loss > 0) {
        this.updateTransitNode(transit.id, {
          currentStock: Math.max(0, transit.currentStock - loss),
        });
        log.dailyLosses.push({ nodeId: transit.id, amount: loss, climateBonus });
        log.transitStocks[transit.id] = Math.max(0, transit.currentStock - loss);
      }
    }
  }

  private processWeatherDelays(day: number, log: DailyLog): void {
    const impact = log.climateImpact || { lossRateMultiplier: 1, travelTimeMultiplier: 1, capacityMultiplier: 1, demandMultiplier: 1 };
    if (impact.travelTimeMultiplier <= 1) return;

    const weatherMap: Record<string, string> = {
      rainy: '雨天',
      snowy: '雪天',
      hot_wave: '热浪',
      freezing: '严寒',
    };
    const weatherDesc = log.climate ? weatherMap[log.climate.weather] || '恶劣天气' : '恶劣天气';

    const inTransitShipments = this._shipments().filter(
      (s) => s.status === 'in_transit' && !s.weatherDelayApplied
    );

    for (const shipment of inTransitShipments) {
      const baseArrival = shipment.baseArrivalDay ?? shipment.arrivalDay;
      const travelDays = baseArrival - shipment.startDay;
      const delayDays = Math.ceil(travelDays * (impact.travelTimeMultiplier - 1));
      if (delayDays > 0) {
        const newArrivalDay = baseArrival + delayDays;
        this._shipments.update((prev) =>
          prev.map((s) =>
            s.id === shipment.id
              ? {
                  ...s,
                  arrivalDay: newArrivalDay,
                  weatherDelayApplied: true,
                  lossAmount: Math.floor(s.amount * (s.lossAmount / s.amount + impact.lossRateMultiplier * 0.05)),
                }
              : s
          )
        );

        if (shipment.multiStageId && shipment.stageIndex !== undefined) {
          this._delayMultiStageShipment(shipment.multiStageId, shipment.stageIndex, delayDays, log);
        }

        log.weatherDelays.push({
          shipmentId: shipment.id,
          delayDays,
          reason: `${weatherDesc}导致运输延误 ${delayDays} 天`,
        });
        log.warnings.push(
          `第 ${day} 天: 运输 [${shipment.id}] 因${weatherDesc}延误 ${delayDays} 天，预计第 ${newArrivalDay} 天到达`
        );
      } else {
        this._shipments.update((prev) =>
          prev.map((s) =>
            s.id === shipment.id ? { ...s, weatherDelayApplied: true } : s
          )
        );
      }
    }
  }

  private _delayMultiStageShipment(multiStageId: string, stageIndex: number, delayDays: number, log: DailyLog): void {
    this._multiStageShipments.update((prev) =>
      prev.map((m) => {
        if (m.id !== multiStageId) return m;
        const updatedStages = m.stages.map((s, i) => {
          if (i < stageIndex) return s;
          if (i === stageIndex) {
            return {
              ...s,
              arrivalDay: (s.baseArrivalDay ?? s.arrivalDay) + delayDays,
              weatherDelayApplied: true,
            };
          }
          return {
            ...s,
            startDay: s.startDay + delayDays,
            arrivalDay: s.arrivalDay + delayDays,
            baseArrivalDay: (s.baseArrivalDay ?? s.arrivalDay) + delayDays,
          };
        });
        const updatedOccupancies = m.occupancies?.map((o) => ({
          ...o,
          startDay: o.startDay + delayDays,
          endDay: o.endDay + delayDays,
        }));
        return {
          ...m,
          stages: updatedStages,
          occupancies: updatedOccupancies,
        };
      })
    );

    this._transitOccupancies.update((prev) =>
      prev.map((o) => {
        if (o.multiStageId !== multiStageId) return o;
        if (o.stageIndex < stageIndex) return o;
        return {
          ...o,
          startDay: o.startDay + delayDays,
          endDay: o.endDay + delayDays,
        };
      })
    );

    log.multiStageUpdates.push({
      multiStageId,
      stageIndex,
      status: 'delayed',
      delayDays,
    });
  }

  private processShipmentTransits(day: number, log: DailyLog): void {
    const pendingShipments = this._shipments().filter(
      (s) => s.status === 'pending' && s.startDay <= day
    );
    for (const shipment of pendingShipments) {
      const fromConflict = this.checkShipmentConflict(
        shipment.fromId,
        shipment.startDay,
        shipment.arrivalDay
      );
      const toConflict = this.checkShipmentConflict(
        shipment.toId,
        shipment.startDay,
        shipment.arrivalDay
      );
      if (!fromConflict && !toConflict) {
        this._shipments.update((prev) =>
          prev.map((s) =>
            s.id === shipment.id ? { ...s, status: 'in_transit' } : s
          )
        );
      } else {
        const conflictNode = fromConflict
          ? this.allNodes().find((n) => n.id === shipment.fromId)?.name
          : this.allNodes().find((n) => n.id === shipment.toId)?.name;
        log.warnings.push(
          `第 ${day} 天: 节点 [${conflictNode || '未知'}] 冲突，运输计划 [${shipment.id}] 延迟启动`
        );
      }
    }
  }

  private processDeliveries(day: number, log: DailyLog): void {
    const arrivingShipments = this._shipments().filter(
      (s) => s.arrivalDay === day && s.status !== 'cancelled' && !s.multiStageId
    );
    for (const shipment of arrivingShipments) {
      const toNode = this.allNodes().find((n) => n.id === shipment.toId);
      if (!toNode) {
        log.errors.push(`运输目标节点不存在: ${shipment.toId}`);
        continue;
      }

      if (toNode.type === 'cellar') {
        const newStock = Math.min(
          toNode.maxCapacity,
          toNode.currentStock + shipment.receivedAmount
        );
        this.updateCellar(toNode.id, { currentStock: newStock });
        log.cellarStocks[toNode.id] = newStock;
      } else if (toNode.type === 'jian') {
        const newStock = Math.min(
          toNode.maxCapacity,
          toNode.currentStock + shipment.receivedAmount
        );
        this.updateJian(toNode.id, { currentStock: newStock });
        log.jianStocks[toNode.id] = newStock;
      } else if (toNode.type === 'transit') {
        const newStock = Math.min(
          toNode.maxCapacity,
          toNode.currentStock + shipment.receivedAmount
        );
        this.updateTransitNode(toNode.id, { currentStock: newStock });
        log.transitStocks[toNode.id] = newStock;
      }

      this._shipments.update((prev) =>
        prev.map((s) =>
          s.id === shipment.id ? { ...s, status: 'delivered' } : s
        )
      );
      log.deliveries.push({ ...shipment, status: 'delivered' });
    }
  }

  private processConsumptions(day: number, log: DailyLog): void {
    const impact = log.climateImpact || { lossRateMultiplier: 1, travelTimeMultiplier: 1, capacityMultiplier: 1, demandMultiplier: 1 };
    const todayPlans = this._consumptionPlans().filter((p) => p.day === day);
    for (const plan of todayPlans) {
      const jian = this._jians().find((j) => j.id === plan.jianId);
      if (!jian) {
        log.consumptions.push({
          jianId: plan.jianId,
          amount: plan.amount,
          success: false,
          reason: '冰鉴不存在',
        });
        continue;
      }

      const adjustedAmount = Math.floor(plan.amount * impact.demandMultiplier);

      if (jian.currentStock < adjustedAmount) {
        log.consumptions.push({
          jianId: plan.jianId,
          amount: adjustedAmount,
          success: false,
          reason: `库存不足，无法取冰（气候影响后需求调整为 ${adjustedAmount}）`,
        });
        log.errors.push(
          `第 ${day} 天: [${jian.name}] 库存不足，计划取用 ${plan.amount}，气候影响后需求 ${adjustedAmount}，实际库存 ${jian.currentStock}`
        );
        this._state.update((s) => ({
          ...s,
          isOverAllocated: true,
          overAllocationReason: `第 ${day} 天 [${jian.name}] 库存不足！气候导致需求增加，计划无法按时完成`,
          isPaused: true,
        }));
        this.stopTimer();
      } else {
        this.updateJian(jian.id, {
          currentStock: jian.currentStock - adjustedAmount,
        });
        log.jianStocks[jian.id] = jian.currentStock - adjustedAmount;
        log.consumptions.push({
          jianId: plan.jianId,
          amount: adjustedAmount,
          success: true,
        });
        if (impact.demandMultiplier !== 1) {
          log.warnings.push(
            `第 ${day} 天: [${jian.name}] 因气候原因需求从 ${plan.amount} 调整为 ${adjustedAmount}`
          );
        }
      }
    }
  }

  private processCeremonyStatusUpdates(day: number, log: DailyLog): void {
    for (const ceremony of this._ceremonies()) {
      if (ceremony.status === 'cancelled' || ceremony.status === 'failed' || ceremony.status === 'completed') {
        continue;
      }

      const isStartDay = day === ceremony.startDay;
      const isEndDay = day === ceremony.startDay + ceremony.durationDays - 1;

      if (isStartDay && ceremony.status === 'pending') {
        this._ceremonies.update(prev =>
          prev.map(c => c.id === ceremony.id ? { ...c, status: 'active' } : c)
        );
        log.ceremonyUpdates.push({
          ceremonyId: ceremony.id,
          ceremonyName: ceremony.name,
          status: 'active',
        });
        log.warnings.push(`第 ${day} 天: 活动「${ceremony.name}」开始，启用保供优先级调度`);
      }

      if (isEndDay && ceremony.status === 'active') {
        this._ceremonies.update(prev =>
          prev.map(c => c.id === ceremony.id ? { ...c, status: 'completed' } : c)
        );
        log.ceremonyUpdates.push({
          ceremonyId: ceremony.id,
          ceremonyName: ceremony.name,
          status: 'completed',
        });
      }
    }
  }

  private processCeremonyConsumptions(day: number, log: DailyLog): void {
    const ceremonyPlans = this.getCeremonyConsumptionsForDay(day);
    if (ceremonyPlans.length === 0) return;

    const impact = log.climateImpact || { lossRateMultiplier: 1, travelTimeMultiplier: 1, capacityMultiplier: 1, demandMultiplier: 1 };
    const levelNameMap: Record<CeremonyLevel, string> = {
      grand: '大祀',
      major: '中祀',
      minor: '小祀',
      ordinary: '常例',
    };

    let totalDeficit = 0;
    const affectedCeremonyIds: string[] = [];
    const affectedCeremonyNames: string[] = [];

    for (const plan of ceremonyPlans) {
      const jian = this._jians().find(j => j.id === plan.jianId);
      if (!jian) {
        log.ceremonyConsumptions.push({
          ceremonyId: plan.ceremonyId,
          ceremonyName: plan.ceremonyName,
          jianId: plan.jianId,
          amount: plan.amount,
          success: false,
          reason: '冰鉴不存在',
        });
        continue;
      }

      const adjustedAmount = Math.floor(plan.amount * impact.demandMultiplier);

      if (jian.currentStock < adjustedAmount) {
        const deficit = adjustedAmount - jian.currentStock;
        totalDeficit += deficit;

        if (!affectedCeremonyIds.includes(plan.ceremonyId)) {
          affectedCeremonyIds.push(plan.ceremonyId);
          affectedCeremonyNames.push(plan.ceremonyName);
        }

        log.ceremonyConsumptions.push({
          ceremonyId: plan.ceremonyId,
          ceremonyName: plan.ceremonyName,
          jianId: plan.jianId,
          amount: adjustedAmount,
          success: false,
          reason: `库存不足，${levelNameMap[plan.level]}活动保供缺口 ${deficit} 单位`,
        });

        log.errors.push(
          `第 ${day} 天: 活动「${plan.ceremonyName}」[${jian.name}] 保供不足，需求 ${adjustedAmount}，实际库存 ${jian.currentStock}，缺口 ${deficit}`
        );

        this._failCeremony(plan.ceremonyId, `第 ${day} 天 ${jian.name} 库存不足，缺口 ${deficit} 单位`, log);
      } else {
        this.updateJian(jian.id, {
          currentStock: jian.currentStock - adjustedAmount,
        });
        log.jianStocks[jian.id] = jian.currentStock - adjustedAmount;
        log.ceremonyConsumptions.push({
          ceremonyId: plan.ceremonyId,
          ceremonyName: plan.ceremonyName,
          jianId: plan.jianId,
          amount: adjustedAmount,
          success: true,
        });
      }
    }

    if (totalDeficit > 0) {
      const pauseReason = `活动保供中断：${affectedCeremonyNames.join('、')} 等 ${affectedCeremonyIds.length} 项活动无法按时保供，总缺口 ${totalDeficit} 单位冰`;
      this._state.update((s) => ({
        ...s,
        isPaused: true,
        ceremonyPause: true,
        ceremonyPauseReason: pauseReason,
        pauseReason: pauseReason,
        affectedCeremonies: affectedCeremonyIds,
        ceremonyDeficit: totalDeficit,
      }));
      this.stopTimer();
    }
  }

  private _failCeremony(ceremonyId: string, reason: string, log: DailyLog): void {
    const ceremony = this._ceremonies().find(c => c.id === ceremonyId);
    if (!ceremony || ceremony.status === 'failed' || ceremony.status === 'cancelled') return;

    this._ceremonies.update(prev =>
      prev.map(c => c.id === ceremonyId ? { ...c, status: 'failed', failureReason: reason } : c)
    );

    const existingUpdate = log.ceremonyUpdates.find(u => u.ceremonyId === ceremonyId);
    if (!existingUpdate) {
      log.ceremonyUpdates.push({
        ceremonyId,
        ceremonyName: ceremony.name,
        status: 'failed',
        failureReason: reason,
      });
    }
  }

  checkCeremonyFeasibility(ceremony: Omit<CeremonyEvent, 'id' | 'status'>): { feasible: boolean; issues: string[] } {
    const issues: string[] = [];
    const totalDays = this._state().totalDays;

    if (ceremony.startDay + ceremony.durationDays - 1 > totalDays) {
      issues.push(`活动结束日期（第 ${ceremony.startDay + ceremony.durationDays - 1} 天）超出调度周期（共 ${totalDays} 天）`);
    }

    for (const node of ceremony.supplyNodes) {
      const jian = this._jians().find(j => j.id === node.jianId);
      if (!jian) {
        issues.push(`保供节点 ${node.jianId} 不存在`);
        continue;
      }

      for (let day = ceremony.startDay; day < ceremony.startDay + ceremony.durationDays; day++) {
        const simulatedStock = this.simulateJianStockAtDay(jian.id, day);
        if (simulatedStock < node.minIceAmount) {
          issues.push(`第 ${day} 天 [${jian.name}] 预测库存 ${simulatedStock.toFixed(0)}，低于活动最低冰量 ${node.minIceAmount}`);
        }
      }
    }

    return { feasible: issues.length === 0, issues };
  }

  jumpToDay(targetDay: number): void {
    if (targetDay < 0 || targetDay > this._state().totalDays) return;

    this.reset();

    for (let i = 0; i < targetDay; i++) {
      this.advanceOneDay();
    }
  }

  reset(): void {
    this.stop();
    this._cellars.update((prev) =>
      prev.map((c) => ({ ...c, currentStock: c.maxCapacity }))
    );
    this._jians.update((prev) => prev.map((j) => ({ ...j, currentStock: 0 })));
    this._transitNodes.update((prev) =>
      prev.map((t) => ({ ...t, currentStock: 0 }))
    );
    this._shipments.update((prev) =>
      prev.map((s) => ({ ...s, status: 'pending' as const }))
    );
    this._multiStageShipments.update((prev) =>
      prev.map((m) => ({
        ...m,
        status: 'pending' as const,
        currentStageIndex: 0,
        stages: m.stages.map((s) => ({ ...s, status: 'pending' as const })),
        occupancies: m.occupancies.map(o => ({ ...o, status: 'active' as const })),
      }))
    );
    this._transitOccupancies.update(prev =>
      prev.map(o => ({ ...o, status: 'active' as const }))
    );
    this._ceremonies.update(prev =>
      prev.map(c => ({ ...c, status: 'pending' as const, failureReason: undefined }))
    );
    this._state.update((s) => ({
      ...s,
      currentDay: 0,
      isRunning: false,
      isPaused: false,
      isReplaying: false,
      logs: [],
      warnings: [],
      isOverAllocated: false,
      overAllocationReason: null,
      pauseReason: null,
      failedMultiStageId: null,
      replayConsistencyError: null,
      replayConsistencyPassed: false,
      heatWarningPause: false,
      heatWarningReason: null,
      ceremonyPause: false,
      ceremonyPauseReason: null,
      affectedCeremonies: [],
      ceremonyDeficit: 0,
    }));
  }

  startReplay(): void {
    if (!this._state().originalLogs) return;

    this.reset();
    this._state.update((s) => ({
      ...s,
      isReplaying: true,
      isRunning: true,
      logs: [],
      replayConsistencyError: null,
      replayConsistencyPassed: false,
    }));

    const originalLogs = this._state().originalLogs!;
    let replayIndex = 0;
    let consistencyError: string | null = null;

    this.stopTimer();
    const baseInterval = 1000;
    const interval = baseInterval / this._state().speedMultiplier;

    this.timerInterval = setInterval(() => {
      if (replayIndex >= originalLogs.length) {
        this.stopTimer();
        this._state.update((s) => ({
          ...s,
          isReplaying: false,
          isRunning: false,
          replayConsistencyPassed: consistencyError === null,
          replayConsistencyError: consistencyError,
        }));
        return;
      }

      const originalLog = originalLogs[replayIndex];
      const replayLog = JSON.parse(JSON.stringify(originalLog));

      const verifyResult = this.verifyReplayConsistency(replayLog, originalLog);
      if (!verifyResult.success && !consistencyError) {
        consistencyError = verifyResult.error || '回放一致性验证失败';
      }

      this.applyReplayLog(replayLog);
      replayIndex++;
    }, interval);
  }

  private verifyReplayConsistency(
    replayLog: DailyLog,
    originalLog: DailyLog
  ): { success: boolean; error?: string } {
    if (replayLog.day !== originalLog.day) {
      return {
        success: false,
        error: `回放第 ${replayLog.day} 日与原记录第 ${originalLog.day} 日不匹配`,
      };
    }

    const replayHash = this.generateLogHash(replayLog);
    if (replayHash !== originalLog.logHash) {
      return {
        success: false,
        error: `第 ${replayLog.day} 日数据不一致：原哈希 ${originalLog.logHash}，回放哈希 ${replayHash}`,
      };
    }

    for (const cellarId of Object.keys(originalLog.cellarStocks)) {
      if (replayLog.cellarStocks[cellarId] !== originalLog.cellarStocks[cellarId]) {
        return {
          success: false,
          error: `第 ${replayLog.day} 日冰窖 [${cellarId}] 库存不一致：原 ${originalLog.cellarStocks[cellarId]}，回放 ${replayLog.cellarStocks[cellarId]}`,
        };
      }
    }

    for (const jianId of Object.keys(originalLog.jianStocks)) {
      if (replayLog.jianStocks[jianId] !== originalLog.jianStocks[jianId]) {
        return {
          success: false,
          error: `第 ${replayLog.day} 日冰鉴 [${jianId}] 库存不一致：原 ${originalLog.jianStocks[jianId]}，回放 ${replayLog.jianStocks[jianId]}`,
        };
      }
    }

    for (const transitId of Object.keys(originalLog.transitStocks)) {
      if (replayLog.transitStocks[transitId] !== originalLog.transitStocks[transitId]) {
        return {
          success: false,
          error: `第 ${replayLog.day} 日转运站 [${transitId}] 库存不一致：原 ${originalLog.transitStocks[transitId]}，回放 ${replayLog.transitStocks[transitId]}`,
        };
      }
    }

    if (originalLog.deliveries.length !== replayLog.deliveries.length) {
      return {
        success: false,
        error: `第 ${replayLog.day} 日送达记录数不一致：原 ${originalLog.deliveries.length}，回放 ${replayLog.deliveries.length}`,
      };
    }

    if (originalLog.errors.length !== replayLog.errors.length) {
      return {
        success: false,
        error: `第 ${replayLog.day} 日错误记录数不一致：原 ${originalLog.errors.length}，回放 ${replayLog.errors.length}`,
      };
    }

    if (originalLog.ceremonyUpdates.length !== replayLog.ceremonyUpdates.length) {
      return {
        success: false,
        error: `第 ${replayLog.day} 日活动更新记录数不一致：原 ${originalLog.ceremonyUpdates.length}，回放 ${replayLog.ceremonyUpdates.length}`,
      };
    }

    if (originalLog.ceremonyConsumptions.length !== replayLog.ceremonyConsumptions.length) {
      return {
        success: false,
        error: `第 ${replayLog.day} 日活动保供记录数不一致：原 ${originalLog.ceremonyConsumptions.length}，回放 ${replayLog.ceremonyConsumptions.length}`,
      };
    }

    return { success: true };
  }

  private applyReplayLog(log: DailyLog): void {
    for (const cellar of this._cellars()) {
      if (log.cellarStocks[cellar.id] !== undefined) {
        this.updateCellar(cellar.id, {
          currentStock: log.cellarStocks[cellar.id],
        });
      }
    }

    for (const jian of this._jians()) {
      if (log.jianStocks[jian.id] !== undefined) {
        this.updateJian(jian.id, { currentStock: log.jianStocks[jian.id] });
      }
    }

    for (const transit of this._transitNodes()) {
      if (log.transitStocks[transit.id] !== undefined) {
        this.updateTransitNode(transit.id, {
          currentStock: log.transitStocks[transit.id],
        });
      }
    }

    for (const occupancy of log.transitOccupancies) {
      this._transitOccupancies.update(prev =>
        prev.map(o =>
          o.id === occupancy.occupancyId
            ? { ...o, status: occupancy.status as any }
            : o
        )
      );
    }

    for (const delivery of log.deliveries) {
      this._shipments.update((prev) =>
        prev.map((s) =>
          s.id === delivery.id ? { ...s, status: 'delivered' } : s
        )
      );
    }

    for (const update of log.multiStageUpdates) {
      this._multiStageShipments.update((prev) =>
        prev.map((m) =>
          m.id === update.multiStageId
            ? {
                ...m,
                status: update.status === 'delivered' && m.currentStageIndex === m.stages.length - 1 ? 'completed' : 'in_progress',
                currentStageIndex: update.status === 'delivered' ? Math.min(m.currentStageIndex + 1, m.stages.length - 1) : m.currentStageIndex,
                stages: m.stages.map((s, i) =>
                  i === update.stageIndex ? { ...s, status: update.status as any } : s
                ),
              }
            : m
        )
      );
    }

    for (const update of log.ceremonyUpdates) {
      this._ceremonies.update(prev =>
        prev.map(c =>
          c.id === update.ceremonyId
            ? { ...c, status: update.status, failureReason: update.failureReason }
            : c
        )
      );
    }

    this._state.update((s) => ({
      ...s,
      currentDay: log.day,
      logs: [...s.logs, log],
    }));
  }

  exportConfig(): SchedulingConfig {
    return {
      cellars: JSON.parse(JSON.stringify(this._cellars())),
      jians: JSON.parse(JSON.stringify(this._jians())),
      transitNodes: JSON.parse(JSON.stringify(this._transitNodes())),
      connections: JSON.parse(JSON.stringify(this._connections())),
      consumptionPlans: JSON.parse(JSON.stringify(this._consumptionPlans())),
      shipments: JSON.parse(JSON.stringify(this._shipments())),
      multiStageShipments: JSON.parse(JSON.stringify(this._multiStageShipments())),
      climates: JSON.parse(JSON.stringify(this._climates())),
      ceremonies: JSON.parse(JSON.stringify(this._ceremonies())),
      totalDays: this._state().totalDays,
    };
  }

  importConfig(config: SchedulingConfig): void {
    this.reset();
    this._cellars.set(config.cellars);
    this._jians.set(config.jians);
    this._transitNodes.set(config.transitNodes);
    this._connections.set(config.connections);
    this._consumptionPlans.set(config.consumptionPlans);
    this._shipments.set(config.shipments);
    this._multiStageShipments.set(config.multiStageShipments || []);
    this._climates.set(config.climates || []);
    this._ceremonies.set(config.ceremonies || []);
    this._ceremonyConsumptions.set([]);
    for (const ceremony of (config.ceremonies || [])) {
      this._generateCeremonyConsumptionPlans(ceremony);
    }
    this.setTotalDays(config.totalDays);
  }

  loadDemoData(): void {
    this.reset();
    this._cellars.set([]);
    this._jians.set([]);
    this._transitNodes.set([]);
    this._connections.set([]);
    this._consumptionPlans.set([]);
    this._shipments.set([]);

    const cellar1 = this.addCellar({
      name: '景山西冰窖',
      maxCapacity: 10000,
      currentStock: 10000,
      dailyLossRate: 0.02,
      positionX: 100,
      positionY: 150,
    });

    const cellar2 = this.addCellar({
      name: '德胜门外冰窖',
      maxCapacity: 8000,
      currentStock: 8000,
      dailyLossRate: 0.025,
      positionX: 100,
      positionY: 350,
    });

    const transit1 = this.addTransitNode({
      name: '地安门转运站',
      maxConcurrentShipments: 2,
      maxCapacity: 3000,
      currentStock: 0,
      dailyLossRate: 0.03,
      positionX: 350,
      positionY: 250,
    });

    const transit2 = this.addTransitNode({
      name: '景山前门转运站',
      maxConcurrentShipments: 1,
      maxCapacity: 2000,
      currentStock: 0,
      dailyLossRate: 0.025,
      positionX: 475,
      positionY: 200,
    });

    const jian1 = this.addJian({
      name: '御膳房冰鉴',
      maxCapacity: 500,
      currentStock: 0,
      dailyLossRate: 0.08,
      positionX: 600,
      positionY: 150,
    });

    const jian2 = this.addJian({
      name: '御花园冰鉴',
      maxCapacity: 300,
      currentStock: 0,
      dailyLossRate: 0.1,
      positionX: 600,
      positionY: 350,
    });

    const conn1 = this.addConnection({
      fromId: cellar1.id,
      toId: transit1.id,
      travelDays: 1,
      transitLossRate: 0.05,
    });

    const conn2 = this.addConnection({
      fromId: cellar2.id,
      toId: transit1.id,
      travelDays: 2,
      transitLossRate: 0.08,
    });

    const conn3 = this.addConnection({
      fromId: transit1.id,
      toId: jian1.id,
      travelDays: 1,
      transitLossRate: 0.03,
    });

    const conn4 = this.addConnection({
      fromId: transit1.id,
      toId: jian2.id,
      travelDays: 1,
      transitLossRate: 0.03,
    });

    const conn5 = this.addConnection({
      fromId: transit1.id,
      toId: transit2.id,
      travelDays: 1,
      transitLossRate: 0.02,
    });

    const conn6 = this.addConnection({
      fromId: transit2.id,
      toId: jian1.id,
      travelDays: 1,
      transitLossRate: 0.02,
    });

    for (let day = 1; day <= 30; day++) {
      this.addConsumptionPlan({
        jianId: jian1.id,
        day,
        amount: 40 + (day % 3) * 10,
        description: `御膳房日常供冰`,
      });

      if (day % 2 === 0) {
        this.addConsumptionPlan({
          jianId: jian2.id,
          day,
          amount: 20,
          description: `御花园冰镇果品`,
        });
      }
    }

    this.addShipment({
      fromId: cellar1.id,
      toId: transit1.id,
      amount: 2000,
      startDay: 0,
      arrivalDay: 1,
      connectionId: conn1.id,
      lossAmount: 0,
      receivedAmount: 0,
    });

    this.addShipment({
      fromId: transit1.id,
      toId: jian1.id,
      amount: 500,
      startDay: 2,
      arrivalDay: 3,
      connectionId: conn3.id,
      lossAmount: 0,
      receivedAmount: 0,
    });

    this.addShipment({
      fromId: transit1.id,
      toId: jian2.id,
      amount: 300,
      startDay: 2,
      arrivalDay: 3,
      connectionId: conn4.id,
      lossAmount: 0,
      receivedAmount: 0,
    });

    this.addShipment({
      fromId: cellar2.id,
      toId: transit1.id,
      amount: 1500,
      startDay: 5,
      arrivalDay: 7,
      connectionId: conn2.id,
      lossAmount: 0,
      receivedAmount: 0,
    });

    this.addShipment({
      fromId: transit1.id,
      toId: jian1.id,
      amount: 600,
      startDay: 8,
      arrivalDay: 9,
      connectionId: conn3.id,
      lossAmount: 0,
      receivedAmount: 0,
    });

    this.addShipment({
      fromId: cellar1.id,
      toId: transit1.id,
      amount: 2500,
      startDay: 12,
      arrivalDay: 13,
      connectionId: conn1.id,
      lossAmount: 0,
      receivedAmount: 0,
    });

    this.addShipment({
      fromId: transit1.id,
      toId: jian1.id,
      amount: 800,
      startDay: 14,
      arrivalDay: 15,
      connectionId: conn3.id,
      lossAmount: 0,
      receivedAmount: 0,
    });

    this.addShipment({
      fromId: transit1.id,
      toId: jian2.id,
      amount: 400,
      startDay: 14,
      arrivalDay: 15,
      connectionId: conn4.id,
      lossAmount: 0,
      receivedAmount: 0,
    });

    this.addShipment({
      fromId: cellar2.id,
      toId: transit1.id,
      amount: 2000,
      startDay: 18,
      arrivalDay: 20,
      connectionId: conn2.id,
      lossAmount: 0,
      receivedAmount: 0,
    });

    this.addShipment({
      fromId: transit1.id,
      toId: jian1.id,
      amount: 700,
      startDay: 21,
      arrivalDay: 22,
      connectionId: conn3.id,
      lossAmount: 0,
      receivedAmount: 0,
    });

    this.addMultiStageShipment({
      name: '景山西冰窖经双转运至御膳房',
      totalAmount: 1000,
      nodeIds: [cellar1.id, transit1.id, transit2.id, jian1.id],
      startDay: 25,
    });

    this.addCeremony({
      name: '端午祭典',
      type: 'sacrifice',
      level: 'major',
      startDay: 5,
      durationDays: 3,
      supplyNodes: [
        { jianId: jian1.id, minIceAmount: 100, priority: 10 },
        { jianId: jian2.id, minIceAmount: 50, priority: 5 },
      ],
      description: '端午祭祀大典，需大量冰鉴供祭祀及宴席使用',
    });

    this.addCeremony({
      name: '千秋节御宴',
      type: 'banquet',
      level: 'grand',
      startDay: 12,
      durationDays: 1,
      supplyNodes: [
        { jianId: jian1.id, minIceAmount: 200, priority: 20 },
      ],
      description: '皇帝寿辰千秋节，宫中大摆筵席',
    });

    this.addCeremony({
      name: '中伏纳凉宴',
      type: 'festival',
      level: 'minor',
      startDay: 23,
      durationDays: 2,
      supplyNodes: [
        { jianId: jian1.id, minIceAmount: 80, priority: 8 },
        { jianId: jian2.id, minIceAmount: 60, priority: 6 },
      ],
      description: '中伏时节宫中纳凉消暑活动',
    });

    for (let day = 1; day <= 30; day++) {
      let season: SeasonType = 'spring';
      let temperature = 15 + Math.sin(day / 5) * 8;
      let weather: WeatherType = 'sunny';
      let hasHeatWarning = false;
      let heatWarningLevel: 'yellow' | 'orange' | 'red' | undefined = undefined;
      let seasonEvent: string | undefined = undefined;

      if (day <= 10) {
        season = 'spring';
        temperature = 12 + day * 0.8;
        weather = day % 4 === 0 ? 'rainy' : 'cloudy';
      } else if (day <= 20) {
        season = 'summer';
        temperature = 25 + (day - 10) * 1.2;
        weather = day % 5 === 0 ? 'cloudy' : 'sunny';
        
        if (day === 15) {
          temperature = 36;
          hasHeatWarning = true;
          heatWarningLevel = 'yellow';
          seasonEvent = '初伏';
        }
        if (day === 18) {
          temperature = 38;
          hasHeatWarning = true;
          heatWarningLevel = 'orange';
        }
      } else {
        season = 'summer';
        temperature = 32 + Math.sin(day / 3) * 5;
        weather = day % 3 === 0 ? 'hot_wave' : 'sunny';
        
        if (day === 23) {
          temperature = 40;
          hasHeatWarning = true;
          heatWarningLevel = 'red';
          seasonEvent = '中伏·极端高温';
        }
        if (day === 27) {
          temperature = 37;
          hasHeatWarning = true;
          heatWarningLevel = 'orange';
        }
        if (day === 28) {
          temperature = 28;
          weather = 'rainy';
          seasonEvent = '雷阵雨降温';
        }
      }

      temperature = Math.round(temperature * 10) / 10;

      this.addClimate({
        day,
        temperature,
        weather,
        season,
        seasonEvent,
        hasHeatWarning,
        heatWarningLevel,
        description: seasonEvent || '',
      });
    }

    this.setTotalDays(30);
  }
}
