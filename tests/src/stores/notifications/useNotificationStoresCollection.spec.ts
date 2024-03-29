import { act, renderHook } from '@testing-library/react-hooks';
import dayjs from 'dayjs';
import faker from 'faker';
import humps from 'humps';
import { Response, Server } from 'miragejs';
import * as ajax from '../../../../src/lib/ajax';
import { useNotificationStoresCollection } from '../../../../src/stores/notifications';
import NotificationFactory from '../../../factories/NotificationFactory';

describe('stores', () => {
  describe('notifications', () => {
    let server;

    beforeEach(() => {
      server = new Server({ environment: 'test', urlPrefix: 'https://api.magicbell.com', timing: 50 });
    });

    afterEach(() => {
      server.shutdown();
    });

    describe('useNotificationStoresCollection', () => {
      describe('.setStore', () => {
        it('builds a store and sets it', () => {
          const { result } = renderHook(() => useNotificationStoresCollection());
          const storeId = faker.datatype.uuid();
          const defaultQueryParams = faker.helpers.createCard();

          act(() => {
            result.current.setStore(storeId, defaultQueryParams);
          });

          expect(result.current.stores[storeId]).toEqual({
            context: defaultQueryParams,
            total: 0,
            totalPages: 0,
            perPage: 0,
            currentPage: 1,
            unreadCount: 0,
            unseenCount: 0,
            notifications: [],
          });
        });
      });

      describe('.fetchStore', () => {
        describe('successful response', () => {
          beforeEach(() => {
            const response = {
              total: 5,
              currentPage: 2,
              perPage: 4,
              totalPages: 2,
              projectId: 7,
              unseenCount: 3,
              unreadCount: 2,
              notifications: NotificationFactory.buildList(1),
            };

            server.get('/notifications', humps.decamelizeKeys(response));
          });

          it('fetches a store from the MagicBell server', async () => {
            const spy = jest.spyOn(ajax, 'fetchAPI');
            const { result } = renderHook(() => useNotificationStoresCollection());
            const storeId = faker.datatype.uuid();
            const defaultQueryParams = { unread: true };

            await act(async () => {
              result.current.setStore(storeId, defaultQueryParams);
              await result.current.fetchStore(storeId, { page: 2 });
            });

            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenCalledWith('/notifications', { ...defaultQueryParams, page: 2 });
            spy.mockRestore();
          });

          it('updates the store with the response', async () => {
            const { result } = renderHook(() => useNotificationStoresCollection());
            const storeId = faker.datatype.uuid();
            const defaultQueryParams = faker.helpers.createCard();

            await act(async () => {
              result.current.setStore(storeId, defaultQueryParams);
              await result.current.fetchStore(storeId, { page: 2 });
            });

            expect(result.current.stores[storeId]).toMatchObject({
              context: defaultQueryParams,
              currentPage: 2,
              perPage: 4,
              totalPages: 2,
              projectId: 7,
              unseenCount: 3,
              unreadCount: 2,
            });
          });

          it('merges notifications', async () => {
            const notifications = NotificationFactory.buildList(4);
            const { result } = renderHook(() => useNotificationStoresCollection());
            const storeId = faker.datatype.uuid();
            const defaultQueryParams = faker.helpers.createCard();

            await act(async () => {
              result.current.setStore(storeId, defaultQueryParams, { notifications });
              await result.current.fetchStore(storeId, { page: 2 });
            });

            expect(result.current.stores[storeId].notifications).toHaveLength(5);

            expect(result.current.stores[storeId].notifications[0]).toEqual(notifications[0]);
            expect(result.current.stores[storeId].notifications[1]).toEqual(notifications[1]);
            expect(result.current.stores[storeId].notifications[2]).toEqual(notifications[2]);
            expect(result.current.stores[storeId].notifications[3]).toEqual(notifications[3]);
          });

          it('sets the fetch timestamp for the store', async () => {
            const now = new Date() as any;
            const spy = jest.spyOn(global, 'Date').mockImplementation(() => now);
            const { result } = renderHook(() => useNotificationStoresCollection());
            const storeId = faker.datatype.uuid();

            await act(async () => {
              result.current.setStore(storeId, {});
              await result.current.fetchStore(storeId, { page: 2 });
            });

            expect(result.current.stores[storeId].lastFetchedAt).toEqual(now);
            spy.mockRestore();
          });
        });

        describe('error handling', () => {
          beforeEach(() => {
            server.get('/notifications', new Response(403, {}, ''));
          });

          it('throws an error', async () => {
            expect.hasAssertions();
            const { result } = renderHook(() => useNotificationStoresCollection());

            await act(async () => {
              result.current.setStore('default', {});

              await expect(() => result.current.fetchStore('default')).rejects.toThrow(
                'Request failed with status code 403',
              );
            });
          });
        });
      });

      describe('.markNotificationAsSeen', () => {
        const notification = NotificationFactory.build({ seenAt: null });

        it('decreases the unseenCount prop of the store', async () => {
          const notifications = [...NotificationFactory.buildList(2), notification];
          const { result } = renderHook(() => useNotificationStoresCollection());

          await act(async () => {
            result.current.setStore('default', {}, { notifications, unreadCount: 1 });
            await result.current.markNotificationAsSeen(notification.id);
          });

          expect(result.current.stores['default'].unseenCount).toEqual(0);
        });

        it('marks the notification as seen', async () => {
          const now = Date.now();
          const spy = jest.spyOn(Date, 'now').mockImplementation(() => now);
          const { result } = renderHook(() => useNotificationStoresCollection());

          await act(async () => {
            result.current.setStore('default', {}, { notifications: [notification] });
            await result.current.markNotificationAsSeen(notification.id);
          });

          expect(result.current.stores['default'].notifications[0].seenAt).toEqual(now / 1000);
          spy.mockRestore();
        });
      });

      describe('.markNotificationAsRead', () => {
        describe('successful response', () => {
          const notification = NotificationFactory.build({ readAt: null });

          beforeEach(() => {
            server.post(`/notifications/${notification.id}/read`, new Response(204, {}, ''));
          });

          it('decreases the unreadCount prop of the store', async () => {
            const notifications = [...NotificationFactory.buildList(2), notification];
            const { result } = renderHook(() => useNotificationStoresCollection());

            await act(async () => {
              result.current.setStore('default', {}, { notifications, unreadCount: 1 });
              await result.current.markNotificationAsRead(notification.id);
            });

            expect(result.current.stores['default'].unreadCount).toEqual(0);
          });

          it('marks the notification as read', async () => {
            const now = Date.now();
            const spy = jest.spyOn(Date, 'now').mockImplementation(() => now);
            const { result } = renderHook(() => useNotificationStoresCollection());

            await act(async () => {
              result.current.setStore('default', {}, { notifications: [notification] });
              await result.current.markNotificationAsRead(notification.id);
            });

            expect(result.current.stores['default'].notifications[0].readAt).toEqual(now / 1000);
            spy.mockRestore();
          });
        });
      });

      describe('.markNotificationAsUnread', () => {
        describe('successful response', () => {
          const notification = NotificationFactory.build({ readAt: dayjs() });

          beforeEach(() => {
            server.post(`/notifications/${notification.id}/unread`, new Response(204, {}, ''));
          });

          it('decreases the unreadCount prop of the store', async () => {
            const { result } = renderHook(() => useNotificationStoresCollection());

            await act(async () => {
              result.current.setStore('default', {}, { notifications: [notification], unreadCount: 1 });
              await result.current.markNotificationAsUnread(notification.id);
            });

            expect(result.current.stores['default'].unreadCount).toEqual(2);
          });

          it('marks the notification as read', async () => {
            const { result } = renderHook(() => useNotificationStoresCollection());

            await act(async () => {
              result.current.setStore('default', {}, { notifications: [notification] });
              await result.current.markNotificationAsUnread(notification.id);
            });

            expect(result.current.stores['default'].notifications[0].readAt).toBeNull();
          });
        });
      });

      describe('.deleteNotification', () => {
        describe('successful response', () => {
          const notification = NotificationFactory.build();

          beforeEach(() => {
            server.delete(`/notifications/${notification.id}`, new Response(204, {}, ''));
          });

          describe('the notification is unread', () => {
            it('decreases the unreadCount prop of the store', async () => {
              const { result } = renderHook(() => useNotificationStoresCollection());
              const notifications = [{ ...notification, readAt: null }];

              await act(async () => {
                result.current.setStore('default', {}, { notifications, unreadCount: 1 });
                await result.current.deleteNotification(notification.id);
              });

              expect(result.current.stores['default'].unreadCount).toEqual(0);
            });
          });

          describe('the notification is read', () => {
            it('does not change the unreadCount prop of the store', async () => {
              const { result } = renderHook(() => useNotificationStoresCollection());
              const notifications = [{ ...notification, readAt: dayjs() }];

              await act(async () => {
                result.current.setStore('default', {}, { notifications, unreadCount: 1 });
                await result.current.deleteNotification(notification.id);
              });

              expect(result.current.stores['default'].unreadCount).toEqual(1);
            });
          });

          it('decreases the total prop of the store', async () => {
            const { result } = renderHook(() => useNotificationStoresCollection());

            await act(async () => {
              result.current.setStore('default', {}, { notifications: [notification], total: 1 });
              await result.current.deleteNotification(notification.id);
            });

            expect(result.current.stores['default'].total).toEqual(0);
          });

          it('removes the notification from the store', async () => {
            const { result } = renderHook(() => useNotificationStoresCollection());

            await act(async () => {
              result.current.setStore('default', {}, { notifications: [notification] });
              await result.current.deleteNotification(notification.id);
            });

            expect(result.current.stores['default'].notifications).toHaveLength(0);
          });
        });
      });

      describe('.markAllAsSeen', () => {
        describe('successful response', () => {
          beforeEach(() => {
            server.post('/notifications/seen', new Response(204, {}, ''));
          });

          it('makes a request to the server', async () => {
            const spy = jest.spyOn(ajax, 'postAPI');
            const { result } = renderHook(() => useNotificationStoresCollection());

            await act(async () => {
              result.current.setStore('read', {});
              await result.current.markAllAsSeen();
            });

            expect(spy).toHaveBeenCalledTimes(1);
            spy.mockRestore();
          });

          it('marks all notifications as seen', async () => {
            const now = Date.now();
            const spy = jest.spyOn(Date, 'now').mockImplementation(() => now);
            const notifications = NotificationFactory.buildList(3, { seenAt: null });

            const { result } = renderHook(() => useNotificationStoresCollection());

            await act(async () => {
              result.current.setStore('read', {}, { notifications });
              await result.current.markAllAsSeen();
            });

            const store = result.current.stores['read'];

            expect(store.notifications[0].seenAt).toEqual(now / 1000);
            expect(store.notifications[1].seenAt).toEqual(now / 1000);
            expect(store.notifications[2].seenAt).toEqual(now / 1000);
            spy.mockRestore();
          });

          describe('the updateModels options is false', () => {
            it('does not mark any notifications as seen', async () => {
              const notifications = NotificationFactory.buildList(3, { seenAt: null });
              const { result } = renderHook(() => useNotificationStoresCollection());

              await act(async () => {
                result.current.setStore('read', {}, { notifications });
                await result.current.markAllAsSeen({ updateModels: false });
              });

              const store = result.current.stores['read'];

              expect(store.notifications[0].seenAt).toBeNull();
              expect(store.notifications[1].seenAt).toBeNull();
              expect(store.notifications[2].seenAt).toBeNull();
            });
          });

          describe('the persist option is false', () => {
            it('does not make a request to the server', async () => {
              const spy = jest.spyOn(ajax, 'postAPI');
              const { result } = renderHook(() => useNotificationStoresCollection());

              await act(async () => {
                result.current.setStore('read', {});
                await result.current.markAllAsSeen({ persist: false });
              });

              expect(spy).not.toHaveBeenCalled();
              spy.mockRestore();
            });
          });
        });
      });

      describe('.markAllAsRead', () => {
        describe('successful response', () => {
          beforeEach(() => {
            server.post('/notifications/read', new Response(204, {}, ''));
          });

          it('makes a request to the server', async () => {
            const spy = jest.spyOn(ajax, 'postAPI');
            const { result } = renderHook(() => useNotificationStoresCollection());

            await act(async () => {
              result.current.setStore('read', {});
              await result.current.markAllAsRead();
            });

            expect(spy).toHaveBeenCalledTimes(1);
            spy.mockRestore();
          });

          it('marks all notifications as read', async () => {
            const now = Date.now();
            const spy = jest.spyOn(Date, 'now').mockImplementation(() => now);
            const notifications = NotificationFactory.buildList(3, { readAt: null });

            const { result } = renderHook(() => useNotificationStoresCollection());

            await act(async () => {
              result.current.setStore('unread', {}, { notifications });
              await result.current.markAllAsRead();
            });

            const store = result.current.stores['unread'];

            expect(store.notifications[0].readAt).toEqual(now / 1000);
            expect(store.notifications[1].readAt).toEqual(now / 1000);
            expect(store.notifications[2].readAt).toEqual(now / 1000);
            spy.mockRestore();
          });

          describe('the updateModels options is false', () => {
            it('does not mark any notifications as read', async () => {
              const notifications = NotificationFactory.buildList(3, { readAt: null });
              const { result } = renderHook(() => useNotificationStoresCollection());

              await act(async () => {
                result.current.setStore('read', {}, { notifications });
                await result.current.markAllAsSeen({ updateModels: false });
              });

              const store = result.current.stores['read'];

              expect(store.notifications[0].readAt).toBeNull();
              expect(store.notifications[1].readAt).toBeNull();
              expect(store.notifications[2].readAt).toBeNull();
            });
          });

          describe('the persist option is false', () => {
            it('does not make a request to the server', async () => {
              const spy = jest.spyOn(ajax, 'postAPI');
              const { result } = renderHook(() => useNotificationStoresCollection());

              await act(async () => {
                result.current.setStore('read', {});
                await result.current.markAllAsRead({ persist: false });
              });

              expect(spy).not.toHaveBeenCalled();
              spy.mockRestore();
            });
          });
        });
      });
    });
  });
});
