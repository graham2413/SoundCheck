import { Injectable, Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'timeAgo',
  standalone: true,
})
@Injectable({ providedIn: 'root' })
export class TimeAgoPipe implements PipeTransform {
  transform(value: string | Date): string {
    const date = new Date(value);
    const seconds = Math.floor((+new Date() - +date) / 1000);

    const intervals: { [key: string]: number } = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60,
      second: 1,
    };

    for (const key in intervals) {
      const interval = Math.floor(seconds / intervals[key]);
      if (interval >= 1) {
        return `${interval} ${key}${interval !== 1 ? 's' : ''} ago`;
      }
    }

    return 'just now';
  }
}