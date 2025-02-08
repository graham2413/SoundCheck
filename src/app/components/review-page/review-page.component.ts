import { Component, input, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-review-page',
  templateUrl: './review-page.component.html',
  styleUrls: ['./review-page.component.css']
})
export class ReviewPageComponent {
  @Input() record: any;
  @Input() type: string = '';

  constructor(public activeModal: NgbActiveModal) {}

  close() {
    this.activeModal.close();
  }
  ngAfterViewInit() {
  setTimeout(() => {
    const modal = document.querySelector('.modal-dialog') as HTMLElement;
    if (modal) {
      modal.style.width = '90vw';
      modal.style.minWidth = '90vw';
    }
  }, 50);
}

}
