import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SchedulingService } from '../../services/scheduling.service';
import { Shipment, MultiStageShipment } from '../../models/ice.models';

@Component({
  selector: 'app-plan-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './plan-config.component.html',
  styleUrl: './plan-config.component.scss',
})
export class PlanConfigComponent {
  activeTab = signal<'connections' | 'shipments' | 'multiStage' | 'consumptions'>('connections');
  showAddConnection = signal(false);
  showAddShipment = signal(false);
  showAddMultiStage = signal(false);
  showAddConsumption = signal(false);

  newConnection = {
    fromId: '',
    toId: '',
    travelDays: 1,
    transitLossRate: 0.05,
  };

  newShipment = {
    fromId: '',
    toId: '',
    connectionId: '',
    amount: 500,
    startDay: 0,
    arrivalDay: 1,
  };

  newMultiStage = {
    name: '',
    totalAmount: 1000,
    nodeIds: [] as string[],
    startDay: 0,
    transitStayDays: 1,
  };

  selectedNode = '';

  newConsumption = {
    jianId: '',
    day: 1,
    amount: 30,
    description: '',
  };

  readonly connections = computed(() => this.schedulingService.connections());
  readonly shipments = computed(() => this.schedulingService.shipments());
  readonly singleShipments = computed(() => this.shipments().filter(s => !s.multiStageId));
  readonly multiStageShipments = computed(() => this.schedulingService.multiStageShipments());
  readonly consumptions = computed(() => this.schedulingService.consumptionPlans());
  readonly allNodes = computed(() => this.schedulingService.allNodes());
  readonly jians = computed(() => this.schedulingService.jians());
  readonly state = computed(() => this.schedulingService.state());

  readonly previewSchedule = computed(() => {
    const stages = this.previewStages();
    const schedule: string[] = [];
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const fromName = this.getStageNodeName(stage.fromId);
      const toName = this.getStageNodeName(stage.toId);
      schedule.push(`${fromName} → ${toName} (第${stage.startDay}日→第${stage.arrivalDay}日)`);
      if (i < stages.length - 1) {
        schedule.push(`  ↳ 中转停留${this.newMultiStage.transitStayDays}天`);
      }
    }
    return schedule;
  });

  previewStages = computed(() => {
    if (this.newMultiStage.nodeIds.length < 2) return [];
    const stages: any[] = [];
    let currentDay = this.newMultiStage.startDay;
    let currentAmount = this.newMultiStage.totalAmount;

    for (let i = 0; i < this.newMultiStage.nodeIds.length - 1; i++) {
      const fromId = this.newMultiStage.nodeIds[i];
      const toId = this.newMultiStage.nodeIds[i + 1];
      const connection = this.connections().find(
        (c) =>
          (c.fromId === fromId && c.toId === toId) ||
          (c.fromId === toId && c.toId === fromId)
      );
      if (!connection) continue;

      const lossAmount = Math.floor(currentAmount * connection.transitLossRate);
      const receivedAmount = currentAmount - lossAmount;

      const arrivalDay = currentDay + connection.travelDays;
      const isLastStage = i === this.newMultiStage.nodeIds.length - 2;

      stages.push({
        fromId,
        toId,
        startDay: currentDay,
        arrivalDay,
        amount: currentAmount,
        lossAmount,
        receivedAmount,
      });

      currentDay = arrivalDay + (isLastStage ? 0 : this.newMultiStage.transitStayDays);
      currentAmount = receivedAmount;
    }

    return stages;
  });

  availableConnectionsForShipment = computed(() => {
    const { fromId, toId } = this.newShipment;
    if (!fromId || !toId) return [];
    return this.connections().filter(
      (c) =>
        (c.fromId === fromId && c.toId === toId) ||
        (c.fromId === toId && c.toId === fromId)
    );
  });

  constructor(private schedulingService: SchedulingService) {}

  addConnection(): void {
    if (!this.newConnection.fromId || !this.newConnection.toId) {
      alert('请选择起止节点');
      return;
    }
    if (this.newConnection.fromId === this.newConnection.toId) {
      alert('起止节点不能相同');
      return;
    }
    try {
      this.schedulingService.addConnection({ ...this.newConnection });
      this.showAddConnection.set(false);
      this.newConnection = {
        fromId: '',
        toId: '',
        travelDays: 1,
        transitLossRate: 0.05,
      };
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  removeConnection(id: string): void {
    this.schedulingService.removeConnection(id);
  }

  onShipmentNodeChange(): void {
    const matches = this.availableConnectionsForShipment();
    if (matches.length > 0) {
      this.newShipment.connectionId = matches[0].id;
      this.newShipment.arrivalDay =
        this.newShipment.startDay + matches[0].travelDays;
    }
  }

  addShipment(): void {
    if (
      !this.newShipment.fromId ||
      !this.newShipment.toId ||
      !this.newShipment.connectionId
    ) {
      alert('请选择完整的运输路径');
      return;
    }
    const result = this.schedulingService.addShipment({
      ...this.newShipment,
      lossAmount: 0,
      receivedAmount: 0,
    });
    if (!result.success) {
      alert(result.error);
      return;
    }
    this.showAddShipment.set(false);
    this.newShipment = {
      fromId: '',
      toId: '',
      connectionId: '',
      amount: 500,
      startDay: 0,
      arrivalDay: 1,
    };
  }

  removeShipment(id: string): void {
    this.schedulingService.removeShipment(id);
  }

  addConsumption(): void {
    if (!this.newConsumption.jianId) {
      alert('请选择冰鉴');
      return;
    }
    if (this.newConsumption.amount <= 0) {
      alert('取冰量必须大于 0');
      return;
    }
    this.schedulingService.addConsumptionPlan({ ...this.newConsumption });
    this.showAddConsumption.set(false);
    this.newConsumption = {
      jianId: '',
      day: 1,
      amount: 30,
      description: '',
    };
  }

  removeConsumption(id: string): void {
    this.schedulingService.removeConsumptionPlan(id);
  }

  getNodeName(id: string): string {
    return this.allNodes().find((n) => n.id === id)?.name || id;
  }

  getShipmentStatusText(s: Shipment): string {
    const map: Record<Shipment['status'], string> = {
      pending: '待启运',
      in_transit: '运输中',
      delivered: '已送达',
      cancelled: '已取消',
    };
    return map[s.status];
  }

  getShipmentStatusClass(s: Shipment): string {
    const map: Record<Shipment['status'], string> = {
      pending: 'status-pending',
      in_transit: 'status-transit',
      delivered: 'status-delivered',
      cancelled: 'status-cancelled',
    };
    return map[s.status];
  }

  addMultiStageNode(nodeId: string): void {
    if (!nodeId) return;
    if (this.newMultiStage.nodeIds.includes(nodeId)) {
      alert('该节点已在路线中');
      return;
    }
    this.newMultiStage.nodeIds.push(nodeId);
  }

  removeMultiStageNode(index: number): void {
    this.newMultiStage.nodeIds.splice(index, 1);
  }

  addMultiStage(): void {
    if (!this.newMultiStage.name) {
      alert('请输入运输名称');
      return;
    }
    if (this.newMultiStage.nodeIds.length < 2) {
      alert('请至少选择 2 个节点');
      return;
    }
    const result = this.schedulingService.addMultiStageShipment({
      ...this.newMultiStage,
    });
    if (!result.success) {
      alert(result.error);
      return;
    }
    this.showAddMultiStage.set(false);
    this.newMultiStage = {
      name: '',
      totalAmount: 1000,
      nodeIds: [],
      startDay: 0,
      transitStayDays: 1,
    };
  }

  removeMultiStage(id: string): void {
    this.schedulingService.removeMultiStageShipment(id);
  }

  getMultiStageStatusText(m: MultiStageShipment): string {
    const map: Record<MultiStageShipment['status'], string> = {
      pending: '待启运',
      in_progress: '运输中',
      completed: '已完成',
      cancelled: '已取消',
      failed: '已失败',
    };
    return map[m.status];
  }

  getMultiStageStatusClass(m: MultiStageShipment): string {
    const map: Record<MultiStageShipment['status'], string> = {
      pending: 'status-pending',
      in_progress: 'status-transit',
      completed: 'status-delivered',
      cancelled: 'status-cancelled',
      failed: 'status-cancelled',
    };
    return map[m.status];
  }

  getStageNodeName(nodeId: string): string {
    return this.allNodes().find((n) => n.id === nodeId)?.name || nodeId;
  }

  calculateMultiStageSchedule(m: MultiStageShipment): string[] {
    const schedule: string[] = [];
    for (let i = 0; i < m.stages.length; i++) {
      const stage = m.stages[i];
      const fromName = this.getStageNodeName(stage.fromId);
      const toName = this.getStageNodeName(stage.toId);
      schedule.push(`${fromName} → ${toName} (第${stage.startDay}日→第${stage.arrivalDay}日)`);
    }
    return schedule;
  }

  getStageStatusText(status: string): string {
    const map: Record<string, string> = {
      pending: '待启运',
      in_transit: '运输中',
      delivered: '已送达',
      cancelled: '已取消',
      failed: '已失败',
    };
    return map[status] || status;
  }

  readonly transitOccupancies = computed(() => this.schedulingService.transitOccupancies());

  getNodeOccupancy(nodeId: string): number {
    return this.schedulingService.getTotalOccupiedAmountAtNode(nodeId, this.state().currentDay);
  }
}
