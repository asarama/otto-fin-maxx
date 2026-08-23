export type ToastKind = 'ok' | 'error';

export type Toast = {
	id: number;
	kind: ToastKind;
	message: string;
};

const TIMEOUT_MS = 6000;

class ToastStore {
	toasts = $state<Toast[]>([]);
	private nextId = 0;

	add(kind: ToastKind, message: string) {
		const id = this.nextId++;
		this.toasts.push({ id, kind, message });
		setTimeout(() => this.dismiss(id), TIMEOUT_MS);
	}

	dismiss(id: number) {
		this.toasts = this.toasts.filter((toast) => toast.id !== id);
	}
}

export const toastStore = new ToastStore();
