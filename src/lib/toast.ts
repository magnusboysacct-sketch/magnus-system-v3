type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

type ToastListener = (toasts: Toast[]) => void;

class ToastManager {
  private toasts: Toast[] = [];
  private listeners: ToastListener[] = [];
  private idCounter = 0;

  subscribe(listener: ToastListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener([...this.toasts]));
  }

  private addToast(type: ToastType, message: string, duration = 5000) {
    const id = `toast-${++this.idCounter}`;
    const toast: Toast = { id, type, message, duration };

    this.toasts.push(toast);
    this.notify();

    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }

    return id;
  }

  success(message: string, duration?: number) {
    return this.addToast("success", message, duration);
  }

  error(message: string, duration?: number) {
    return this.addToast("error", message, duration);
  }

  warning(message: string, duration?: number) {
    return this.addToast("warning", message, duration);
  }

  info(message: string, duration?: number) {
    return this.addToast("info", message, duration);
  }

  remove(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  clear() {
    this.toasts = [];
    this.notify();
  }
}

export const toast = new ToastManager();
