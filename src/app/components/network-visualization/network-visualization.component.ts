import { Component, computed, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SchedulingService } from '../../services/scheduling.service';
import { IceNode, NodeConnection, Shipment } from '../../models/ice.models';

@Component({
  selector: 'app-network-visualization',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './network-visualization.component.html',
  styleUrl: './network-visualization.component.scss',
})
export class NetworkVisualizationComponent {
  readonly cellars = computed(() => this.schedulingService.cellars());
  readonly jians = computed(() => this.schedulingService.jians());
  readonly transitNodes = computed(() => this.schedulingService.transitNodes());
  readonly connections = computed(() => this.schedulingService.connections());
  readonly shipments = computed(() => this.schedulingService.shipments());
  readonly state = computed(() => this.schedulingService.state());
  readonly allNodes = computed(() => this.schedulingService.allNodes());

  readonly svgWidth = 800;
  readonly svgHeight = 500;

  activeShipmentsOnConnections = computed(() => {
    const map = new Map<string, Shipment[]>();
    for (const shipment of this.shipments()) {
      if (shipment.status === 'in_transit') {
        const existing = map.get(shipment.connectionId) || [];
        map.set(shipment.connectionId, [...existing, shipment]);
      }
    }
    return map;
  });

  inTransitShipmentsWithConn = computed<{ shipment: Shipment; conn: NodeConnection | undefined }[]>(() => {
    const result: { shipment: Shipment; conn: NodeConnection | undefined }[] = [];
    for (const s of this.shipments()) {
      if (s.status === 'in_transit') {
        result.push({
          shipment: s,
          conn: this.connections().find((c) => c.id === s.connectionId),
        });
      }
    }
    return result;
  });

  getShipmentPos(shipment: Shipment, conn: NodeConnection | undefined): { x: number; y: number } {
    if (!conn) return { x: -100, y: -100 };
    return this.getShipmentPosition(shipment, conn);
  }

  constructor(private schedulingService: SchedulingService) {}

  getNodePosition(node: IceNode): { x: number; y: number } {
    return { x: node.positionX, y: node.positionY };
  }

  getStockPercent(node: IceNode): number {
    if (node.type === 'transit') return 0;
    return node.maxCapacity > 0 ? (node.currentStock / node.maxCapacity) * 100 : 0;
  }

  getNodeTypeClass(node: IceNode): string {
    return `node-${node.type}`;
  }

  getNodeTypeLabel(node: IceNode): string {
    const labels = {
      cellar: '冰窖',
      jian: '冰鉴',
      transit: '转运',
    };
    return labels[node.type];
  }

  calculateConnectionPath(conn: NodeConnection): string {
    const fromNode = this.allNodes().find((n) => n.id === conn.fromId);
    const toNode = this.allNodes().find((n) => n.id === conn.toId);
    if (!fromNode || !toNode) return '';
    return `M ${fromNode.positionX + 40} ${fromNode.positionY + 25}
            L ${toNode.positionX + 40} ${toNode.positionY + 25}`;
  }

  getShipmentProgress(shipment: Shipment, conn: NodeConnection): number {
    const currentDay = this.state().currentDay;
    const fromNode = this.allNodes().find((n) => n.id === shipment.fromId);
    const toNode = this.allNodes().find((n) => n.id === shipment.toId);
    if (!fromNode || !toNode) return 0;

    const totalDays = conn.travelDays;
    const elapsed = currentDay - shipment.startDay;
    return Math.min(1, Math.max(0, elapsed / totalDays));
  }

  getShipmentPosition(shipment: Shipment, conn: NodeConnection): { x: number; y: number } {
    const fromNode = this.allNodes().find((n) => n.id === shipment.fromId);
    const toNode = this.allNodes().find((n) => n.id === shipment.toId);
    if (!fromNode || !toNode) return { x: 0, y: 0 };

    const progress = this.getShipmentProgress(shipment, conn);
    const x1 = fromNode.positionX + 40;
    const y1 = fromNode.positionY + 25;
    const x2 = toNode.positionX + 40;
    const y2 = toNode.positionY + 25;

    return {
      x: x1 + (x2 - x1) * progress,
      y: y1 + (y2 - y1) * progress,
    };
  }

  getMidPoint(conn: NodeConnection): { x: number; y: number } {
    const fromNode = this.allNodes().find((n) => n.id === conn.fromId);
    const toNode = this.allNodes().find((n) => n.id === conn.toId);
    if (!fromNode || !toNode) return { x: 0, y: 0 };
    return {
      x: (fromNode.positionX + toNode.positionX) / 2 + 40,
      y: (fromNode.positionY + toNode.positionY) / 2 + 25,
    };
  }
}
