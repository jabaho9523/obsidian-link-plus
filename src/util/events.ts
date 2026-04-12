type Listener<T> = (payload: T) => void;

export class TypedEventBus<Events extends Record<string, unknown>> {
	private listeners: Partial<{ [K in keyof Events]: Set<Listener<Events[K]>> }> = {};

	on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
		let set = this.listeners[event];
		if (!set) {
			set = new Set();
			this.listeners[event] = set;
		}
		set.add(fn);
		return () => {
			set?.delete(fn);
		};
	}

	emit<K extends keyof Events>(event: K, payload: Events[K]): void {
		const set = this.listeners[event];
		if (!set) return;
		for (const fn of set) {
			try {
				fn(payload);
			} catch (e) {
				console.warn("[Link Plus] event listener error", e);
			}
		}
	}

	clear(): void {
		this.listeners = {};
	}
}
