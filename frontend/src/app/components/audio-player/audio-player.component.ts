import { CommonModule } from '@angular/common';
import {
  Component,
  ViewChild,
  ElementRef,
  AfterViewInit,
  Input,
  EventEmitter,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Album } from 'src/app/models/responses/album-response';
import { Artist } from 'src/app/models/responses/artist-response';
import { Song } from 'src/app/models/responses/song-response';

@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class AudioPlayerComponent implements AfterViewInit {
  @ViewChild('myAudio') myAudioRef!: ElementRef<HTMLAudioElement>;

  @Input() record!: Album | Artist | Song;
  @Input() showForwardAndBackwardButtons: boolean = true;
  @Input() currentIndex!: number;
  @Input() recordList: (Album | Artist | Song)[] = [];
  @Input() song: Song | null = null;

  @Output() playStatus = new EventEmitter<boolean>();
  @Output() next = new EventEmitter<void>();
  @Output() previous = new EventEmitter<void>();
  @Output() playStarted = new EventEmitter<string>(); // string = track ID or URL

  audio!: HTMLAudioElement;
  isPlaying: boolean = false;
  audioDuration: number = 0;
  currentTime: number = 0;
  isLoading: boolean = true;

  onNextClick() {
    this.isPlaying = false;
    this.isLoading = true;
    this.next.emit();
  }

  onPreviousClick() {
    this.isPlaying = false;
    this.isLoading = true;
    this.previous.emit();
  }

  ngAfterViewInit() {
    if (this.myAudioRef) {
      this.audio = this.myAudioRef.nativeElement;

      this.audio.addEventListener(
        'loadedmetadata',
        this.updateMetadata.bind(this)
      );
      this.audio.addEventListener('timeupdate', this.updateTime.bind(this));

      // Listen for when the song ends
      this.audio.addEventListener('ended', () => {
        this.isPlaying = false;
        this.playStatus.emit(false);
      });
    }
  }

togglePlay(): void {
  const preview = this.song?.preview || this.record?.preview;

  if (!this.audio || !preview) {
    console.warn('🎧 No audio preview available to play.');
    return;
  }

  if (!this.audio.src || this.audio.src !== preview) {
    this.setSource(preview);
    return; // this is fine now — setSource will trigger playback when ready
  }

  if (this.audio.paused) {
    this.audio.play()
      .then(() => {
        this.isPlaying = true;
        this.playStatus.emit(true);
        if (this.record?.type !== 'Song') {
          this.playStarted.emit(preview);
        }
      })
      .catch((err) => {
        console.error('Failed to play:', err.message);
      });
  } else {
    this.audio.pause();
    this.isPlaying = false;
    this.playStatus.emit(false);
  }
}

  public stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.isPlaying = false;
      this.playStatus.emit(false);
    }
  }

  setSource(previewUrl: string, autoPlay: boolean = true) {
    const audio = this.myAudioRef.nativeElement;
    audio.pause();
    audio.src = previewUrl;
    audio.load();

    audio.oncanplaythrough = () => {
      audio.oncanplaythrough = null; // prevent multiple fires

      if (autoPlay) {
        this.isPlaying = true;
        audio.play().catch((err) => {
          console.error('❌ Playback failed:', err.message);
        });
        this.playStatus.emit(true);
        this.playStarted.emit(previewUrl);
      } else {
        this.isPlaying = false;
        this.playStatus.emit(false);
      }
    };
  }

  public stopLoading(): void {
    this.isLoading = false;
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
