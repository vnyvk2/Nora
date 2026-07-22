import { store } from '../store/store';
import storage from '../utils/localStorage';
import PlayerQueue from './playerQueue';

export type QueuesManagerEvent = 'activeQueueChanged' | 'queuesChanged';
type QueuesManagerCallback = () => void;

type QueueStoreState = {
  localStorage?: LocalStorage;
};

type QueueSubscriptionState =
  | QueueStoreState
  | {
      currentVal?: QueueStoreState;
      prevVal?: QueueStoreState;
    };

const getQueueSubscriptionState = (subscriptionState: QueueSubscriptionState): QueueStoreState => {
  if ('currentVal' in subscriptionState && subscriptionState.currentVal) {
    return subscriptionState.currentVal;
  }
  return subscriptionState as QueueStoreState;
};

export class QueuesManager {
  queues: PlayerQueue[];
  activeQueueIndex: number;
  private isSettingUpSync = false;
  private isSyncingFromStore = false;
  private listeners: Map<QueuesManagerEvent, Set<QueuesManagerCallback>>;
  private activeQueueUnsubscribe: (() => void)[] = [];

  constructor() {
    this.queues = [];
    this.activeQueueIndex = 0;
    this.listeners = new Map();
  }

  on(event: QueuesManagerEvent, callback: QueuesManagerCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  private emit(event: QueuesManagerEvent) {
    this.listeners.get(event)?.forEach((cb) => cb());
  }

  initialize() {
    const storedState = storage.queue.getQueue();
    if (storedState && storedState.queues && storedState.queues.length > 0) {
      this.queues = storedState.queues.map((q) => PlayerQueue.fromJSON(q));
      this.activeQueueIndex =
        storedState.currentQueueIndex >= 0 && storedState.currentQueueIndex < this.queues.length
          ? storedState.currentQueueIndex
          : 0;
    } else {
      this.queues = [new PlayerQueue()];
      this.activeQueueIndex = 0;
    }

    this.bindActiveQueueEvents();

    if (!this.isSettingUpSync) {
      this.setupStoreSync();
    }
  }

  getActiveQueue(): PlayerQueue {
    if (this.queues.length === 0) {
      this.queues.push(new PlayerQueue());
      this.activeQueueIndex = 0;
    }
    return this.queues[this.activeQueueIndex];
  }

  getQueues(): PlayerQueue[] {
    return this.queues;
  }

  createQueue(name?: string, songIds: number[] = []): PlayerQueue {
    const newQueue = new PlayerQueue(songIds, 0, undefined, { title: name || `Queue ${this.queues.length + 1}` });
    this.queues.push(newQueue);
    this.emit('queuesChanged');
    this.triggerStoreSync();
    return newQueue;
  }

  switchQueue(index: number) {
    if (index >= 0 && index < this.queues.length && index !== this.activeQueueIndex) {
      this.activeQueueIndex = index;
      this.bindActiveQueueEvents();
      this.emit('activeQueueChanged');
      this.triggerStoreSync();
    }
  }

  deleteQueue(index: number) {
    if (index >= 0 && index < this.queues.length) {
      this.queues.splice(index, 1);

      if (this.queues.length === 0) {
        this.queues.push(new PlayerQueue());
      }

      let activeQueueChanged = false;

      if (this.activeQueueIndex >= this.queues.length) {
        this.activeQueueIndex = this.queues.length - 1;
        activeQueueChanged = true;
      } else if (index < this.activeQueueIndex) {
        this.activeQueueIndex -= 1;
      } else if (index === this.activeQueueIndex) {
        activeQueueChanged = true;
      }

      this.bindActiveQueueEvents();
      this.emit('queuesChanged');
      
      if (activeQueueChanged) {
        this.emit('activeQueueChanged');
      }

      this.triggerStoreSync();
    }
  }

  renameQueue(index: number, newName: string) {
    if (index >= 0 && index < this.queues.length) {
      const queue = this.queues[index];
      const metadata = queue.getMetadata();
      const updatedMetadata = { ...metadata, title: newName };
      queue.setMetadata(updatedMetadata.queueId, updatedMetadata.queueType, updatedMetadata.title);
      this.emit('queuesChanged');
      this.triggerStoreSync();
    }
  }

  private bindActiveQueueEvents() {
    this.activeQueueUnsubscribe.forEach((unsub) => unsub());
    this.activeQueueUnsubscribe = [];

    const queue = this.getActiveQueue();

    const onChange = () => {
      this.triggerStoreSync();
    };

    this.activeQueueUnsubscribe.push(queue.on('queueChange', onChange));
    this.activeQueueUnsubscribe.push(queue.on('positionChange', onChange));
  }

  private triggerStoreSync() {
    if (this.isSyncingFromStore) return;

    store.setState((state) => ({
      ...state,
      localStorage: {
        ...state.localStorage,
        queue: {
          queues: this.queues.map((q) => q.toJSON()),
          currentQueueIndex: this.activeQueueIndex
        }
      }
    }));

    storage.queue.setQueue({
      queues: this.queues.map((q) => q.toJSON()),
      currentQueueIndex: this.activeQueueIndex
    });
  }

  private setupStoreSync() {
    if (this.isSettingUpSync) return;
    this.isSettingUpSync = true;

    store.subscribe((state) => {
      const currentState = getQueueSubscriptionState(state as QueueSubscriptionState);
      const storeQueuesState = currentState.localStorage?.queue;

      if (!storeQueuesState) return;

      const storeActiveIndex = storeQueuesState.currentQueueIndex;
      const storeActiveQueue = storeQueuesState.queues[storeActiveIndex];
      if (!storeActiveQueue) return;

      const activeQueue = this.getActiveQueue();
      const queueSongIds = activeQueue.getAllSongIds();
      const storeSongIds = storeActiveQueue.songIds;

      const queueChanged = JSON.stringify(queueSongIds) !== JSON.stringify(storeSongIds);
      const positionChanged = activeQueue.position !== storeActiveQueue.position;
      
      const queuesLengthChanged = this.queues.length !== storeQueuesState.queues.length;

      if (queueChanged || positionChanged || queuesLengthChanged) {
        this.isSyncingFromStore = true;

        try {
          if (queuesLengthChanged) {
            this.queues = storeQueuesState.queues.map((q) => PlayerQueue.fromJSON(q));
            this.activeQueueIndex = storeActiveIndex;
            this.bindActiveQueueEvents();
            this.emit('queuesChanged');
            this.emit('activeQueueChanged');
          } else {
             activeQueue.replaceQueue(
              storeSongIds,
              storeActiveQueue.position,
              false,
              storeActiveQueue.metadata
            );
          }
        } finally {
          this.isSyncingFromStore = false;
        }
      }
    });
  }

  removeAllListeners() {
    this.listeners.clear();
    this.activeQueueUnsubscribe.forEach((unsub) => unsub());
    this.activeQueueUnsubscribe = [];
  }
}

let managerInstance: QueuesManager | null = null;

export function initializeQueuesManager(): QueuesManager {
  if (managerInstance) return managerInstance;
  managerInstance = new QueuesManager();
  managerInstance.initialize();
  return managerInstance;
}

export function getQueuesManager(): QueuesManager {
  if (!managerInstance) {
    return initializeQueuesManager();
  }
  return managerInstance;
}

export function resetQueuesManagerForTesting() {
  if (managerInstance) {
    managerInstance.removeAllListeners();
    managerInstance = null;
  }
}
