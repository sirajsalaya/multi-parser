class Counter {
  private value = 0;
  private listeners = new Set<() => void>();

  increment(): void {
    this.value += 1;
  }

  decrement(): void {
    this.value -= 1;
    if (this.value <= 0) {
      this.value = 0;
      const queued = [...this.listeners];
      this.listeners.clear();
      for (const listener of queued) {
        listener();
      }
    }
  }

  isZero(): boolean {
    return this.value === 0;
  }

  onceZero(listener: () => void): void {
    if (this.isZero()) {
      listener();
      return;
    }
    this.listeners.add(listener);
  }
}

export default Counter;
