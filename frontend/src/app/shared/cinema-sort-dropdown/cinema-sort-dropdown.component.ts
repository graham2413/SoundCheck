import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface CinemaDropdownOption {
  value: string;
  label: string;
}

// Generic "modern" custom dropdown (trigger button + floating panel) reused
// wherever a native <select> would otherwise look out of place on the
// cinema detail page - visually identical to the Episodes tab's season
// dropdown (see cinema-episodes-tab.component.css), just generalized to any
// value/label option list instead of season numbers.
@Component({
  selector: 'app-cinema-sort-dropdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cinema-sort-dropdown.component.html',
  styleUrls: ['./cinema-sort-dropdown.component.css'],
})
export class CinemaSortDropdownComponent {
  @Input() options: CinemaDropdownOption[] = [];
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();

  isOpen = false;

  get selectedLabel(): string {
    return this.options.find((o) => o.value === this.value)?.label ?? '';
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
  }

  select(value: string): void {
    this.isOpen = false;
    if (value === this.value) return;
    this.value = value;
    this.valueChange.emit(value);
  }
}
