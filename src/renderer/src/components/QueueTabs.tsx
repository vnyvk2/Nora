import { useCallback, useContext, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@tanstack/react-store';

import Button from './Button';
import { AppUpdateContext } from '../contexts/AppUpdateContext';
import { store, dispatch } from '../store/store';
import { getQueuesManager } from '../other/queuesManager';

export default function QueueTabs() {
  const { t } = useTranslation();
  const queueState = useStore(store, (state) => state.localStorage.queue);
  const manager = getQueuesManager();
  
  const { updateContextMenuData, addNewNotifications } = useContext(AppUpdateContext);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleSwitchQueue = useCallback((index: number) => {
    if (manager && index !== queueState.currentQueueIndex) {
      manager.switchQueue(index);
    }
  }, [manager, queueState.currentQueueIndex]);

  const handleCreateNewQueue = useCallback(() => {
    if (manager) {
      manager.createQueue();
      manager.switchQueue(manager.queues.length - 1);
      addNewNotifications([{
        id: `new-queue-${Date.now()}`,
        content: t('currentQueuePage.newQueueCreated', 'New queue created'),
        iconName: 'queue_music'
      }]);
      // Scroll to end
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
        }
      }, 100);
    }
  }, [manager, addNewNotifications, t]);

  const handleDeleteQueue = useCallback((index: number) => {
    if (manager && manager.queues.length > 1) {
      manager.deleteQueue(index);
      addNewNotifications([{
        id: `delete-queue-${Date.now()}`,
        content: t('currentQueuePage.queueDeleted', 'Queue deleted'),
        iconName: 'delete'
      }]);
    } else {
      addNewNotifications([{
        id: `delete-queue-failed`,
        content: t('currentQueuePage.cannotDeleteLastQueue', 'Cannot delete the last queue'),
        iconName: 'error'
      }]);
    }
  }, [manager, addNewNotifications, t]);

  return (
    <div className="queue-tabs-container relative flex items-center w-full my-4 mb-8 bg-background-color-2/50 dark:bg-dark-background-color-2/50 rounded-full p-1 shadow-inner overflow-hidden">
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-x-auto flex items-center scrollbar-hide no-scrollbar space-x-1"
        style={{ scrollBehavior: 'smooth' }}
      >
        {queueState.queues.map((q, index) => {
          const isActive = index === queueState.currentQueueIndex;
          const title = q.metadata?.title || (q.metadata?.queueType === 'songs' ? 'All Songs' : `Queue ${index + 1}`);
          
          return (
            <div 
              key={index}
              className={`flex-shrink-0 flex items-center rounded-full px-4 py-2 cursor-pointer transition-all duration-300 ease-in-out border
                ${isActive 
                  ? 'bg-background-color-3 dark:bg-dark-background-color-3 border-background-color-3 text-font-color-black dark:text-font-color-white shadow-md font-medium transform scale-100' 
                  : 'bg-transparent border-transparent text-font-color-black/60 dark:text-font-color-white/60 hover:bg-background-color-3/40 dark:hover:bg-dark-background-color-3/40 transform scale-95 hover:scale-100 hover:text-font-color-black dark:hover:text-font-color-white'
                }`}
              onClick={() => handleSwitchQueue(index)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                updateContextMenuData(true, [
                  {
                    label: t('currentQueuePage.renameQueue', 'Rename Queue'),
                    iconName: 'edit',
                    handlerFunction: () => {
                      // We can dispatch an event or use a prompt to rename the queue
                      // For now, we will use window.prompt as a quick fallback if prompt component isn't ready
                      const newTitle = window.prompt('Enter new queue name:', title);
                      if (newTitle && manager) {
                        manager.queues[index].setMetadata(manager.queues[index].metadata?.queueId, manager.queues[index].metadata?.queueType, newTitle);
                        // Save changes
                        dispatch({ type: 'UPDATE_QUEUE', data: { queues: manager.queues.map(queue => queue.toJSON()), currentQueueIndex: manager.activeQueueIndex } });
                      }
                    }
                  },
                  {
                    label: t('currentQueuePage.deleteQueue', 'Delete Queue'),
                    iconName: 'delete',
                    isDisabled: queueState.queues.length <= 1,
                    handlerFunction: () => handleDeleteQueue(index)
                  }
                ], e.pageX, e.pageY);
              }}
            >
              {isActive && (
                <span className="material-icons-round text-sm mr-2 animate-pulse text-font-color-highlight dark:text-dark-font-color-highlight">
                  equalizer
                </span>
              )}
              <span className="truncate max-w-[150px]">{title}</span>
            </div>
          );
        })}
      </div>
      
      <div className="flex-shrink-0 border-l border-background-color-3 dark:border-dark-background-color-3 ml-2 pl-2">
        <Button
          className="rounded-full w-8 h-8 flex items-center justify-center bg-background-color-3 dark:bg-dark-background-color-3 shadow-md hover:scale-105 transition-transform !m-0"
          iconName="add"
          iconClassName="text-xl"
          tooltipLabel={t('currentQueuePage.createNewQueue', 'Create New Queue')}
          clickHandler={handleCreateNewQueue}
        />
      </div>
    </div>
  );
}
