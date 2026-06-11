import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SchedulingService } from '../../services/scheduling.service';
import { Shipment } from '../../models/ice.models';

@Component({
  selector: 'app-plan-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './plan-config.component.html',
  styleUrl: './plan-config.component.scss',
})
export class PlanConfigComponent {
  activeTab = signal<'connections' | 'shipments' | 'consumptions'>('connections');
  showAddConnection = signal(false);
  showAddShipment = signal(false);
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

  newConsumption = {
    jianId: '',
    day: 1,
    amount: 30,
    description: '',
  };

  readonly connections = computed(() => this.schedulingService.connections());
  readonly shipments = computed(() => this.schedulingService.shipments());
  readonly consumptions = computed(() => this.schedulingService.consumptionPlans());
  readonly allNodes = computed(() => this.schedulingService.allNodes());
  readonly jians = computed(() => this.schedulingService.jians());
  readonly state = computed(() => this.schedulingService.state());

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
}
