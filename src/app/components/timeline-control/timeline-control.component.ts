import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SchedulingService } from '../../services/scheduling.service';

@Component({
  selector: 'app-timeline-control',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './timeline-control.component.html',
  styleUrl: './timeline-control.component.scss',
})
export class TimelineControlComponent {
  jumpDayInput = signal(1);

  readonly state = computed(() => this.schedulingService.state());
  readonly totalDays = computed(() => this.state().totalDays);
  readonly speedOptions = [0.5, 1, 2, 4, 8];

  constructor(private schedulingService: SchedulingService) {}

  get progressPercent(): number {
    if (this.totalDays() === 0) return 0;
    return (this.state().currentDay / this.totalDays()) * 100;
  }

  start(): void {
    this.schedulingService.start();
  }

  pause(): void {
    this.schedulingService.pause();
  }

  resume(): void {
    this.schedulingService.resume();
  }

  reset(): void {
    this.schedulingService.reset();
  }

  startReplay(): void {
    this.schedulingService.startReplay();
  }

  setSpeed(speed: number): void {
    this.schedulingService.setSpeed(speed);
  }

  onTotalDaysChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (value > 0) {
      this.schedulingService.setTotalDays(value);
    }
  }

  jumpToDay(): void {
    const day = this.jumpDayInput();
    if (day >= 0 && day <= this.totalDays()) {
      this.schedulingService.jumpToDay(day);
    }
  }

  checkOverAllocation(): void {
    const result = this.schedulingService.checkOverAllocation();
    if (result.hasRisk) {
      alert('超配风险：' + result.reason);
    } else {
      alert('✓ 无超配风险，当前计划安全');
    }
  }

  loadDemo(): void {
    this.schedulingService.loadDemoData();
  }

  getMarkers(): number[] {
    const total = this.totalDays();
    if (total <= 10) {
      return Array.from({ length: total + 1 }, (_, i) => i);
    }
    const step = Math.ceil(total / 10);
    const markers: number[] = [];
    for (let i = 0; i <= total; i += step) {
      markers.push(i);
    }
    if (markers[markers.length - 1] !== total) {
      markers.push(total);
    }
    return markers;
  }
}
