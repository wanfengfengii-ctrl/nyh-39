import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SchedulingService } from '../../services/scheduling.service';
import { IceCellar, IceJian, TransitNode, NodeType } from '../../models/ice.models';

@Component({
  selector: 'app-node-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './node-config.component.html',
  styleUrl: './node-config.component.scss',
})
export class NodeConfigComponent {
  selectedType = signal<NodeType>('cellar');
  showAddForm = signal(false);

  newCellar = {
    name: '',
    maxCapacity: 5000,
    currentStock: 5000,
    dailyLossRate: 0.02,
    positionX: 100,
    positionY: 100,
  };

  newJian = {
    name: '',
    maxCapacity: 500,
    currentStock: 0,
    dailyLossRate: 0.08,
    positionX: 100,
    positionY: 100,
  };

  newTransit = {
    name: '',
    maxConcurrentShipments: 2,
    maxCapacity: 2000,
    currentStock: 0,
    dailyLossRate: 0.03,
    positionX: 100,
    positionY: 100,
  };

  readonly cellars = computed(() => this.schedulingService.cellars());
  readonly jians = computed(() => this.schedulingService.jians());
  readonly transitNodes = computed(() => this.schedulingService.transitNodes());

  constructor(private schedulingService: SchedulingService) {}

  addNode(): void {
    try {
      if (this.selectedType() === 'cellar') {
        if (!this.newCellar.name.trim()) return;
        this.schedulingService.addCellar({ ...this.newCellar });
        this.newCellar.name = '';
      } else if (this.selectedType() === 'jian') {
        if (!this.newJian.name.trim()) return;
        this.schedulingService.addJian({ ...this.newJian });
        this.newJian.name = '';
      } else {
        if (!this.newTransit.name.trim()) return;
        this.schedulingService.addTransitNode({ ...this.newTransit });
        this.newTransit.name = '';
      }
      this.showAddForm.set(false);
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  updateCellarStock(cellar: IceCellar, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    try {
      this.schedulingService.updateCellar(cellar.id, { currentStock: value });
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  updateCellarLoss(cellar: IceCellar, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    try {
      this.schedulingService.updateCellar(cellar.id, { dailyLossRate: value });
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  updateJianStock(jian: IceJian, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    try {
      this.schedulingService.updateJian(jian.id, { currentStock: value });
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  updateJianLoss(jian: IceJian, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    try {
      this.schedulingService.updateJian(jian.id, { dailyLossRate: value });
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  updateTransitCapacity(node: TransitNode, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.schedulingService.updateTransitNode(node.id, {
      maxConcurrentShipments: value,
    });
  }

  updateTransitStock(node: TransitNode, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    try {
      this.schedulingService.updateTransitNode(node.id, { currentStock: value });
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  updateTransitLoss(node: TransitNode, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    try {
      this.schedulingService.updateTransitNode(node.id, { dailyLossRate: value });
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  updateTransitMaxCapacity(node: TransitNode, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    try {
      this.schedulingService.updateTransitNode(node.id, { maxCapacity: value });
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  removeCellar(id: string): void {
    if (confirm('删除冰窖将同步删除关联的运输计划和连接，确认？')) {
      this.schedulingService.removeCellar(id);
    }
  }

  removeJian(id: string): void {
    if (confirm('删除冰鉴将同步删除关联的取用计划、运输计划和连接，确认？')) {
      this.schedulingService.removeJian(id);
    }
  }

  removeTransit(id: string): void {
    if (confirm('删除运输节点将同步删除关联的运输计划和连接，确认？')) {
      this.schedulingService.removeTransitNode(id);
    }
  }
}
