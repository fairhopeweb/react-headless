import { useAbly } from '../hooks/useAbly';
import useMagicBellEvent from '../hooks/useMagicBellEvent';
import { useNotificationStoresCollection } from '../stores/notifications';
import IRemoteNotification from '../types/IRemoteNotification';

/**
 * Component that setups a listener to realtime events and keeps notifications
 * stores up to date.
 *
 * @example <RealtimeListener />
 */
export default function RealtimeListener() {
  const collection = useNotificationStoresCollection();

  const fetchAndResetAll = () => collection.fetchAllStores({ page: 1 }, { reset: true });
  const fetchAll = () => collection.fetchAllStores({ page: 1 });
  const markAllAsSeen = () => collection.markAllAsSeen({ persist: false });
  const markAllAsRead = () => collection.markAllAsRead({ persist: false });
  const removeNotification = (data: IRemoteNotification) => collection.deleteNotification(data.id, { persist: false });

  useAbly();

  useMagicBellEvent('wakeup', fetchAndResetAll);
  useMagicBellEvent('notifications.new', fetchAll);
  useMagicBellEvent('notifications.seen.all', markAllAsSeen);
  useMagicBellEvent('notifications.read.all', markAllAsRead);
  useMagicBellEvent('notifications.read', fetchAndResetAll);
  useMagicBellEvent('notifications.unread', fetchAndResetAll);
  useMagicBellEvent('notifications.delete', removeNotification);

  return null;
}
