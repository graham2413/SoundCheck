import { CommonModule } from '@angular/common';
import { Component, ViewChild, ElementRef, AfterViewInit, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class AudioPlayerComponent implements AfterViewInit {
  @ViewChild('myAudio') myAudioRef!: ElementRef<HTMLAudioElement>;
  @Input() record: any;

  audio!: HTMLAudioElement;
  isPlaying: boolean = false;
  audioDuration: number = 0;
  currentTime: number = 0;

  ngAfterViewInit() {
    if (this.myAudioRef) {
      this.audio = this.myAudioRef.nativeElement;

      this.audio.addEventListener('loadedmetadata', this.updateMetadata.bind(this));
      this.audio.addEventListener('timeupdate', this.updateTime.bind(this));
    }
  }

  togglePlay() {
    if (this.audio) {
      this.isPlaying = !this.isPlaying;
      this.isPlaying ? this.audio.play() : this.audio.pause();
    }
  }

  seekAudio() {
    if (this.audio) {
      this.audio.currentTime = this.currentTime;
    }
  }

  updateMetadata() {
    this.audioDuration = this.audio.duration;
  }

  updateTime() {
    this.currentTime = this.audio.currentTime;
  }

  formatTime(time: number): string {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }
}
