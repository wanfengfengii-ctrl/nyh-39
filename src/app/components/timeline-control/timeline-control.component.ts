import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SchedulingService } from '../../services/scheduling.service';
import { WeatherType, SeasonType, DailyClimate } from '../../models/ice.models';

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
  readonly climates = computed(() => this.schedulingService.climates());

  readonly currentClimate = computed(() => {
    const day = this.state().currentDay;
    return this.schedulingService.getClimateForDay(day);
  });

  readonly currentClimateImpact = computed(() => {
    return this.schedulingService.calculateClimateImpact(this.currentClimate());
  });

  readonly heatWarningDays = computed(() => {
    return this.climates()
      .filter(c => c.hasHeatWarning)
      .map(c => c.day);
  });

  readonly weatherIcons: Record<WeatherType, string> = {
    sunny: '☀️',
    cloudy: '⛅',
    rainy: '🌧️',
    snowy: '❄️',
    hot_wave: '🔥',
    cool: '🍃',
    freezing: '🥶',
  };

  readonly seasonNames: Record<SeasonType, string> = {
    spring: '春',
    summer: '夏',
    autumn: '秋',
    winter: '冬',
  };

  constructor(private schedulingService: SchedulingService) {}

  get progressPercent(): number {
    if (this.totalDays() === 0) return 0;
    return (this.state().currentDay / this.totalDays()) * 100;
  }

  getWeatherIcon(weather: WeatherType): string {
    return this.weatherIcons[weather] || '🌡️';
  }

  getSeasonName(season: SeasonType): string {
    return this.seasonNames[season] || season;
  }

  getHeatWarningLevelColor(level?: string): string {
    switch (level) {
      case 'red': return '#f44336';
      case 'orange': return '#ff9800';
      case 'yellow': return '#ffc107';
      default: return '#999';
    }
  }

  getClimateSummary(climate: DailyClimate | null): string {
    if (!climate) return '暂无气候数据';
    return `${this.getSeasonName(climate.season)}季 · ${climate.temperature}°C · ${this.getWeatherIcon(climate.weather)}`;
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

  getHeatWarningMarkerStyle(day: number): { [key: string]: string } {
    const climate = this.climates().find(c => c.day === day);
    const color = climate ? this.getHeatWarningLevelColor(climate.heatWarningLevel) : '#ffc107';
    return {
      left: `${(day / this.totalDays()) * 100}%`,
      backgroundColor: color,
    };
  }
}
