import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SchedulingService } from '../../services/scheduling.service';
import { DailyClimate, WeatherType, SeasonType } from '../../models/ice.models';

@Component({
  selector: 'app-weather-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './weather-config.component.html',
  styleUrl: './weather-config.component.scss',
})
export class WeatherConfigComponent {
  showAddClimate = signal(false);
  editingClimateId = signal<string | null>(null);

  newClimate = {
    day: 1,
    temperature: 25,
    weather: 'sunny' as WeatherType,
    season: 'summer' as SeasonType,
    seasonEvent: '',
    hasHeatWarning: false,
    heatWarningLevel: 'yellow' as 'yellow' | 'orange' | 'red',
    description: '',
  };

  readonly climates = computed(() => this.schedulingService.climates());
  readonly state = computed(() => this.schedulingService.state());

  readonly weatherOptions: { value: WeatherType; label: string; icon: string }[] = [
    { value: 'sunny', label: '晴', icon: '☀️' },
    { value: 'cloudy', label: '多云', icon: '⛅' },
    { value: 'rainy', label: '雨', icon: '🌧️' },
    { value: 'snowy', label: '雪', icon: '❄️' },
    { value: 'hot_wave', label: '热浪', icon: '🔥' },
    { value: 'cool', label: '凉爽', icon: '🍃' },
    { value: 'freezing', label: '严寒', icon: '🥶' },
  ];

  readonly seasonOptions: { value: SeasonType; label: string }[] = [
    { value: 'spring', label: '春' },
    { value: 'summer', label: '夏' },
    { value: 'autumn', label: '秋' },
    { value: 'winter', label: '冬' },
  ];

  readonly heatWarningLevels: { value: 'yellow' | 'orange' | 'red'; label: string; color: string }[] = [
    { value: 'yellow', label: '黄色预警', color: '#ffc107' },
    { value: 'orange', label: '橙色预警', color: '#ff9800' },
    { value: 'red', label: '红色预警', color: '#f44336' },
  ];

  constructor(private schedulingService: SchedulingService) {}

  getWeatherLabel(weather: WeatherType): string {
    return this.weatherOptions.find(w => w.value === weather)?.label || weather;
  }

  getWeatherIcon(weather: WeatherType): string {
    return this.weatherOptions.find(w => w.value === weather)?.icon || '🌡️';
  }

  getSeasonLabel(season: SeasonType): string {
    return this.seasonOptions.find(s => s.value === season)?.label || season;
  }

  getHeatWarningLabel(level?: string): string {
    if (!level) return '';
    return this.heatWarningLevels.find(l => l.value === level)?.label || level;
  }

  getHeatWarningColor(level?: string): string {
    if (!level) return '#999';
    return this.heatWarningLevels.find(l => l.value === level)?.color || '#999';
  }

  toggleAddClimate(): void {
    this.showAddClimate.set(!this.showAddClimate());
    this.editingClimateId.set(null);
    this.resetForm();
  }

  resetForm(): void {
    this.newClimate = {
      day: 1,
      temperature: 25,
      weather: 'sunny',
      season: 'summer',
      seasonEvent: '',
      hasHeatWarning: false,
      heatWarningLevel: 'yellow',
      description: '',
    };
  }

  editClimate(climate: DailyClimate): void {
    this.showAddClimate.set(true);
    this.editingClimateId.set(climate.id);
    this.newClimate = {
      day: climate.day,
      temperature: climate.temperature,
      weather: climate.weather,
      season: climate.season,
      seasonEvent: climate.seasonEvent || '',
      hasHeatWarning: climate.hasHeatWarning,
      heatWarningLevel: climate.heatWarningLevel || 'yellow',
      description: climate.description || '',
    };
  }

  saveClimate(): void {
    if (this.newClimate.day < 1 || this.newClimate.day > this.state().totalDays) {
      alert(`日期必须在 1 到 ${this.state().totalDays} 之间`);
      return;
    }

    if (this.editingClimateId()) {
      this.schedulingService.updateClimate(this.editingClimateId()!, {
        ...this.newClimate,
        seasonEvent: this.newClimate.seasonEvent || undefined,
        description: this.newClimate.description || undefined,
        heatWarningLevel: this.newClimate.hasHeatWarning ? this.newClimate.heatWarningLevel : undefined,
      });
    } else {
      const existing = this.climates().find(c => c.day === this.newClimate.day);
      if (existing) {
        if (!confirm(`第 ${this.newClimate.day} 天已有气候配置，是否覆盖？`)) {
          return;
        }
        this.schedulingService.removeClimate(existing.id);
      }
      this.schedulingService.addClimate({
        ...this.newClimate,
        seasonEvent: this.newClimate.seasonEvent || undefined,
        description: this.newClimate.description || undefined,
        heatWarningLevel: this.newClimate.hasHeatWarning ? this.newClimate.heatWarningLevel : undefined,
      });
    }

    this.showAddClimate.set(false);
    this.editingClimateId.set(null);
    this.resetForm();
  }

  removeClimate(id: string): void {
    if (confirm('确定要删除此气候配置吗？')) {
      this.schedulingService.removeClimate(id);
    }
  }

  getClimateImpactPreview(day: number): string {
    const climate = this.schedulingService.getClimateForDay(day);
    const impact = this.schedulingService.calculateClimateImpact(climate);
    return this.formatImpactPreview(impact);
  }

  getFormClimateImpactPreview(): string {
    const climate: DailyClimate = {
      id: 'preview',
      day: this.newClimate.day,
      temperature: this.newClimate.temperature,
      weather: this.newClimate.weather,
      season: this.newClimate.season,
      seasonEvent: this.newClimate.seasonEvent || undefined,
      hasHeatWarning: this.newClimate.hasHeatWarning,
      heatWarningLevel: this.newClimate.hasHeatWarning ? this.newClimate.heatWarningLevel : undefined,
      description: this.newClimate.description || undefined,
    };
    const impact = this.schedulingService.calculateClimateImpact(climate);
    return this.formatImpactPreview(impact);
  }

  private formatImpactPreview(impact: { lossRateMultiplier: number; demandMultiplier: number; travelTimeMultiplier: number; capacityMultiplier: number }): string {
    const parts: string[] = [];
    if (impact.lossRateMultiplier !== 1) {
      parts.push(`损耗${impact.lossRateMultiplier > 1 ? '↑' : '↓'}${((impact.lossRateMultiplier - 1) * 100).toFixed(0)}%`);
    }
    if (impact.demandMultiplier !== 1) {
      parts.push(`需求${impact.demandMultiplier > 1 ? '↑' : '↓'}${((impact.demandMultiplier - 1) * 100).toFixed(0)}%`);
    }
    if (impact.travelTimeMultiplier !== 1) {
      parts.push(`运输${impact.travelTimeMultiplier > 1 ? '↑' : '↓'}${((impact.travelTimeMultiplier - 1) * 100).toFixed(0)}%`);
    }
    if (impact.capacityMultiplier !== 1) {
      parts.push(`容量${impact.capacityMultiplier > 1 ? '↑' : '↓'}${((impact.capacityMultiplier - 1) * 100).toFixed(0)}%`);
    }
    return parts.length > 0 ? parts.join(' | ') : '无显著影响';
  }

  generateBatchClimates(): void {
    const totalDays = this.state().totalDays;
    if (!confirm(`确定要为全部 ${totalDays} 天自动生成气候数据吗？这将覆盖现有配置。`)) {
      return;
    }

    for (const c of this.climates()) {
      this.schedulingService.removeClimate(c.id);
    }

    for (let day = 1; day <= totalDays; day++) {
      let season: SeasonType = 'spring';
      let temperature = 15;
      let weather: WeatherType = 'sunny';
      let hasHeatWarning = false;
      let heatWarningLevel: 'yellow' | 'orange' | 'red' | undefined = undefined;
      let seasonEvent: string | undefined = undefined;

      const progress = day / totalDays;
      if (progress < 0.25) {
        season = 'spring';
        temperature = 10 + progress * 4 * 15 + Math.sin(day / 3) * 3;
        weather = day % 4 === 0 ? 'rainy' : day % 2 === 0 ? 'cloudy' : 'sunny';
      } else if (progress < 0.6) {
        season = 'summer';
        temperature = 25 + (progress - 0.25) * 2.857 * 15 + Math.sin(day / 4) * 4;
        weather = day % 5 === 0 ? 'cloudy' : day % 7 === 0 ? 'rainy' : 'sunny';

        if (temperature > 35) {
          hasHeatWarning = true;
          if (temperature > 39) {
            heatWarningLevel = 'red';
            seasonEvent = '极端高温';
          } else if (temperature > 37) {
            heatWarningLevel = 'orange';
          } else {
            heatWarningLevel = 'yellow';
          }
        }
      } else if (progress < 0.85) {
        season = 'autumn';
        temperature = 28 - (progress - 0.6) * 4 * 12 + Math.sin(day / 3) * 2;
        weather = day % 3 === 0 ? 'cloudy' : 'sunny';
      } else {
        season = 'winter';
        temperature = 5 - (progress - 0.85) * 6.667 * 8 + Math.sin(day / 2) * 3;
        weather = day % 5 === 0 ? 'snowy' : day % 3 === 0 ? 'cloudy' : 'sunny';
        if (temperature < -5) {
          weather = 'freezing';
        }
      }

      temperature = Math.round(temperature * 10) / 10;

      this.schedulingService.addClimate({
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

    alert(`已生成 ${totalDays} 天的气候数据`);
  }

  clearAllClimates(): void {
    if (!confirm('确定要清除所有气候配置吗？')) {
      return;
    }
    for (const c of this.climates()) {
      this.schedulingService.removeClimate(c.id);
    }
  }

  sortedClimates = computed(() => {
    return [...this.climates()].sort((a, b) => a.day - b.day);
  });
}
