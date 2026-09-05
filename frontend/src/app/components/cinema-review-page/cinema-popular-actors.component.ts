import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CinemaService } from 'src/app/services/cinema.service';
import { CinemaPopularActor } from 'src/app/models/responses/cinema-response';

// Full-screen "Top 50 Actors" ranking (TMDb-wide, not scoped to any single
// title) - opened by tapping a cast member's popularity number. Directors
// aren't included yet (see backend getPopularActors comment for why).
@Component({
  selector: 'app-cinema-popular-actors',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cinema-popular-actors.component.html',
  styleUrl: './cinema-popular-actors.component.css',
})
export class CinemaPopularActorsComponent implements OnInit {
  @Output() back = new EventEmitter<void>();

  actors: CinemaPopularActor[] = [];
  isLoading = true;

  constructor(private cinemaService: CinemaService) {}

  ngOnInit(): void {
    this.cinemaService.getPopularActors().subscribe({
      next: (res) => {
        this.actors = res.data;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      },
    });
  }
}
