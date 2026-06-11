import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SchedulingService } from '../../services/scheduling.service';
import { DailyLog } from '../../models/ice.models';

@Component({
  selector: 'app-stats-log',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stats-log.component.html',
  styleUrl: './stats-log.component.scss',
})
export class StatsLogComponent {
  selectedLogIndex = signal<number | null>(null);
  activeStatsTab = signal<'overview' | 'chart'>('overview');

  readonly state = computed(() => this.schedulingService.state());
  readonly cellars = computed(() => this.schedulingService.cellars());
  readonly jians = computed(() => this.schedulingService.jians());
  readonly transitNodes = computed(() => this.schedulingService.transitNodes());
  readonly shipments = computed(() => this.schedulingService.shipments());
  readonly logs = computed(() => this.state().logs);
  readonly latestLog = computed<DailyLog | null>(() => {
    const logs = this.logs();
    return logs.length > 0 ? logs[logs.length - 1] : null;
  });

  readonly totalCellarStock = computed(() =>
    this.cellars().reduce((sum, c) => sum + c.currentStock, 0)
  );
  readonly totalCellarCapacity = computed(() =>
    this.cellars().reduce((sum, c) => sum + c.maxCapacity, 0)
  );
  readonly totalJianStock = computed(() =>
    this.jians().reduce((sum, j) => sum + j.currentStock, 0)
  );
  readonly totalJianCapacity = computed(() =>
    this.jians().reduce((sum, j) => sum + j.maxCapacity, 0)
  );
  readonly totalTransitStock = computed(() =>
    this.transitNodes().reduce((sum, t) => sum + t.currentStock, 0)
  );
  readonly totalTransitCapacity = computed(() =>
    this.transitNodes().reduce((sum, t) => sum + t.maxCapacity, 0)
  );

  readonly multiStageShipments = computed(() => this.schedulingService.multiStageShipments());
  readonly activeMultiStage = computed(() =>
    this.multiStageShipments().filter((m) => m.status === 'in_progress' || m.status === 'pending')
  );
  readonly completedMultiStage = computed(() =>
    this.multiStageShipments().filter((m) => m.status === 'completed')
  );
  readonly failedMultiStage = computed(() =>
    this.multiStageShipments().filter((m) => m.status === 'failed')
  );

  readonly totalOccupiedAmount = computed(() => {
    const day = this.state().currentDay;
    let total = 0;
    for (const node of this.transitNodes()) {
      total += this.schedulingService.getTotalOccupiedAmountAtNode(node.id, day);
    }
    return total;
  });

  getNodeOccupancy(nodeId: string): number {
    return this.schedulingService.getTotalOccupiedAmountAtNode(nodeId, this.state().currentDay);
  }

  getNodeAvailableCapacity(nodeId: string): number {
    return this.schedulingService.getAvailableCapacityAtNode(nodeId, this.state().currentDay);
  }

  readonly activeShipments = computed(() =>
    this.shipments().filter((s) => s.status === 'in_transit' || s.status === 'pending')
  );
  readonly deliveredShipments = computed(() =>
    this.shipments().filter((s) => s.status === 'delivered')
  );

  readonly totalLossToday = computed(() => {
    const log = this.latestLog();
    if (!log) return 0;
    return log.dailyLosses.reduce((sum, l) => sum + l.amount, 0);
  });

  readonly lossRateHistory = computed(() => {
    const result: { day: number; totalLoss: number; cellarLoss: number; jianLoss: number; deliveryCount: number; consumptionAmount: number }[] = [];
    const logs = this.logs();
    for (let i = 1; i < logs.length; i++) {
      const log = logs[i];
      const cellarLoss = log.dailyLosses
        .filter((l) => this.cellars().some((c) => c.id === l.nodeId))
        .reduce((s, l) => s + l.amount, 0);
      const jianLoss = log.dailyLosses
        .filter((l) => this.jians().some((j) => j.id === l.nodeId))
        .reduce((s, l) => s + l.amount, 0);
      const consumptionAmount = log.consumptions
        .filter((c) => c.success)
        .reduce((s, c) => s + c.amount, 0);
      result.push({
        day: log.day,
        totalLoss: cellarLoss + jianLoss,
        cellarLoss,
        jianLoss,
        deliveryCount: log.deliveries.length,
        consumptionAmount,
      });
    }
    return result;
  });

  readonly maxLossForChart = computed(() => {
    const max = Math.max(...this.lossRateHistory().map((h) => h.totalLoss), 10);
    return Math.ceil(max * 1.2);
  });

  readonly maxConsumptionForChart = computed(() => {
    const max = Math.max(...this.lossRateHistory().map((h) => h.consumptionAmount), 10);
    return Math.ceil(max * 1.2);
  });

  constructor(private schedulingService: SchedulingService) {}

  selectLog(index: number): void {
    this.selectedLogIndex.set(this.selectedLogIndex() === index ? null : index);
  }

  getSelectedLog(): DailyLog | null {
    const idx = this.selectedLogIndex();
    return idx !== null ? this.logs()[idx] : null;
  }

  getNodeName(nodeId: string): string {
    return [...this.cellars(), ...this.jians(), ...this.transitNodes()]
      .find((n) => n.id === nodeId)?.name || nodeId;
  }

  getChartHeight(value: number, max: number): string {
    if (max === 0) return '0%';
    return `${(value / max) * 100}%`;
  }

  getNodeTypeLabel(nodeId: string): string {
    if (this.cellars().some((c) => c.id === nodeId)) return '冰窖';
    if (this.jians().some((j) => j.id === nodeId)) return '冰鉴';
    if (this.transitNodes().some((t) => t.id === nodeId)) return '转运站';
    return '未知';
  }

  getJianStockHistory(): { name: string; data: { day: number; stock: number }[] }[] {
    const result: { name: string; data: { day: number; stock: number }[] }[] = [];
    const logs = this.logs();

    for (const jian of this.jians()) {
      const data: { day: number; stock: number }[] = [];
      for (const log of logs) {
        data.push({
          day: log.day,
          stock: log.jianStocks[jian.id] ?? 0,
        });
      }
      result.push({ name: jian.name, data });
    }
    return result;
  }

  getMaxJianStockForHistory(): number {
    const histories = this.getJianStockHistory();
    let max = 0;
    for (const h of histories) {
      for (const d of h.data) {
        max = Math.max(max, d.stock);
      }
    }
    return Math.max(max, 1);
  }

  getLogConsumptionSuccessAmount(log: DailyLog): number {
    return log.consumptions
      .filter((c) => c.success)
      .reduce((s, c) => s + c.amount, 0);
  }

  getLogTotalLossAmount(log: DailyLog): number {
    return log.dailyLosses.reduce((s, l) => s + l.amount, 0);
  }

  getJianStockPolylinePoints(jianName: string): string {
    const histories = this.getJianStockHistory();
    const target = histories.find((h) => h.name === jianName);
    if (!target || target.data.length === 0) return '';
    const maxStock = this.getMaxJianStockForHistory();
    const points: string[] = [];
    const len = target.data.length;
    for (let i = 0; i < len; i++) {
      const d = target.data[i];
      const x = (i / Math.max(len - 1, 1)) * 780 + 10;
      const y = 190 - (d.stock / maxStock) * 180;
      points.push(`${x},${y}`);
    }
    return points.join(' ');
  }

  jianStockHistoryColors(): { name: string; color: string }[] {
    const colors = ['#b48cff', '#6495ed', '#ffc773', '#ff6b6b', '#81c784', '#4dd0e1'];
    return this.getJianStockHistory().map((h, idx) => ({
      name: h.name,
      color: colors[idx % colors.length],
    }));
  }

  roundNumber(num: number): number {
    return Math.round(num);
  }
}
