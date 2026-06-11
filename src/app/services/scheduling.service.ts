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
  });

  private timerInterval: ReturnType<typeof setInterval> | null = null;

  readonly cellars = computed(() => this._cellars());
  readonly jians = computed(() => this._jians());
  readonly transitNodes = computed(() => this._transitNodes());
  readonly connections = computed(() => this._connections());
  readonly consumptionPlans = computed(() => this._consumptionPlans());
  readonly shipments = computed(() => this._shipments());
  readonly state = computed(() => this._state());

  readonly allNodes = computed<IceNode[]>(() => [
    ...this._cellars(),
    ...this._jians(),
    ...this._transitNodes(),
  ]);

  private generateId(): string {
    return Math.random().toString(36).substring(2, 11);
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
    const relatedShipments = this._shipments().filter(
      (s) => s.fromId === id || s.toId === id
    );
    const relatedConnections = this._connections().filter(
      (c) => c.fromId === id || c.toId === id
    );

    if (relatedShipments.length > 0) {
      this._shipments.update((prev) =>
        prev.filter((s) => s.fromId !== id && s.toId !== id)
      );
    }

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
    this._shipments.update((prev) =>
      prev.filter((s) => s.fromId !== id && s.toId !== id)
    );
    this._connections.update((prev) =>
      prev.filter((c) => c.fromId !== id && c.toId !== id)
    );
    this._consumptionPlans.update((prev) => prev.filter((p) => p.jianId !== id));
    this._jians.update((prev) => prev.filter((j) => j.id !== id));
  }

  addTransitNode(data: Omit<TransitNode, 'id' | 'type'>): TransitNode {
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
    this._transitNodes.update((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...changes } : n))
    );
  }

  removeTransitNode(id: string): void {
    this._shipments.update((prev) =>
      prev.filter((s) => s.fromId !== id && s.toId !== id)
    );
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

    const conflict = this.checkShipmentConflict(
      data.fromId,
      data.startDay,
      data.arrivalDay
    );
    if (conflict) {
      return {
        success: false,
        error: '同一运输节点同一时刻不能承载两批冰',
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
    this._shipments.update((prev) => prev.filter((s) => s.id !== id));
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
      for (const plan of dayConsumptions) {
        const jian = this._jians().find((j) => j.id === plan.jianId);
        if (!jian) continue;

        const simulatedResult = this.simulateJianStockAtDay(jian.id, day);
        if (simulatedResult < plan.amount) {
          return {
            hasRisk: true,
            reason: `第 ${day} 天 [${jian.name}] 需要 ${plan.amount} 单位冰，但预测库存仅有 ${simulatedResult.toFixed(0)} 单位，存在超配风险！`,
          };
        }
      }
    }

    return { hasRisk: false, reason: null };
  }

  private simulateJianStockAtDay(jianId: string, targetDay: number): number {
    const jian = this._jians().find((j) => j.id === jianId);
    if (!jian) return 0;

    let stock = jian.currentStock;
    const consumptionByDay = new Map<number, number>();
    for (const p of this._consumptionPlans()) {
      if (p.jianId === jianId) {
        consumptionByDay.set(p.day, (consumptionByDay.get(p.day) || 0) + p.amount);
      }
    }

    const incomingShipments = this._shipments()
      .filter((s) => s.toId === jianId && s.status !== 'cancelled')
      .sort((a, b) => a.arrivalDay - b.arrivalDay);

    for (let day = 1; day <= targetDay; day++) {
      const loss = Math.floor(stock * jian.dailyLossRate);
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
    }));
    this._shipments.update((prev) =>
      prev.map((s) => ({ ...s, status: 'pending' as const }))
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

    this.processDailyLoss(nextDay, log);
    this.processShipmentTransits(nextDay, log);
    this.processDeliveries(nextDay, log);
    this.processConsumptions(nextDay, log);

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

    return {
      day,
      cellarStocks,
      jianStocks,
      activeShipments: JSON.parse(JSON.stringify(this._shipments().filter(s => s.status === 'in_transit' || s.status === 'pending'))),
      deliveries: [],
      consumptions: [],
      dailyLosses: [],
      warnings: [],
      errors: [],
    };
  }

  private processDailyLoss(day: number, log: DailyLog): void {
    for (const cellar of this._cellars()) {
      const loss = Math.floor(cellar.currentStock * cellar.dailyLossRate);
      if (loss > 0) {
        this.updateCellar(cellar.id, {
          currentStock: Math.max(0, cellar.currentStock - loss),
        });
        log.dailyLosses.push({ nodeId: cellar.id, amount: loss });
        log.cellarStocks[cellar.id] = Math.max(0, cellar.currentStock - loss);
      }
    }

    for (const jian of this._jians()) {
      const loss = Math.floor(jian.currentStock * jian.dailyLossRate);
      if (loss > 0) {
        this.updateJian(jian.id, {
          currentStock: Math.max(0, jian.currentStock - loss),
        });
        log.dailyLosses.push({ nodeId: jian.id, amount: loss });
        log.jianStocks[jian.id] = Math.max(0, jian.currentStock - loss);
      }
    }
  }

  private processShipmentTransits(day: number, log: DailyLog): void {
    const pendingShipments = this._shipments().filter(
      (s) => s.status === 'pending' && s.startDay <= day
    );
    for (const shipment of pendingShipments) {
      const conflict = this.checkShipmentConflict(
        shipment.fromId,
        shipment.startDay,
        shipment.arrivalDay
      );
      if (!conflict) {
        this._shipments.update((prev) =>
          prev.map((s) =>
            s.id === shipment.id ? { ...s, status: 'in_transit' } : s
          )
        );
      } else {
        log.warnings.push(
          `第 ${day} 天: 节点冲突，运输计划 [${shipment.id}] 延迟启动`
        );
      }
    }
  }

  private processDeliveries(day: number, log: DailyLog): void {
    const arrivingShipments = this._shipments().filter(
      (s) => s.arrivalDay === day && s.status !== 'cancelled'
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

      if (jian.currentStock < plan.amount) {
        log.consumptions.push({
          jianId: plan.jianId,
          amount: plan.amount,
          success: false,
          reason: '库存不足，无法取冰',
        });
        log.errors.push(
          `第 ${day} 天: [${jian.name}] 库存不足，计划取用 ${plan.amount}，实际库存 ${jian.currentStock}`
        );
        this._state.update((s) => ({
          ...s,
          isOverAllocated: true,
          overAllocationReason: `第 ${day} 天 [${jian.name}] 库存不足！`,
          isPaused: true,
        }));
        this.stopTimer();
      } else {
        this.updateJian(jian.id, {
          currentStock: jian.currentStock - plan.amount,
        });
        log.jianStocks[jian.id] = jian.currentStock - plan.amount;
        log.consumptions.push({
          jianId: plan.jianId,
          amount: plan.amount,
          success: true,
        });
      }
    }
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
    this._shipments.update((prev) =>
      prev.map((s) => ({ ...s, status: 'pending' as const }))
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
    }));

    const originalLogs = this._state().originalLogs!;
    let replayIndex = 0;

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
        }));
        return;
      }

      const replayLog = JSON.parse(JSON.stringify(originalLogs[replayIndex]));
      this.applyReplayLog(replayLog);
      replayIndex++;
    }, interval);
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

    for (const delivery of log.deliveries) {
      this._shipments.update((prev) =>
        prev.map((s) =>
          s.id === delivery.id ? { ...s, status: 'delivered' } : s
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
      positionX: 350,
      positionY: 250,
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

    this.setTotalDays(30);
  }
}
