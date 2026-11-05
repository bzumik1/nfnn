export type SheetRelease = 'dismiss' | 'return';

const MINIMUM_CLOSING_DISTANCE_PX = 72;
const CLOSING_SHARE_OF_HEIGHT = 0.25;
const FLICK_SPEED_PX_PER_MS = 0.5;
const FLICK_DISTANCE_PX = 24;

export class SheetDrag {
  private startY: number | null = null;
  private offset = 0;
  private lastY = 0;
  private lastTime = 0;
  private speed = 0;

  start(y: number, time: number): void {
    this.startY = y;
    this.offset = 0;
    this.lastY = y;
    this.lastTime = time;
    this.speed = 0;
  }

  move(y: number, time: number): number {
    if (this.startY === null) {
      return 0;
    }
    const elapsed = time - this.lastTime;
    if (elapsed > 0) {
      this.speed = (y - this.lastY) / elapsed;
    }
    this.lastY = y;
    this.lastTime = time;
    this.offset = Math.max(0, y - this.startY);
    return this.offset;
  }

  end(height: number): SheetRelease {
    const offset = this.offset;
    const dragging = this.startY !== null;
    this.startY = null;
    this.offset = 0;
    if (!dragging) {
      return 'return';
    }
    const closingDistance = Math.max(MINIMUM_CLOSING_DISTANCE_PX, height * CLOSING_SHARE_OF_HEIGHT);
    const flicked = this.speed >= FLICK_SPEED_PX_PER_MS && offset >= FLICK_DISTANCE_PX;
    return offset >= closingDistance || flicked ? 'dismiss' : 'return';
  }
}
