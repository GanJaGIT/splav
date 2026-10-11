/** UI-01: the loading screen from index.html. */
export class LoadingScreen {
  private readonly root = document.getElementById('loading');
  private readonly bar = document.getElementById('loading-bar');

  progress(fraction: number): void {
    if (this.bar) this.bar.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  }

  /** Removed before LoadingAPI.ready(): no loading screen may remain at that moment (YG-02). */
  done(): void {
    this.progress(1);
    this.root?.remove();
  }
}
