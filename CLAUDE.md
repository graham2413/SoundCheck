# Project notes for Claude

## Image loading

Any new `<img>` added to the frontend (cover art, posters, avatars, etc.)
must use this app's existing image-loader pattern, not a bare `<img>` tag.
It's already used throughout (e.g. `calendar-page.component.html`,
`notifications-page.component.html`, `top-three-podium.component.html`):

```html
<div class="relative <size classes> overflow-hidden rounded-md bg-gray-800">
  <div *ngIf="!imageLoaded[item.id]" class="absolute inset-0 flex items-center justify-center">
    <div class="w-4 h-4 border-t-2 border-white rounded-full animate-spin"></div>
  </div>
  <img
    [src]="item.cover"
    [alt]="item.title"
    loading="lazy"
    (load)="imageLoaded[item.id] = true"
    (error)="imageLoaded[item.id] = true"
    [class.invisible]="!imageLoaded[item.id]"
    class="w-full h-full object-cover"
  />
</div>
```

- `imageLoaded` is a component field: `{ [id: string]: boolean } = {}`, keyed
  by whatever stable id the item has (so a cover already loaded doesn't
  re-show the spinner if it reappears elsewhere in the same view).
- The sized/bordered/rounded box is the *wrapper* div, not the `<img>` -
  the image just fills it via `w-full h-full object-cover`.
- `(error)` also flips `imageLoaded` to `true` (not just `(load)`) so a
  broken image doesn't leave the spinner stuck forever.
