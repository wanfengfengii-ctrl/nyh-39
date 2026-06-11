import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NodeConfigComponent } from './components/node-config/node-config.component';
import { PlanConfigComponent } from './components/plan-config/plan-config.component';
import { NetworkVisualizationComponent } from './components/network-visualization/network-visualization.component';
import { TimelineControlComponent } from './components/timeline-control/timeline-control.component';
import { StatsLogComponent } from './components/stats-log/stats-log.component';
import { SchedulingService } from './services/scheduling.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    NodeConfigComponent,
    PlanConfigComponent,
    NetworkVisualizationComponent,
    TimelineControlComponent,
    StatsLogComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = '古冰窖调度模拟器';

  constructor(private schedulingService: SchedulingService) {}

  ngOnInit(): void {
    setTimeout(() => {
      this.schedulingService.loadDemoData();
    }, 100);
  }
}
